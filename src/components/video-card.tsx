import { Download, Ellipsis, FolderInput, FolderOpen, Link2, Pencil, Play, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { formatBytes, formatDate, formatDuration } from '@/lib/utils'
import type { Video } from '../../shared/types'
import type { LibraryAction } from './library-dialogs'

export function VideoCard({ video, folderName, view, onPlay, onAction }: { video: Video; folderName?: string; view: 'grid' | 'list'; onPlay: () => void; onAction: (action: LibraryAction) => void }) {
  return <article className={`video-card ${view === 'list' ? 'video-row' : ''}`}>
    <button className="video-thumbnail" aria-label={`Play ${video.name}`} onClick={onPlay}>
      {video.thumbnail_key ? <img src={`/api/videos/${video.id}/thumbnail`} alt="" loading="lazy" /> : <div className="thumbnail-placeholder"><span className="placeholder-orbit" /><Play size={32} fill="currentColor" strokeWidth={1} /></div>}
      <span className="video-play"><Play size={20} fill="currentColor" /></span><span className="video-duration">{formatDuration(video.duration)}</span>
      {video.share_token && <span className="video-shared"><Link2 size={11} />Shared</span>}
    </button>
    <div className="video-info"><button className="video-title" onClick={onPlay}>{video.name}</button><div className="video-details"><span>{formatBytes(video.size)}</span><span className="detail-dot">·</span><span>{formatDate(video.created_at)}</span></div><span className="video-folder"><FolderOpen size={12} />{folderName || 'No folder'}</span></div>
    <div className="video-actions"><Button variant="ghost" size="icon" aria-label={`Share ${video.name}`} title="Share video" onClick={() => onAction({ type: 'share', video })}><Link2 /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Options for ${video.name}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={onPlay}><Play />Play video</DropdownMenuItem><DropdownMenuItem onSelect={() => onAction({ type: 'share', video })}><Link2 />Share link</DropdownMenuItem><DropdownMenuItem onSelect={() => onAction({ type: 'rename-video', video })}><Pencil />Rename</DropdownMenuItem><DropdownMenuItem onSelect={() => onAction({ type: 'move-video', video })}><FolderInput />Move to folder</DropdownMenuItem><DropdownMenuItem asChild><a href={`/api/videos/${video.id}/media?download`} download><Download />Download original</a></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:bg-red-50 focus:text-destructive" onSelect={() => onAction({ type: 'delete-video', video })}><Trash2 />Delete video</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  </article>
}
