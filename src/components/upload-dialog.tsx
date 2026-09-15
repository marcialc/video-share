import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, FileVideo, FolderOpen, Loader2, Plus, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { errorMessage } from '@/lib/api'
import { uploadVideo, validateFile, type UploadItem } from '@/lib/upload'
import { cn, formatBytes } from '@/lib/utils'
import type { Folder } from '../../shared/types'

type QueueItem = UploadItem & { file: File }
export function UploadDialog({ open, onOpenChange, folders, defaultFolder, initialFiles, onComplete }: { open: boolean; onOpenChange: (open: boolean) => void; folders: Folder[]; defaultFolder: string | null; initialFiles: File[]; onComplete: () => Promise<void> }) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [folder, setFolder] = useState(defaultFolder || '')
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  function addFiles(files: File[]) {
    const valid: QueueItem[] = []
    for (const file of files) {
      const error = validateFile(file)
      if (error) { toast.error(file.name, { description: error }); continue }
      valid.push({ id: crypto.randomUUID(), name: file.name, file, progress: 0, status: 'waiting' })
    }
    setQueue(previous => [...previous, ...valid])
  }

  useEffect(() => {
    if (open) { setQueue([]); setFolder(defaultFolder || ''); addFiles(initialFiles) }
    // Reset only when opening a new upload session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!uploading) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  function update(id: string, patch: Partial<QueueItem>) { setQueue(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item)) }
  async function start() {
    setUploading(true)
    const abortController = new AbortController()
    controller.current = abortController
    let success = 0
    for (const item of queue.filter(item => item.status !== 'done')) {
      if (abortController.signal.aborted) break
      update(item.id, { status: 'uploading', progress: 0, error: undefined })
      try {
        await uploadVideo(item.file, folder || null, progress => update(item.id, { progress }), abortController.signal)
        update(item.id, { status: 'done', progress: 100 })
        success++
      } catch (error) { update(item.id, { status: 'error', error: abortController.signal.aborted ? 'Canceled. You can try again.' : errorMessage(error) }) }
    }
    setUploading(false)
    controller.current = null
    if (success) { toast.success(`${success} ${success === 1 ? 'video' : 'videos'} added to your library`); await onComplete() }
  }
  const remaining = queue.filter(item => item.status !== 'done').length
  const done = queue.length > 0 && remaining === 0

  return <Dialog open={open} onOpenChange={next => { if (!uploading) onOpenChange(next); else toast.info('Wait for your uploads to finish, or cancel them below.') }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><span className="dialog-icon"><UploadCloud /></span><DialogTitle>Upload videos</DialogTitle><DialogDescription>A new home for your videos. Add a few, or a whole collection.</DialogDescription></DialogHeader>
      <input ref={input} type="file" multiple accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,.mov,.m4v,.ogv" className="sr-only" aria-label="Choose videos to upload" onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = '' }} disabled={uploading} />
      {!done && <button type="button" className={cn('upload-dropzone', dragging && 'is-dragging')} disabled={uploading} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!uploading) addFiles(Array.from(event.dataTransfer.files)) }}>
        <span className="upload-drop-icon"><UploadCloud size={24} /></span><strong>Click to upload <span>or drag and drop</span></strong><small>MP4, MOV, WebM, M4V, OGV · Up to 5 GB each</small>
      </button>}
      {!done && <label className="field-label">Save to folder<div className="relative mt-2"><FolderOpen className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><select aria-label="Upload destination" className="form-select w-full pl-9" value={folder} onChange={event => setFolder(event.target.value)} disabled={uploading}><option value="">No folder</option>{folders.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div></label>}
      {queue.length > 0 && <div className="upload-queue" aria-live="polite">{queue.map(item => <div className="upload-queue-item" key={item.id}><span className={cn('file-type-icon', item.status === 'done' && 'success')}><FileVideo size={20} /></span><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{item.name}</p><div className="flex justify-between gap-2 text-xs text-muted-foreground"><span>{item.error || (item.status === 'done' ? 'Ready to share' : formatBytes(item.file.size))}</span>{item.status === 'uploading' && <span>{item.progress}%</span>}</div>{item.status === 'uploading' && <div className="upload-progress"><div style={{ width: `${item.progress}%` }} /></div>}</div>{item.status === 'done' ? <Check className="size-4 text-emerald-600" /> : item.status === 'uploading' ? <Loader2 className="size-4 animate-spin text-primary" /> : uploading ? null : <Button variant="ghost" size="icon" aria-label={`Remove ${item.name}`} onClick={() => setQueue(previous => previous.filter(entry => entry.id !== item.id))}>{item.status === 'error' ? <CircleAlert className="text-destructive" /> : <X />}</Button>}</div>)}</div>}
      <div className="flex items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">{queue.length ? `${queue.length} ${queue.length === 1 ? 'video' : 'videos'} selected` : 'Your videos stay private until you share.'}</span>{uploading ? <Button variant="outline" onClick={() => controller.current?.abort()}>Cancel uploads</Button> : done ? <Button onClick={() => onOpenChange(false)}><Check />All done</Button> : <Button onClick={() => void start()} disabled={!remaining}><Plus />Upload{remaining > 0 ? ` ${remaining} ${remaining === 1 ? 'video' : 'videos'}` : ''}</Button>}</div>
    </DialogContent>
  </Dialog>
}
