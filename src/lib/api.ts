export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function api<T = { ok: boolean }>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    if (response.status === 401 && path !== '/api/session') window.dispatchEvent(new Event('frame:unauthorized'))
    throw new ApiError(body.error || 'Couldn’t connect. Please try again.', response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.' }
