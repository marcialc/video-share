import { api, ApiError } from './api'
import { MAX_FILE_SIZE, VIDEO_TYPES } from '../../shared/types'

export interface UploadItem { id: string; name: string; progress: number; status: 'waiting' | 'uploading' | 'done' | 'error'; error?: string }

function mimeType(file: File) {
  const extensions: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v', ogv: 'video/ogg' }
  return VIDEO_TYPES.includes(file.type) ? file.type : extensions[file.name.split('.').pop()?.toLowerCase() ?? '']
}

export function validateFile(file: File) {
  if (!mimeType(file)) return 'Choose an MP4, MOV, WebM, M4V, or OGV video.'
  if (file.size > MAX_FILE_SIZE) return 'This video is larger than 5 GB.'
  if (file.size === 0) return 'This file is empty.'
  return null
}

async function videoMetadata(file: File): Promise<{ duration: number | null; thumbnail: Blob | null }> {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let duration: number | null = null
    let finished = false
    const finish = (thumbnail: Blob | null = null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve({ duration, thumbnail })
    }
    const timer = window.setTimeout(() => finish(), 6000)
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : null
      video.currentTime = Math.min(1, (duration || 1) / 3)
    }
    video.onseeked = () => {
      if (!video.videoWidth) return finish()
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = Math.round(640 * video.videoHeight / video.videoWidth)
      if (canvas.height > 1280) { canvas.width = Math.round(1280 * video.videoWidth / video.videoHeight); canvas.height = 1280 }
      try {
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.8)
      } catch { finish() }
    }
    video.onerror = () => finish()
    video.src = url
  })
}

function uploadPart(path: string, chunk: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<{ partNumber: number; etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    if (signal.aborted) return reject(new DOMException('Upload canceled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    xhr.open('PUT', path)
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.timeout = 180000
    xhr.upload.onprogress = event => onProgress(event.loaded)
    xhr.onloadend = () => signal.removeEventListener('abort', abort)
    xhr.onabort = () => reject(new DOMException('Upload canceled', 'AbortError'))
    xhr.onerror = () => reject(new Error('Connection interrupted.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out.'))
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(body)
        else reject(new ApiError(body.error || 'Upload failed.', xhr.status))
      } catch { reject(new Error('Invalid response from server.')) }
    }
    xhr.send(chunk)
  })
}

export async function uploadVideo(file: File, folderId: string | null, onProgress: (progress: number) => void, signal: AbortSignal): Promise<void> {
  const validation = validateFile(file)
  if (validation) throw new Error(validation)
  const metadata = await videoMetadata(file)
  signal.throwIfAborted()
  const { id, chunkSize } = await api<{ id: string; chunkSize: number }>('/api/uploads', { method: 'POST', signal, body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 180) || 'Untitled video', originalName: file.name, size: file.size, mimeType: mimeType(file), folderId, duration: metadata.duration }) })
  let completed = false
  try {
    const parts: { partNumber: number; etag: string }[] = []
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      signal.throwIfAborted()
      const chunk = file.slice(offset, offset + chunkSize)
      const partNumber = parts.length + 1
      let uploaded = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          parts.push(await uploadPart(`/api/uploads/${id}/parts/${partNumber}`, chunk, loaded => onProgress(Math.min(98, Math.round((offset + loaded) / file.size * 98))), signal))
          uploaded = true
          break
        } catch (error) {
          if (signal.aborted || attempt === 2 || (error instanceof ApiError && error.status < 500)) throw error
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000))
          signal.throwIfAborted()
        }
      }
      if (!uploaded) throw new Error('Couldn’t upload this video.')
    }
    signal.throwIfAborted()
    // Completion is intentionally not abortable: a completed video must not be removed on cancellation.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await api(`/api/uploads/${id}/complete`, { method: 'POST', body: JSON.stringify({ parts }) })
        break
      } catch (error) {
        if (attempt === 2 || (error instanceof ApiError && error.status < 500)) throw error
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000))
      }
    }
    completed = true
    if (metadata.thumbnail) {
      // A missing preview must not make a successful video upload look like a failure.
      await api(`/api/videos/${id}/thumbnail`, { method: 'PUT', body: metadata.thumbnail, headers: { 'Content-Type': 'image/jpeg' } }).catch(() => undefined)
    }
    onProgress(100)
  } catch (error) {
    if (!completed) await api(`/api/uploads/${id}`, { method: 'DELETE' }).catch(() => undefined)
    throw error
  }
}
