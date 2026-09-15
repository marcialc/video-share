import { useEffect, useState } from 'react'
import { Download, Film, FolderOpen, Link2, Loader2, Play } from 'lucide-react'
import { Brand } from './brand'
import { VideoPlayer } from './player'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { formatBytes, formatDuration } from '@/lib/utils'
import type { PublicFolder, PublicFolderVideo } from '../../shared/types'

export function SharedFolder({ token }: { token: string }) {
  const [folder, setFolder] = useState<PublicFolder | null>(null)
  const [playing, setPlaying] = useState<PublicFolderVideo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api<PublicFolder>(`/api/shared-folders/${token}`)
      .then(result => { if (active) { setFolder(result); document.title = `${result.name} — Frame` } })
      .catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [token])

  const source = playing ? `/api/shared-folders/${token}/videos/${playing.id}/media` : ''
  return <div className="shared-page shared-folder-page">
    <header><Brand /><span><Link2 size={14} />Shared with you</span></header>
    <main>{error ? <div className="shared-error"><span className="dialog-icon"><FolderOpen /></span><h1>This link isn’t available</h1><p>{error}</p></div> : !folder ? <div className="loading-state"><Loader2 className="animate-spin" /><p>Loading the folder…</p></div> : <>
      <div className="shared-folder-heading"><span className={`shared-folder-icon color-${folder.color}`}><FolderOpen size={25} /></span><div><div className="shared-eyebrow">A FOLDER SHARED WITH YOU</div><h1>{folder.name}</h1><p className="shared-meta">{folder.videos.length} {folder.videos.length === 1 ? 'video' : 'videos'} · {formatBytes(folder.videos.reduce((sum, video) => sum + video.size, 0))}</p></div></div>
      {folder.videos.length ? <div className="shared-folder-grid">{folder.videos.map(video => <article className="shared-folder-video" key={video.id}><button className="shared-folder-preview" aria-label={`Play ${video.name}`} onClick={() => setPlaying(video)}>{video.has_thumbnail ? <img src={`/api/shared-folders/${token}/videos/${video.id}/thumbnail`} alt="" loading="lazy" /> : <span className="shared-folder-placeholder"><Film size={28} /></span>}<span className="shared-folder-play"><Play size={17} fill="currentColor" /></span></button><div className="shared-folder-video-info"><button onClick={() => setPlaying(video)}>{video.name}</button><p>{formatBytes(video.size)}{video.duration !== null && ` · ${formatDuration(video.duration)}`}</p><Button variant="outline" size="sm" asChild><a href={`/api/shared-folders/${token}/videos/${video.id}/media?download`} download><Download size={14} />Download</a></Button></div></article>)}</div> : <div className="shared-folder-empty"><FolderOpen size={30} /><h2>No videos here yet</h2><p>Videos added to this folder will show up at this link.</p></div>}
    </>}</main>
    <Dialog open={Boolean(playing)} onOpenChange={next => { if (!next) setPlaying(null) }}><DialogContent className="player-dialog max-w-4xl p-0">{playing && <><VideoPlayer key={playing.id} source={source} poster={playing.has_thumbnail ? `/api/shared-folders/${token}/videos/${playing.id}/thumbnail` : undefined} name={playing.name} /><div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-6"><DialogHeader><DialogTitle className="max-w-xl break-words">{playing.name}</DialogTitle><DialogDescription>{formatBytes(playing.size)}</DialogDescription></DialogHeader><Button variant="outline" asChild><a href={`${source}?download`} download><Download />Download video</a></Button></div></>}</DialogContent></Dialog>
    <footer>Keep the good stuff. <span>Made with frame.</span></footer>
  </div>
}
