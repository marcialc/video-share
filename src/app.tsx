import { useEffect, useState } from 'react'
import { ArrowRight, Download, Film, Link2, Loader2, LockKeyhole } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { Brand } from './components/brand'
import { Library } from './components/library'
import { VideoPlayer } from './components/player'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { api, errorMessage } from './lib/api'
import { formatBytes, formatDuration } from './lib/utils'
import type { PublicVideo } from '../shared/types'

function SharedVideo({ token }: { token: string }) {
  const [video, setVideo] = useState<PublicVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void api<PublicVideo>(`/api/shared/${token}`).then(result => { setVideo(result); document.title = `${result.name} — Frame` }).catch(err => setError(errorMessage(err)))
  }, [token])
  return <div className="shared-page"><header><Brand /><span><Link2 size={14} />Shared with you</span></header><main>{error ? <div className="shared-error"><span className="dialog-icon"><Link2 /></span><h1>This link isn’t available</h1><p>{error}</p></div> : !video ? <div className="loading-state"><Loader2 className="animate-spin" /><p>Loading your video…</p></div> : <><div className="shared-eyebrow">A VIDEO WORTH SHARING</div><h1>{video.name}</h1><p className="shared-meta">{formatBytes(video.size)}{video.duration !== null && ` · ${formatDuration(video.duration)}`}</p><VideoPlayer source={`/api/shared/${token}/media`} poster={video.has_thumbnail ? `/api/shared/${token}/thumbnail` : undefined} name={video.name} /><div className="shared-bottom"><div><span className="shared-avatar"><Film size={19} /></span><div><strong>A little moment, sent your way.</strong><p>Shared privately with a Frame link.</p></div></div><Button variant="outline" asChild><a href={`/api/shared/${token}/media?download`} download><Download />Download video</a></Button></div></>}</main><footer>Keep the good stuff. <span>Made with frame.</span></footer></div>
}

function Login({ configured, onLogin }: { configured: boolean; onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true)
    try { await api('/api/session', { method: 'POST', body: JSON.stringify({ password }) }); onLogin() }
    catch (error) { toast.error(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <div className="login-page"><Brand /><main><span className="login-icon"><LockKeyhole size={27} /></span><span className="eyebrow">YOUR PERSONAL VIDEO SPACE</span><h1>Welcome to your frame.</h1><p>Your videos, your folders, your little corner of the internet.</p>{configured ? <form onSubmit={event => void submit(event)}><label className="field-label">Library password<Input type="password" className="mt-2" placeholder="Enter your password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required autoFocus /></label><Button type="submit" size="lg" disabled={busy || !password}>{busy ? <Loader2 className="animate-spin" /> : <>Open your library<ArrowRight /></>}</Button></form> : <div className="setup-message"><strong>Your library is almost ready.</strong><p>Set the <code>ADMIN_PASSWORD</code> Cloudflare Worker secret to a password of at least 8 characters, then refresh this page.</p></div>}<small><LockKeyhole size={12} />A private space. A simple link when you want to share.</small></main></div>
}

export default function App() {
  const token = /^\/s\/([^/]+)\/?$/.exec(window.location.pathname)?.[1]
  const [session, setSession] = useState<{ authenticated: boolean; local: boolean; configured: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadSession = () => { setError(null); void api<{ authenticated: boolean; local: boolean; configured: boolean }>('/api/session').then(setSession).catch(err => setError(errorMessage(err))) }
  useEffect(() => {
    if (token) return
    loadSession()
    const unauthorized = () => setSession(previous => previous ? { ...previous, authenticated: false } : previous)
    window.addEventListener('frame:unauthorized', unauthorized)
    return () => window.removeEventListener('frame:unauthorized', unauthorized)
  }, [token])
  return <>{token ? <SharedVideo token={token} /> : error ? <div className="app-loading"><p>{error}</p><Button onClick={loadSession}>Try again</Button></div> : !session ? <div className="app-loading"><Brand /><Loader2 className="animate-spin text-primary" /></div> : session.authenticated ? <Library local={session.local} onLogout={() => setSession({ ...session, authenticated: false })} /> : <Login configured={session.configured} onLogin={loadSession} />}<Toaster position="bottom-right" richColors closeButton /></>
}
