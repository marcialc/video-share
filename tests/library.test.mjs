import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let runtime
let cookie
const origin = 'https://frame.test'
const password = 'testpass' // Exercise sign-in and cookies at the eight-character minimum.
const bytes = Buffer.alloc(10 * 1024 * 1024 + 37, 42)

function request(path, { method = 'GET', data, body, headers = {}, authenticated = true } = {}) {
  return runtime.dispatchFetch(origin + path, {
    method,
    headers: { ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' && method !== 'HEAD' ? { Origin: origin } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: data ? JSON.stringify(data) : body,
  })
}

async function jsonResponse(path, options, expected = 200) {
  const response = await request(path, options)
  const data = await response.json()
  assert.equal(response.status, expected, JSON.stringify(data))
  return data
}

before(async () => {
  runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'frame-test',
    modules: true,
    scriptPath: new URL('../dist/video_share/index.js', import.meta.url).pathname,
    compatibilityDate: '2026-09-14',
    compatibilityFlags: ['nodejs_compat'],
    bindings: { DEV_MODE: 'false', ADMIN_PASSWORD: password },
    d1Databases: ['DB'],
    r2Buckets: ['VIDEOS'],
  }))
  const db = await runtime.getD1Database('DB')
  const sql = await readFile(new URL('../migrations/0001_library.sql', import.meta.url), 'utf8')
  await db.exec(sql.replace(/\n/g, ' '))
}, { timeout: 30000 })
after(async () => { await runtime?.dispose() })

test('private library requires a valid owner session and rejects cross-origin changes', async () => {
  assert.equal((await jsonResponse('/api/session', { authenticated: false })).configured, true)
  assert.equal((await request('/api/library', { authenticated: false })).status, 401)
  assert.equal((await request('/api/session', { method: 'POST', data: { password: 'wrong-password' } })).status, 401)
  const login = await request('/api/session', { method: 'POST', data: { password } })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
  assert.match(login.headers.get('set-cookie'), /Secure/)
  cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await jsonResponse('/api/session')).authenticated, true)
  assert.equal((await request('/api/library', { headers: { Cookie: `${cookie}tampered` } })).status, 401)
  assert.equal((await request('/api/folders', { method: 'POST', data: { name: 'blocked' }, headers: { Origin: 'https://elsewhere.test' } })).status, 403)
})

test('multipart video lifecycle: organize, seek, share, revoke, and delete', { timeout: 30000 }, async () => {
  const first = await jsonResponse('/api/folders', { method: 'POST', data: { name: 'Weekend adventures', color: 'blue' } }, 201)
  const second = await jsonResponse('/api/folders', { method: 'POST', data: { name: 'Favorites', color: 'violet' } }, 201)
  const upload = await jsonResponse('/api/uploads', { method: 'POST', data: { name: 'Weekend film', originalName: 'Weekend film.mp4', size: bytes.length, mimeType: 'video/mp4', folderId: first.id, duration: 18 } }, 201)
  assert.equal((await request(`/api/videos/${upload.id}/media`)).status, 404)
  assert.equal((await jsonResponse('/api/library')).videos.length, 0)
  const parts = []
  for (let offset = 0; offset < bytes.length; offset += upload.chunkSize) {
    const part = bytes.subarray(offset, offset + upload.chunkSize)
    parts.push(await jsonResponse(`/api/uploads/${upload.id}/parts/${parts.length + 1}`, { method: 'PUT', body: part, headers: { 'Content-Length': String(part.length), 'Content-Type': 'application/octet-stream' } }))
  }
  assert.ok(parts.every((part, index) => part.partNumber === index + 1 && typeof part.etag === 'string' && part.etag.length > 0), 'Each uploaded part must have its number and opaque ETag.')
  await jsonResponse(`/api/uploads/${upload.id}/complete`, { method: 'POST', data: { parts } })
  await jsonResponse(`/api/uploads/${upload.id}/complete`, { method: 'POST', data: { parts } })
  let library = await jsonResponse('/api/library')
  assert.equal(library.videos.length, 1)
  assert.equal(library.folders.find(f => f.id === first.id).video_count, 1)
  assert.equal(library.videos[0].size, bytes.length)
  await jsonResponse(`/api/videos/${upload.id}`, { method: 'PATCH', data: { name: 'A weekend to remember', folderId: second.id } })
  await jsonResponse(`/api/folders/${second.id}`, { method: 'PATCH', data: { name: 'Best moments' } })
  library = await jsonResponse('/api/library')
  assert.equal(library.videos[0].name, 'A weekend to remember')
  assert.equal(library.videos[0].folder_id, second.id)
  assert.equal(library.folders.find(f => f.id === first.id).video_count, 0)
  assert.equal(library.folders.find(f => f.id === second.id).name, 'Best moments')
  const range = await request(`/api/videos/${upload.id}/media`, { headers: { Range: 'bytes=3-19' } })
  assert.equal(range.status, 206)
  assert.equal(range.headers.get('content-range'), `bytes 3-19/${bytes.length}`)
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(3, 20))
  const suffix = await request(`/api/videos/${upload.id}/media`, { headers: { Range: 'bytes=-12' } })
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-12))
  assert.equal((await request(`/api/videos/${upload.id}/media`, { headers: { Range: `bytes=${bytes.length}-` } })).status, 416)
  assert.equal((await request(`/api/videos/${upload.id}/media`, { headers: { Range: 'bytes=-0' } })).status, 416)
  const head = await request(`/api/videos/${upload.id}/media?download`, { method: 'HEAD' })
  assert.equal(head.headers.get('content-length'), String(bytes.length))
  assert.match(head.headers.get('content-disposition'), /attachment/)
  assert.equal((await request(`/api/videos/${upload.id}/media`, { authenticated: false })).status, 401)

  const { token } = await jsonResponse(`/api/videos/${upload.id}/share`, { method: 'POST' })
  assert.equal((await jsonResponse(`/api/videos/${upload.id}/share`, { method: 'POST' })).token, token)
  const shared = await jsonResponse(`/api/shared/${token}`, { authenticated: false })
  assert.equal(shared.name, 'A weekend to remember')
  assert.equal('folder_id' in shared, false)
  assert.equal('object_key' in shared, false)
  const publicRange = await request(`/api/shared/${token}/media`, { authenticated: false, headers: { Range: 'bytes=0-9' } })
  assert.equal(publicRange.status, 206)
  assert.equal(publicRange.headers.get('cache-control'), 'private, no-store')
  assert.equal((await publicRange.arrayBuffer()).byteLength, 10)
  await jsonResponse(`/api/videos/${upload.id}/share`, { method: 'DELETE' })
  assert.equal((await request(`/api/shared/${token}/media`, { authenticated: false })).status, 404)
  assert.equal((await request(`/api/shared/${token}`, { authenticated: false })).status, 404)
  const newShare = await jsonResponse(`/api/videos/${upload.id}/share`, { method: 'POST' })
  assert.notEqual(newShare.token, token)
  await jsonResponse(`/api/folders/${second.id}`, { method: 'DELETE' })
  library = await jsonResponse('/api/library')
  assert.equal(library.videos[0].folder_id, null)
  assert.equal(library.videos.length, 1)
  await jsonResponse(`/api/videos/${upload.id}`, { method: 'DELETE' })
  assert.equal((await request(`/api/shared/${newShare.token}/media`, { authenticated: false })).status, 404)
  assert.equal((await jsonResponse('/api/library')).videos.length, 0)
  const bucket = await runtime.getR2Bucket('VIDEOS')
  assert.equal(await bucket.head(`videos/${upload.id}`), null)
  await jsonResponse(`/api/folders/${first.id}`, { method: 'DELETE' })
})

test('invalid input is rejected, incomplete uploads can be canceled, and login attempts are limited', async () => {
  assert.equal((await request('/api/folders', { method: 'POST', data: { name: '   ' } })).status, 400)
  assert.equal((await request('/api/folders', { method: 'POST', data: { name: 'x'.repeat(121) } })).status, 400)
  assert.equal((await request('/api/uploads', { method: 'POST', data: { name: 'bad', originalName: 'file.html', mimeType: 'text/html', size: 32 } })).status, 400)
  assert.equal((await request('/api/uploads', { method: 'POST', data: { name: 'big', originalName: 'big.mp4', mimeType: 'video/mp4', size: 6 * 1024 ** 3 } })).status, 400)
  const upload = await jsonResponse('/api/uploads', { method: 'POST', data: { name: 'Canceled', originalName: 'canceled.mp4', size: 10, mimeType: 'video/mp4' } }, 201)
  assert.equal((await request(`/api/uploads/${upload.id}/parts/2`, { method: 'PUT', body: Buffer.alloc(10), headers: { 'Content-Length': '10' } })).status, 400)
  assert.equal((await request(`/api/uploads/${upload.id}/complete`, { method: 'POST', data: { parts: [] } })).status, 400)
  await jsonResponse(`/api/uploads/${upload.id}`, { method: 'DELETE' })
  assert.equal((await jsonResponse('/api/library')).videos.length, 0)
  for (let i = 0; i < 10; i++) assert.equal((await request('/api/session', { method: 'POST', data: { password: 'invalid' }, headers: { 'CF-Connecting-IP': '192.0.2.10' } })).status, 401)
  assert.equal((await request('/api/session', { method: 'POST', data: { password }, headers: { 'CF-Connecting-IP': '192.0.2.10' } })).status, 429)
})
