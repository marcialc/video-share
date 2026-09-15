import { timingSafeEqual } from 'node:crypto'
import { HttpError, json, readJson } from './http'

const encoder = new TextEncoder()
const SESSION_SECONDS = 60 * 60 * 24 * 7

export function isLocal(request: Request, env: Env): boolean {
  return env.DEV_MODE === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

async function signingKey(env: Env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function authenticated(request: Request, env: Env): Promise<boolean> {
  if (isLocal(request, env)) return true
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) return false
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('frame_session='))?.slice(14)
  if (!cookie) return false
  const [expires, signature] = cookie.split('.')
  if (!/^\d+$/.test(expires) || !signature || Number(expires) <= Date.now() / 1000 || Number(expires) > Date.now() / 1000 + SESSION_SECONDS + 60) return false
  try {
    const bytes = Uint8Array.from(atob(signature), char => char.charCodeAt(0))
    return await crypto.subtle.verify('HMAC', await signingKey(env), bytes, encoder.encode(`frame-session:${expires}`))
  } catch { return false }
}

function cookie(value: string, request: Request, age: number) {
  return `frame_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
}

export async function session(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return json({ authenticated: await authenticated(request, env), local: isLocal(request, env), configured: isLocal(request, env) || Boolean(env.ADMIN_PASSWORD?.length >= 8) })
  if (request.method === 'DELETE') return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', request, 0) } })
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) throw new HttpError(503, 'Set an ADMIN_PASSWORD of at least 8 characters in your Cloudflare Worker secrets.')
  const { password } = await readJson(request)
  if (typeof password !== 'string' || password.length > 1024) throw new HttpError(400, 'Enter your library password.')
  const ip = request.headers.get('CF-Connecting-IP') || 'local'
  const ipHash = Array.from(await digest(ip), b => b.toString(16).padStart(2, '0')).join('')
  const now = Math.floor(Date.now() / 1000)
  const result = await env.DB.prepare(`
    INSERT INTO login_attempts (ip_hash, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(ip_hash) DO UPDATE SET
      attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
      window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts
  `).bind(ipHash, now, now - 900, now - 900).first<{ attempts: number }>()
  if ((result?.attempts ?? 11) > 10) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.')
  if (!timingSafeEqual(await digest(password), await digest(env.ADMIN_PASSWORD))) throw new HttpError(401, 'That password doesn’t look right. Try again.')
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash = ? OR window_start < ?').bind(ipHash, now - 900).run()
  const expires = String(now + SESSION_SECONDS)
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`frame-session:${expires}`)))
  return new Response(JSON.stringify({ authenticated: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie(`${expires}.${btoa(String.fromCharCode(...signature))}`, request, SESSION_SECONDS) } })
}
