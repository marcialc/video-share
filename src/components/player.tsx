import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, FileWarning, Link2, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { formatBytes, formatDate } from '@/lib/utils'
import type { Video } from '../../shared/types'

export function VideoPlayer({ source, poster, name }: { source: string; poster?: string; name: string }) {
  const [failure, setFailure] = useState<number | null>(null)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  function clearSlow() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setSlow(false)
  }
  function watchLoading() {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; setSlow(true) }, 12000)
  }
  function retry() { clearSlow(); setFailure(null); setAttempt(previous => previous + 1) }

  const title = failure === 2 ? 'Couldn’t load the video.' : failure === 3 ? 'This video couldn’t be decoded.' : failure === 4 ? 'Your browser can’t play this video.' : 'Video is taking longer to load.'
  const explanation = failure === 4 ? 'Open it directly or download the original file.' : 'Check your connection, then try again. You can also open the video directly.'
  return <div className="player-surface"><video key={`${source}:${attempt}`} controls playsInline preload="metadata" src={source} poster={poster} aria-label={name} onLoadStart={watchLoading} onWaiting={watchLoading} onStalled={watchLoading} onCanPlay={clearSlow} onPlaying={clearSlow} onError={event => { clearSlow(); setFailure(event.currentTarget.error?.code ?? 0) }} />{(failure !== null || slow) && <div className="player-error" role="alert"><FileWarning size={30} /><strong>{title}</strong><p>{explanation}</p><div className="player-recovery"><Button onClick={retry}><RotateCcw />Try again</Button><Button variant="outline" asChild><a href={source} target="_blank" rel="noreferrer"><ExternalLink />Open directly</a></Button><Button variant="outline" asChild><a href={`${source}?download`} download><Download />Download</a></Button></div></div>}</div>
}

export function PlayerDialog({ video, close, share }: { video: Video | null; close: () => void; share: (video: Video) => void }) {
  return <Dialog open={Boolean(video)} onOpenChange={next => { if (!next) close() }}><DialogContent className="player-dialog max-w-4xl p-0">{video && <><VideoPlayer key={video.id} source={`/api/videos/${video.id}/media`} poster={video.thumbnail_key ? `/api/videos/${video.id}/thumbnail` : undefined} name={video.name} /><div className="flex flex-wrap items-center justify-between gap-4 px-6 pb-6"><DialogHeader><DialogTitle className="max-w-xl break-words">{video.name}</DialogTitle><DialogDescription>{formatBytes(video.size)} · Added {formatDate(video.created_at)}</DialogDescription></DialogHeader><div className="flex gap-2"><Button variant="outline" asChild><a href={`/api/videos/${video.id}/media?download`} download><Download />Download</a></Button><Button onClick={() => { close(); share(video) }}><Link2 />Share video</Button></div></div></>}</DialogContent></Dialog>
}
