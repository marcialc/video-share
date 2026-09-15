export function Brand({ light = false }: { light?: boolean }) {
  return <a href="/" className={`brand ${light ? 'text-white' : ''}`} aria-label="Frame home"><span className="brand-icon"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M7 11a3 3 0 0 1 3-3h14v5H12v12H7V11Z" fill="currentColor" /><path d="m18 17 9 5-9 5V17Z" fill="currentColor" /></svg></span><span>frame<span className="text-primary">.</span></span></a>
}
