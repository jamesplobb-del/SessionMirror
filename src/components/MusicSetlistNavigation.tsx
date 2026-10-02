import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ListMusic } from 'lucide-react'
import type { MusicSetlist } from '../utils/musicSetlists'
import '../styles/music-setlist-navigation.css'

/**
 * While a setlist is open, the top rail's Library button becomes the Setlist
 * button. It drops down the running order to pick any piece; Library sits in the
 * menu's corner for the way back out.
 */
export default function MusicSetlistMenu({ list, entryId, disabled, onOpen, onLibrary }: {
  list: MusicSetlist
  entryId: string
  disabled: boolean
  onOpen: (list: MusicSetlist, entryId: string) => Promise<void>
  onLibrary: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])
  const pick = async (id: string) => {
    if (busy || disabled) return
    if (id === entryId) { setOpen(false); return }
    setBusy(true); setError('')
    try { await onOpen(list, id); setOpen(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this piece. Try again.') }
    finally { setBusy(false) }
  }
  return <span className="music-setlist-menu" ref={root}>
    <button type="button" className="practice-chart-control" aria-expanded={open} aria-haspopup="true" disabled={disabled}
      onClick={() => setOpen(value => !value)}><ListMusic aria-hidden /><span>Setlist</span></button>
    {open && <div className="music-setlist-menu__panel" role="menu" aria-label={list.name}>
      <div className="music-setlist-menu__head">
        <strong>{list.name}</strong>
        <button type="button" className="music-setlist-menu__library" onClick={() => { setOpen(false); onLibrary() }}><ArrowLeft aria-hidden />Library</button>
      </div>
      <ol>{list.entries.map((entry, index) => <li key={entry.id}>
        <button type="button" role="menuitem" aria-current={entry.id === entryId ? 'true' : undefined} disabled={busy} onClick={() => void pick(entry.id)}>
          <span>{index + 1}</span><strong>{entry.scoreName}</strong>{entry.id === entryId && <Check aria-hidden />}
        </button></li>)}</ol>
      {error && <p role="alert">{error}</p>}
    </div>}
  </span>
}
