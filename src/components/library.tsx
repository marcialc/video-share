import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownUp, ArrowRight, Check, ChevronRight, CircleHelp, Cloud, Ellipsis, Film, Folder as FolderIcon, FolderOpen, FolderPlus, Grid2X2, LayoutGrid, Link2, List, Loader2, LockKeyhole, LogOut, Menu, Pencil, Play, Plus, Search, Trash2, Upload, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Brand } from './brand'
import { LibraryDialogs, type LibraryAction } from './library-dialogs'
import { UploadDialog } from './upload-dialog'
import { VideoCard } from './video-card'
import { PlayerDialog } from './player'
import { api, errorMessage } from '@/lib/api'
import { cn, formatBytes } from '@/lib/utils'
import type { Library as LibraryData, Folder, Video } from '../../shared/types'

type Section = 'all' | 'folders' | 'shared' | `folder:${string}`
export function Library({ local, onLogout }: { local: boolean; onLogout: () => void }) {
  const [data, setData] = useState<LibraryData>({ folders: [], videos: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [view, setView] = useState<'grid' | 'list'>(() => localStorage.getItem('frame-view') === 'list' ? 'list' : 'grid')
  const [action, setAction] = useState<LibraryAction>(null)
  const [playing, setPlaying] = useState<Video | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [initialFiles, setInitialFiles] = useState<File[]>([])
  const [mobileNav, setMobileNav] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const searchInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try { const result = await api<LibraryData>('/api/library'); setData(result); setError(null) }
    catch (err) { setError(errorMessage(err)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); searchInput.current?.focus() } }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => { localStorage.setItem('frame-view', view) }, [view])

  const activeFolder = section.startsWith('folder:') ? data.folders.find(folder => folder.id === section.slice(7)) : undefined
  const folderId = activeFolder?.id || null
  const sharedCount = data.videos.filter(video => video.share_token).length + data.folders.filter(folder => folder.share_token).length
  const totalSize = data.videos.reduce((sum, video) => sum + video.size, 0)
  const visibleVideos = data.videos.filter(video => (section === 'shared' ? Boolean(video.share_token) : activeFolder ? video.folder_id === activeFolder.id : true) && video.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : sort === 'oldest' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at))
  const visibleFolders = data.folders.filter(folder => (section !== 'shared' || Boolean(folder.share_token)) && folder.name.toLowerCase().includes(search.toLowerCase()))
  const title = activeFolder?.name || (section === 'folders' ? 'Your folders' : section === 'shared' ? 'Shared links' : 'All videos')
  const description = activeFolder ? `${activeFolder.video_count} ${activeFolder.video_count === 1 ? 'video' : 'videos'} · ${formatBytes(activeFolder.total_size)}` : section === 'folders' ? 'A place for every project, adventure, and little moment.' : section === 'shared' ? 'Your folders and videos with an active share link, all in one place.' : 'A little space for everything you want to keep and share.'
  const navigate = (next: Section) => { setSection(next); setSearch(''); setMobileNav(false) }
  function openUpload(files: File[] = []) { setInitialFiles(files); setUploadOpen(true) }
  async function afterChange() {
    await refresh()
    if (action?.type === 'delete-folder' && activeFolder?.id === action.folder.id) setSection('all')
  }

  function folderCard(folder: Folder) {
    return <div className={`folder-card color-${folder.color}`} key={folder.id}><button className="folder-card-main" onClick={() => navigate(`folder:${folder.id}`)}><span className="folder-graphic"><FolderIcon fill="currentColor" strokeWidth={1.2} /></span><strong>{folder.name}</strong><span>{folder.video_count} {folder.video_count === 1 ? 'video' : 'videos'}<span className="mx-1.5">·</span>{formatBytes(folder.total_size)}</span></button><Button variant="ghost" size="icon" className={cn("folder-share", folder.share_token && "text-primary")} aria-label={`Share folder ${folder.name}`} title="Share folder" onClick={() => setAction({ type: 'share-folder', folder })}><Link2 /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="folder-menu" aria-label={`Options for ${folder.name}`}><Ellipsis /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => navigate(`folder:${folder.id}`)}><FolderOpen />Open folder</DropdownMenuItem><DropdownMenuItem onSelect={() => setAction({ type: 'share-folder', folder })}><Link2 />Share folder</DropdownMenuItem><DropdownMenuItem onSelect={() => setAction({ type: 'rename-folder', folder })}><Pencil />Rename</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => setAction({ type: 'delete-folder', folder })}><Trash2 />Delete folder</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  }

  return <div className="app-shell" onDragEnter={event => { if (!event.dataTransfer.types.includes('Files') || uploadOpen) return; event.preventDefault(); dragDepth.current++; setDragging(true) }} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDragLeave={event => { if (!dragging) return; event.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false) }} onDrop={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!uploadOpen) openUpload(Array.from(event.dataTransfer.files)) }}>
    {mobileNav && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={cn('sidebar', mobileNav && 'mobile-open')}><div className="sidebar-brand"><Brand /><Button variant="ghost" size="icon" className="mobile-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X /></Button></div>
      <div className="workspace-card"><span className="workspace-avatar"><Film size={19} /></span><div><strong>My workspace</strong><span>Your personal video space</span></div></div>
      <div className="nav-label">LIBRARY</div><nav className="main-nav" aria-label="Library"><button className={cn(section === 'all' && 'selected')} onClick={() => navigate('all')}><LayoutGrid />All videos<span>{data.videos.length}</span></button><button className={cn(section === 'folders' && 'selected')} onClick={() => navigate('folders')}><FolderOpen />Folders<span>{data.folders.length}</span></button><button className={cn(section === 'shared' && 'selected')} onClick={() => navigate('shared')}><Link2 />Shared links<span>{sharedCount}</span></button></nav>
      <div className="nav-label folders-label"><span>YOUR FOLDERS</span><button aria-label="Create folder" onClick={() => setAction({ type: 'new-folder' })}><Plus size={15} /></button></div><nav className="folder-nav" aria-label="Folders">{data.folders.length ? data.folders.map(folder => <button className={cn(section === `folder:${folder.id}` && 'selected')} key={folder.id} onClick={() => navigate(`folder:${folder.id}`)}><span className={`folder-dot color-${folder.color}`} /><span className="truncate">{folder.name}</span></button>) : <p>A little organization goes a long way.<button onClick={() => setAction({ type: 'new-folder' })}>Create your first folder <ArrowRight size={12} /></button></p>}</nav>
      <div className="sidebar-bottom"><div className="storage-card"><div><Cloud size={17} /><strong>Your space</strong><span className="storage-dot" /></div><p><strong>{formatBytes(totalSize)}</strong> stored across {data.videos.length} {data.videos.length === 1 ? 'video' : 'videos'}</p><span className="storage-caption">Room for your next big thing.</span></div><div className="profile"><span className="profile-avatar">Y</span><div><strong>Your library</strong><span>Personal workspace</span></div>{!local && <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={() => void api('/api/session', { method: 'DELETE' }).then(onLogout).catch(err => toast.error(errorMessage(err)))}><LogOut /></Button>}<LockKeyhole className="profile-lock" size={14} /></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-location"><Button variant="ghost" size="icon" className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu /></Button><span>Workspace</span><ChevronRight size={13} /><strong>{activeFolder ? 'Folders' : title}</strong></div><div className="global-search"><Search size={16} /><input ref={searchInput} aria-label="Search library" placeholder="Search your library…" value={search} onChange={event => setSearch(event.target.value)} />{search ? <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button> : <kbd>⌘ K</kbd>}</div><Button variant="ghost" size="icon" className="help-button" aria-label="How Frame works" onClick={() => toast.info('Your videos, simply organized.', { description: 'Upload a video, put it in a folder, and use the video or folder’s link icon to share. You can rename, move, or download videos from the three-dot menu.', duration: 9000 })}><CircleHelp /></Button></header>
      <main className="main-content"><div className={cn("page-heading", activeFolder && "folder-heading")}><div>{activeFolder && <button className="back-link" onClick={() => navigate('folders')}><FolderOpen size={13} />Folders<ChevronRight size={12} /></button>}<h1>{title}<span className="heading-dot">.</span></h1><p>{description}</p></div><div className="heading-actions">{activeFolder && <Button variant="outline" aria-label="Share folder" onClick={() => setAction({ type: 'share-folder', folder: activeFolder })}><Link2 /><span>Share folder</span></Button>}{!activeFolder && <Button aria-label="New folder" variant="outline" onClick={() => setAction({ type: 'new-folder' })}><FolderPlus /><span>New folder</span></Button>}<Button onClick={() => openUpload()}><Plus /><span>Upload video</span></Button></div></div>
        {error ? <div className="error-state"><Cloud size={28} /><h2>Couldn’t load your library</h2><p>{error}</p><Button onClick={() => { setLoading(true); void refresh() }}>Try again</Button></div> : loading ? <div className="loading-state"><Loader2 className="animate-spin" /><p>Getting your space ready…</p></div> : <>
          {section === 'all' && !search && data.videos.length === 0 && <section className="welcome-banner"><div className="welcome-copy"><span className="eyebrow"><span />A HOME FOR YOUR VIDEOS</span><h2>Your videos.<br />All together.</h2><p>Keep the good stuff. Give it a folder.<br className="desktop-break" /> Share it with a simple link.</p><button onClick={() => openUpload()}>Let’s add your first video <ArrowRight size={15} /></button></div><div className="welcome-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-spark spark-one">+</div><div className="art-spark spark-two">+</div><div className="art-folder"><span /><FolderIcon fill="currentColor" strokeWidth={0.5} /></div><div className="art-video"><div className="art-landscape"><div className="art-sun" /><div className="art-hill hill-back" /><div className="art-hill hill-front" /><span><Play fill="currentColor" strokeWidth={0} /></span></div><div className="art-video-lines"><i /><i /><span>00:24</span></div></div><div className="art-link"><Link2 size={22} /><span>Ready to share</span><span className="art-check"><Check size={12} /></span></div></div></section>}
          {(section === 'all' || section === 'folders' || (section === 'shared' && visibleFolders.length > 0)) && <section className="folders-section"><div className="section-heading"><h2>Folders <span>{visibleFolders.length}</span></h2>{section === 'all' && data.folders.length > 3 && <button onClick={() => navigate('folders')}>View all <ArrowRight size={14} /></button>}</div><div className="folder-grid">{(section === 'all' ? visibleFolders.slice(0, 3) : visibleFolders).map(folderCard)}{section !== 'shared' && (!search || !visibleFolders.length) && <button className={cn('new-folder-card', !data.folders.length && 'first-folder')} onClick={() => setAction({ type: 'new-folder' })}><span><Plus size={20} /></span><div><strong>{search ? 'Create a folder' : data.folders.length ? 'New folder' : 'Create your first folder'}</strong>{!data.folders.length && <p>Keep your videos in good company.</p>}</div></button>}</div></section>}
          {section !== 'folders' && (section !== 'shared' || visibleVideos.length > 0 || visibleFolders.length === 0) && <section className="videos-section"><div className="video-toolbar"><div className="section-heading"><h2>{search ? 'Search results' : activeFolder || section === 'shared' ? 'Videos' : 'Your videos'} <span>{visibleVideos.length}</span></h2></div><div className="toolbar-controls"><div className="sort-select"><ArrowDownUp size={13} /><select aria-label="Sort videos" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="size">Largest first</option></select></div><div className="view-toggle" role="group" aria-label="Video layout"><button className={cn(view === 'grid' && 'selected')} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button className={cn(view === 'list' && 'selected')} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div></div></div>
            {visibleVideos.length ? <div className={view === 'grid' ? 'video-grid' : 'video-list'}>{visibleVideos.map(video => <VideoCard key={video.id} video={video} view={view} folderName={data.folders.find(folder => folder.id === video.folder_id)?.name} onPlay={() => setPlaying(video)} onAction={setAction} />)}</div> : <div className="empty-videos"><div className="empty-icon"><span />{search ? <Search size={26} /> : section === 'shared' ? <Link2 size={26} /> : <Film size={27} />}</div><h3>{search ? 'No videos found' : section === 'shared' ? 'No shared links yet' : activeFolder ? 'This folder is a fresh start' : 'Every library starts with one video'}</h3><p>{search ? `No matches for “${search}”. Try another name.` : section === 'shared' ? 'Create a link on a folder or video and it will show up here.' : activeFolder ? 'Upload a video here, or move one from your library.' : 'Drop a video anywhere, or choose one from your device.'}</p><Button variant={section === 'shared' || search ? 'outline' : 'default'} onClick={() => search ? setSearch('') : section === 'shared' ? navigate('folders') : openUpload()}>{search ? <X /> : section === 'shared' ? <LayoutGrid /> : <Upload size={15} />}{search ? 'Clear search' : section === 'shared' ? 'Go to your folders' : 'Upload your first video'}</Button>{!search && section !== 'shared' && <small>MP4, MOV, WebM & more · Up to 5 GB</small>}</div>}
          </section>}
          <footer className="library-footer"><span><LockKeyhole size={12} />Private by default. Shared on your terms.</span><span>Less managing. More creating.</span></footer>
        </>}
      </main>
    </div>
    {dragging && <div className="page-drop-overlay"><UploadCloud size={52} /><h2>Drop your videos here</h2><p>We’ll take care of the rest.</p></div>}
    <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} folders={data.folders} defaultFolder={folderId} initialFiles={initialFiles} onComplete={refresh} />
    <LibraryDialogs action={action} close={() => setAction(null)} folders={data.folders} refresh={afterChange} />
    <PlayerDialog video={playing} close={() => setPlaying(null)} share={video => setAction({ type: 'share', video })} />
  </div>
}
