export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export async function readJson(request: Request, limit = 64 * 1024): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Expected JSON.')
  if (!request.body) throw new HttpError(400, 'A request body is required.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new HttpError(413, 'Request is too large.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data as Record<string, unknown>
  } catch { throw new HttpError(400, 'Invalid JSON.') }
}

export function validName(value: unknown, max = 180): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) {
    throw new HttpError(400, `Enter a name between 1 and ${max} characters.`)
  }
  return value.trim()
}

export function json(data: unknown, status = 200): Response { return Response.json(data, { status }) }

export function secure(response: Response): Response {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  return response
}
