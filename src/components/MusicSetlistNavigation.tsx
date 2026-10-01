import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MusicSetlist } from '../utils/musicSetlists'
import '../styles/music-setlist-navigation.css'

export default function MusicSetlistNavigation({ list, entryId, disabled, onOpen }: {
  list: MusicSetlist
  entryId: string
  disabled: boolean
  onOpen: (list: MusicSetlist, entryId: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const index = list.entries.findIndex(entry => entry.id === entryId)
  const entry = list.entries[index]
  const open = async (offset: number) => {
    if (busy || disabled) return
    const next = list.entries[index + offset]
    if (!next) return
    setBusy(true); setError('')
    try { await onOpen(list, next.id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the next piece. Try again.') }
    finally { setBusy(false) }
  }
  return <div className="music-setlist-navigation" aria-label="Setlist navigation">
    <div>
      <button type="button" aria-label="Previous piece" disabled={disabled || busy || index <= 0} onClick={() => void open(-1)}><ChevronLeft aria-hidden /><span>Previous</span></button>
      <span className="music-setlist-navigation__title"><strong>{list.name}</strong><small>{index + 1} of {list.entries.length} · {entry?.scoreName}</small></span>
      <button type="button" aria-label="Next piece" disabled={disabled || busy || index < 0 || index >= list.entries.length - 1} onClick={() => void open(1)}><span>Next</span><ChevronRight aria-hidden /></button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>
}
