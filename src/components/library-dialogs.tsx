import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, FolderPlus, Link2, Loader2, LockKeyhole, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Folder, FolderColor, Video } from '../../shared/types'

export type LibraryAction = { type: 'new-folder' } | { type: 'rename-folder' | 'delete-folder'; folder: Folder } | { type: 'rename-video' | 'move-video' | 'delete-video' | 'share'; video: Video } | null

export function LibraryDialogs({ action, close, folders, refresh }: { action: LibraryAction; close: () => void; folders: Folder[]; refresh: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<FolderColor>('violet')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    setName(action && 'folder' in action ? action.folder.name : action && 'video' in action ? action.video.name : '')
    setDestination(action && 'video' in action ? action.video.folder_id || '' : '')
    setToken(action && 'video' in action ? action.video.share_token : null)
    setColor('violet'); setCopied(false)
  }, [action])
  if (!action) return null
  const type = action.type
  const title = { 'new-folder': 'A little more organized.', 'rename-folder': 'Rename folder', 'delete-folder': 'Delete this folder?', 'rename-video': 'Rename video', 'move-video': 'Move to folder', 'delete-video': 'Delete this video?', share: 'Good videos are meant to be shared.' }[type]
  const description = { 'new-folder': 'Give your next collection a home.', 'rename-folder': 'A new name for the same collection.', 'delete-folder': 'Your videos will stay in your library, outside of a folder.', 'rename-video': 'Choose a name that’s easy to find.', 'move-video': 'Keep related videos together.', 'delete-video': 'This permanently deletes the video and turns off its share link.', share: 'Create a link so anyone you send it to can watch and download.' }[type]
  const deleting = type === 'delete-folder' || type === 'delete-video'
  const url = token ? `${window.location.origin}/s/${token}` : ''

  async function save() {
    if (!action) return
    setBusy(true)
    try {
      if (action.type === 'new-folder') await api('/api/folders', { method: 'POST', body: JSON.stringify({ name, color }) })
      if (action.type === 'rename-folder') await api(`/api/folders/${action.folder.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      if (action.type === 'rename-video') await api(`/api/videos/${action.video.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      if (action.type === 'move-video') await api(`/api/videos/${action.video.id}`, { method: 'PATCH', body: JSON.stringify({ folderId: destination || null }) })
      if (action.type === 'delete-folder') await api(`/api/folders/${action.folder.id}`, { method: 'DELETE' })
      if (action.type === 'delete-video') await api(`/api/videos/${action.video.id}`, { method: 'DELETE' })
      toast.success(action.type === 'new-folder' ? 'Folder created' : deleting ? 'Deleted' : 'Changes saved')
      await refresh(); close()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function toggleShare() {
    if (!action || !('video' in action)) return
    setBusy(true)
    try {
      if (token) { await api(`/api/videos/${action.video.id}/share`, { method: 'DELETE' }); setToken(null); toast.success('Share link turned off') }
      else { const result = await api<{ token: string }>(`/api/videos/${action.video.id}/share`, { method: 'POST' }); setToken(result.token); toast.success('Your share link is ready') }
      await refresh()
    } catch (error) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Link copied') }
    catch { toast.error('Select and copy the link below.') }
  }

  return <Dialog open onOpenChange={next => { if (!next && !busy) close() }}><DialogContent className={type === 'share' ? 'max-w-lg' : ''}>
    <DialogHeader><span className={cn('dialog-icon', deleting && 'danger')}>{type === 'share' ? <Link2 /> : deleting ? <Trash2 /> : <FolderPlus />}</span><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    {type === 'share' ? <><div className="share-video-name">{'video' in action && action.video.name}</div><div className="share-status"><span className={cn('share-status-icon', token && 'enabled')}>{token ? <Link2 size={19} /> : <LockKeyhole size={19} />}</span><div><strong>{token ? 'Anyone with the link' : 'Only you, for now'}</strong><p>{token ? 'No account needed to watch.' : 'This video is private.'}</p></div><span className={cn('status-pill', token && 'active')}>{token ? 'Sharing on' : 'Private'}</span></div>{token && <div className="flex gap-2"><Input aria-label="Video share link" readOnly value={url} onFocus={event => event.target.select()} /><Button aria-label="Copy share link" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</Button><Button variant="outline" size="icon" className="size-10" asChild><a href={url} target="_blank" rel="noreferrer" aria-label="Open shared video"><ExternalLink /></a></Button></div>}<DialogFooter><Button variant={token ? 'outline' : 'default'} disabled={busy} onClick={() => void toggleShare()}>{busy && <Loader2 className="animate-spin" />}{token ? 'Turn off link' : 'Create share link'}</Button></DialogFooter></> : <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-5">
      {deleting ? <div className="rounded-lg border bg-muted/50 p-3 text-sm font-medium break-words">{name}</div> : type === 'move-video' ? <label className="field-label">Folder<select className="form-select mt-2 w-full" value={destination} onChange={event => setDestination(event.target.value)}><option value="">No folder</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label> : <label className="field-label">{type === 'new-folder' || type === 'rename-folder' ? 'Folder name' : 'Video name'}<Input className="mt-2" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={type === 'new-folder' ? 'e.g. Weekend adventures' : 'Enter a name'} required maxLength={type === 'rename-video' ? 180 : 120} /></label>}
      {type === 'new-folder' && <div><p className="field-label mb-3">Folder color</p><div className="flex gap-2.5" role="group" aria-label="Folder color">{(['violet', 'blue', 'amber', 'green', 'rose'] as const).map(value => <button key={value} type="button" aria-label={value} aria-pressed={color === value} className={cn('color-choice', `color-${value}`, color === value && 'selected')} onClick={() => setColor(value)}>{color === value && <Check size={16} />}</button>)}</div></div>}
      <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant={deleting ? 'destructive' : 'default'} disabled={busy || (!deleting && type !== 'move-video' && !name.trim())}>{busy && <Loader2 className="animate-spin" />}{deleting ? 'Delete' : type === 'new-folder' ? 'Create folder' : type === 'move-video' ? 'Move video' : 'Save changes'}</Button></DialogFooter>
    </form>}
  </DialogContent></Dialog>
}
