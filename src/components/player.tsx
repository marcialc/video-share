import { useState } from 'react'
import { Download, FileWarning, Link2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { formatBytes, formatDate } from '@/lib/utils'
import type { Video } from '../../shared/types'

export function VideoPlayer({ source, poster, name }: { source: string; poster?: string; name: string }) {
  const [failed, setFailed] = useState(false)
  return <div className="player-surface"><video controls playsInline preload="metadata" src={source} poster={poster} aria-label={name} onError={() => setFailed(true)} />{failed && <div className="player-error"><FileWarning size={30} /><strong>Your browser can’t play this format.</strong><p>You can still download the original video.</p><Button variant="outline" asChild><a href={`${source}?download`} download><Download />Download video</a></Button></div>}</div>
}

export function PlayerDialog({ video, close, share }: { video: Video | null; close: () => void; share: (video: Video) => void }) {
  return <Dialog open={Boolean(video)} onOpenChange={next => { if (!next) close() }}><DialogContent className="player-dialog max-w-4xl p-0">{video && <><VideoPlayer key={video.id} source={`/api/videos/${video.id}/media`} poster={video.thumbnail_key ? `/api/videos/${video.id}/thumbnail` : undefined} name={video.name} /><div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-6"><DialogHeader><DialogTitle className="max-w-xl break-words">{video.name}</DialogTitle><DialogDescription>{formatBytes(video.size)} · Added {formatDate(video.created_at)}</DialogDescription></DialogHeader><div className="flex gap-2"><Button variant="outline" asChild><a href={`/api/videos/${video.id}/media?download`} download><Download />Download</a></Button><Button onClick={() => { close(); share(video) }}><Link2 />Share video</Button></div></div></>}</DialogContent></Dialog>
}
