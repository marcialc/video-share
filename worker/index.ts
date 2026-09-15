import { CHUNK_SIZE, MAX_FILE_SIZE, VIDEO_TYPES } from '../shared/types'
import type { Folder, PublicVideo, Video } from '../shared/types'
import { authenticated, session } from './auth'
import { HttpError, json, readJson, secure, validName } from './http'

interface VideoRow extends Video { object_key: string; upload_id: string | null; status: 'uploading' | 'ready' }
const PUBLIC_COLUMNS = 'id, name, original_name, folder_id, mime_type, size, duration, thumbnail_key, share_token, created_at'

function publicVideo(video: VideoRow): PublicVideo {
  return { name: video.name, original_name: video.original_name, mime_type: video.mime_type, size: video.size, duration: video.duration, has_thumbnail: Boolean(video.thumbnail_key) }
}

async function getVideo(env: Env, id: string): Promise<VideoRow> {
  const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first<VideoRow>()
  if (!video) throw new HttpError(404, 'Video not found.')
  return video
}

async function folderId(env: Env, value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !await env.DB.prepare('SELECT id FROM folders WHERE id = ?').bind(value).first()) throw new HttpError(400, 'Folder not found.')
  return value
}

async function media(request: Request, env: Env, video: VideoRow, thumbnail: boolean): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed.')
  const key = thumbnail ? video.thumbnail_key : video.object_key
  if (!key) throw new HttpError(404, 'Preview not available.')
  const meta = await env.VIDEOS.head(key)
  if (!meta) throw new HttpError(404, 'File not found.')
  const headers = new Headers({ 'Content-Type': thumbnail ? 'image/jpeg' : video.mime_type, 'Accept-Ranges': 'bytes', ETag: meta.httpEtag })
  if (new URL(request.url).searchParams.has('download') && !thumbnail) {
    const filename = video.original_name.replace(/[^\x20-\x7E]|["\\]/g, '_')
    headers.set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(video.original_name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16))}`)
  }
  let range: { offset: number; length: number } | undefined
  const requested = request.headers.get('range')
  const ifRange = request.headers.get('if-range')
  if (requested && (!ifRange || ifRange === meta.httpEtag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requested)
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } })
    const start = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]))
    const end = match[1] && match[2] ? Math.min(Number(match[2]), meta.size - 1) : meta.size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= meta.size || (!match[1] && Number(match[2]) === 0)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${meta.size}` } })
    range = { offset: start, length: end - start + 1 }
    headers.set('Content-Range', `bytes ${start}-${end}/${meta.size}`)
  }
  headers.set('Content-Length', String(range?.length ?? meta.size))
  if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers })
  const object = await env.VIDEOS.get(key, range ? { range } : undefined)
  if (!object) throw new HttpError(404, 'File not found.')
  return new Response(object.body, { status: range ? 206 : 200, headers })
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request)
  if (!['GET', 'HEAD'].includes(method)) {
    const origin = request.headers.get('origin')
    if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Cross-origin requests are not allowed.')
  }
  if (path === '/api/session') return session(request, env)

  const shared = /^\/api\/shared\/([a-f0-9-]{36})(?:\/(media|thumbnail))?$/.exec(path)
  if (shared) {
    if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Method not allowed.')
    const video = await env.DB.prepare("SELECT * FROM videos WHERE share_token = ? AND status = 'ready'").bind(shared[1]).first<VideoRow>()
    if (!video) throw new HttpError(404, 'This link is unavailable. It may have been turned off by the owner.')
    if (shared[2]) return media(request, env, video, shared[2] === 'thumbnail')
    return json(publicVideo(video))
  }

  const sharedFolder = /^\/api\/shared-folders\/([a-f0-9-]{36})(?:\/videos\/([a-f0-9-]{36})\/(media|thumbnail))?$/.exec(path)
  if (sharedFolder) {
    if (!['GET', 'HEAD'].includes(method)) throw new HttpError(405, 'Method not allowed.')
    const folder = await env.DB.prepare('SELECT id, name, color FROM folders WHERE share_token = ?').bind(sharedFolder[1]).first<Pick<Folder, 'id' | 'name' | 'color'>>()
    if (!folder) throw new HttpError(404, 'This folder link is unavailable. It may have been turned off by the owner.')
    if (sharedFolder[2]) {
      // Recheck membership on every request so moves and revocation remove access.
      const video = await env.DB.prepare("SELECT * FROM videos WHERE id = ? AND folder_id = ? AND status = 'ready'").bind(sharedFolder[2], folder.id).first<VideoRow>()
      if (!video) throw new HttpError(404, 'This video is no longer available in this folder.')
      return media(request, env, video, sharedFolder[3] === 'thumbnail')
    }
    const videos = await env.DB.prepare("SELECT * FROM videos WHERE folder_id = ? AND status = 'ready' ORDER BY created_at DESC, id DESC").bind(folder.id).all<VideoRow>()
    return json({ name: folder.name, color: folder.color, videos: videos.results.map(video => ({ id: video.id, ...publicVideo(video) })) })
  }

  if (!await authenticated(request, env)) throw new HttpError(401, 'Sign in to your library to continue.')

  if (path === '/api/library' && method === 'GET') {
    const [folders, videos] = await env.DB.batch([
      env.DB.prepare("SELECT f.*, COUNT(v.id) AS video_count, COALESCE(SUM(v.size), 0) AS total_size FROM folders f LEFT JOIN videos v ON v.folder_id = f.id AND v.status = 'ready' GROUP BY f.id ORDER BY f.created_at ASC"),
      env.DB.prepare(`SELECT ${PUBLIC_COLUMNS} FROM videos WHERE status = 'ready' ORDER BY created_at DESC`),
    ])
    return json({ folders: folders.results, videos: videos.results })
  }

  if (path === '/api/folders' && method === 'POST') {
    const body = await readJson(request)
    const id = crypto.randomUUID()
    const name = validName(body.name, 120)
    const color = typeof body.color === 'string' && ['violet', 'blue', 'amber', 'green', 'rose'].includes(body.color) ? body.color : 'violet'
    await env.DB.prepare('INSERT INTO folders (id, name, color) VALUES (?, ?, ?)').bind(id, name, color).run()
    return json({ id, name, color }, 201)
  }
  const folderShare = /^\/api\/folders\/([^/]+)\/share$/.exec(path)
  if (folderShare) {
    if (!['POST', 'DELETE'].includes(method)) throw new HttpError(405, 'Method not allowed.')
    const result = await env.DB.prepare(method === 'POST'
      ? 'UPDATE folders SET share_token = COALESCE(share_token, ?) WHERE id = ? RETURNING share_token'
      : 'UPDATE folders SET share_token = ? WHERE id = ? RETURNING share_token')
      .bind(method === 'POST' ? crypto.randomUUID() : null, folderShare[1]).first<{ share_token: string | null }>()
    if (!result) throw new HttpError(404, 'Folder not found.')
    return json(method === 'POST' ? { token: result.share_token } : { ok: true })
  }
  const folderMatch = /^\/api\/folders\/([^/]+)$/.exec(path)
  if (folderMatch) {
    await folderId(env, folderMatch[1])
    if (method === 'PATCH') {
      const body = await readJson(request)
      await env.DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(validName(body.name, 120), folderMatch[1]).run()
      return json({ ok: true })
    }
    if (method === 'DELETE') {
      // The foreign key keeps all videos and moves them back to the library.
      await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(folderMatch[1]).run()
      return json({ ok: true })
    }
  }

  if (path === '/api/uploads' && method === 'POST') {
    const body = await readJson(request)
    const name = validName(body.name)
    const originalName = validName(body.originalName, 255)
    if (typeof body.size !== 'number' || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > MAX_FILE_SIZE) throw new HttpError(400, 'Videos must be between 1 byte and 5 GB.')
    if (typeof body.mimeType !== 'string' || !VIDEO_TYPES.includes(body.mimeType)) throw new HttpError(400, 'Choose an MP4, MOV, WebM, M4V, or OGV video.')
    const folder = await folderId(env, body.folderId)
    const id = crypto.randomUUID()
    const key = `videos/${id}`
    const upload = await env.VIDEOS.createMultipartUpload(key, { httpMetadata: { contentType: body.mimeType } })
    try {
      await env.DB.prepare('INSERT INTO videos (id, name, original_name, folder_id, object_key, mime_type, size, duration, upload_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, name, originalName, folder, key, body.mimeType, body.size, typeof body.duration === 'number' && Number.isFinite(body.duration) && body.duration >= 0 ? body.duration : null, upload.uploadId).run()
    } catch (error) { await upload.abort(); throw error }
    return json({ id, chunkSize: CHUNK_SIZE }, 201)
  }

  const uploadMatch = /^\/api\/uploads\/([^/]+)(?:\/(parts\/([0-9]+)|complete))?$/.exec(path)
  if (uploadMatch) {
    const video = await getVideo(env, uploadMatch[1])
    // A repeated completion request is safe if the previous response was lost.
    if (uploadMatch[2] === 'complete' && method === 'POST' && video.status === 'ready') return json({ id: video.id })
    if (video.status !== 'uploading' || !video.upload_id) throw new HttpError(409, 'This upload is already complete.')
    const upload = env.VIDEOS.resumeMultipartUpload(video.object_key, video.upload_id)
    if (uploadMatch[3] && method === 'PUT') {
      const part = Number(uploadMatch[3])
      const count = Math.ceil(video.size / CHUNK_SIZE)
      if (!Number.isInteger(part) || part < 1 || part > count) throw new HttpError(400, 'Invalid upload part.')
      const expectedSize = part === count ? video.size - (part - 1) * CHUNK_SIZE : CHUNK_SIZE
      if (!request.body || Number(request.headers.get('content-length')) !== expectedSize) throw new HttpError(400, 'The upload part has an unexpected size.')
      const uploaded = await upload.uploadPart(part, request.body)
      return json({ partNumber: uploaded.partNumber, etag: uploaded.etag })
    }
    if (uploadMatch[2] === 'complete' && method === 'POST') {
      const { parts } = await readJson(request, 1024 * 1024)
      if (!Array.isArray(parts) || parts.length !== Math.ceil(video.size / CHUNK_SIZE)) throw new HttpError(400, 'Some upload parts are missing.')
      const validated: R2UploadedPart[] = parts.map((part: unknown, i: number) => {
        if (!part || typeof part !== 'object' || !('partNumber' in part) || part.partNumber !== i + 1 || !('etag' in part) || typeof part.etag !== 'string' || !part.etag || part.etag.length > 1024) throw new HttpError(400, 'Invalid upload parts.')
        return { partNumber: i + 1, etag: part.etag }
      })
      // Recover if R2 completed but the D1 update failed on a previous attempt.
      const object = await env.VIDEOS.head(video.object_key) ?? await upload.complete(validated)
      if (object.size !== video.size) {
        await env.VIDEOS.delete(video.object_key)
        await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(video.id).run()
        throw new HttpError(400, 'Upload size did not match. Please try again.')
      }
      await env.DB.prepare("UPDATE videos SET status = 'ready', upload_id = NULL WHERE id = ?").bind(video.id).run()
      return json({ id: video.id })
    }
    if (!uploadMatch[2] && method === 'DELETE') {
      await upload.abort()
      await env.VIDEOS.delete(video.object_key)
      await env.DB.prepare("DELETE FROM videos WHERE id = ? AND status = 'uploading'").bind(video.id).run()
      return json({ ok: true })
    }
  }

  const videoMatch = /^\/api\/videos\/([^/]+)(?:\/(media|thumbnail|share))?$/.exec(path)
  if (videoMatch) {
    const video = await getVideo(env, videoMatch[1])
    if (video.status !== 'ready') throw new HttpError(404, 'Video is not ready yet.')
    const action = videoMatch[2]
    if (action === 'media' || (action === 'thumbnail' && ['GET', 'HEAD'].includes(method))) return media(request, env, video, action === 'thumbnail')
    if (action === 'thumbnail' && method === 'PUT') {
      const size = Number(request.headers.get('content-length'))
      if (!request.body || size < 1 || size > 1024 * 1024 || request.headers.get('content-type') !== 'image/jpeg') throw new HttpError(400, 'Preview must be a JPEG smaller than 1 MB.')
      const key = `thumbnails/${video.id}.jpg`
      await env.VIDEOS.put(key, request.body, { httpMetadata: { contentType: 'image/jpeg' } })
      await env.DB.prepare('UPDATE videos SET thumbnail_key = ? WHERE id = ?').bind(key, video.id).run()
      return json({ ok: true })
    }
    if (action === 'share' && method === 'POST') {
      await env.DB.prepare('UPDATE videos SET share_token = COALESCE(share_token, ?) WHERE id = ?').bind(crypto.randomUUID(), video.id).run()
      const updated = await getVideo(env, video.id)
      return json({ token: updated.share_token })
    }
    if (action === 'share' && method === 'DELETE') {
      await env.DB.prepare('UPDATE videos SET share_token = NULL WHERE id = ?').bind(video.id).run()
      return json({ ok: true })
    }
    if (!action && method === 'PATCH') {
      const body = await readJson(request)
      const name = body.name === undefined ? video.name : validName(body.name)
      const folder = body.folderId === undefined ? video.folder_id : await folderId(env, body.folderId)
      await env.DB.prepare('UPDATE videos SET name = ?, folder_id = ? WHERE id = ?').bind(name, folder, video.id).run()
      return json({ ok: true })
    }
    if (!action && method === 'DELETE') {
      // Revoke access before deleting bytes; a failed deletion can be retried.
      await env.DB.prepare('UPDATE videos SET share_token = NULL WHERE id = ?').bind(video.id).run()
      await env.VIDEOS.delete([video.object_key, ...(video.thumbnail_key ? [video.thumbnail_key] : [])])
      await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(video.id).run()
      return json({ ok: true })
    }
  }
  throw new HttpError(404, 'Not found.')
}

export default {
  async fetch(request, env): Promise<Response> {
    try { return secure(await route(request, env)) }
    catch (error) {
      if (error instanceof HttpError) return secure(json({ error: error.message }, error.status))
      console.error(JSON.stringify({ event: 'request_error', method: request.method, message: error instanceof Error ? error.message : 'Unknown error' }))
      return secure(json({ error: 'Something went wrong. Please try again.' }, 500))
    }
  },
} satisfies ExportedHandler<Env>
