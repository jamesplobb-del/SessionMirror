import { useRef, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/** The dock stays mounted while its rail slides away, so tool state is preserved. */
export default function MusicWidgetDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const gesture = useRef<{ pointerId: number; x: number } | null>(null)
  const ignoreClick = useRef(false)
  const start = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.currentTarget.id === 'music-widget-dock' && event.target !== event.currentTarget)) return
    gesture.current = { pointerId: event.pointerId, x: event.clientX }
    ignoreClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const dx = event.clientX - current.x
    if (Math.abs(dx) < 36) return
    ignoreClick.current = true
    onOpenChange(dx < 0)
  }
  return <div className={`music-widget-drawer${open ? '' : ' music-widget-drawer--closed'}`}>
    <button type="button" className="music-widget-drawer__handle"
      aria-label={open ? 'Hide music tools' : 'Show music tools'} aria-expanded={open}
      aria-controls="music-widget-dock" title={open ? 'Hide music tools' : 'Show music tools'}
      onPointerDown={start} onPointerUp={end} onPointerCancel={() => { gesture.current = null }}
      onLostPointerCapture={() => { gesture.current = null }}
      onClick={event => { if (ignoreClick.current && event.detail !== 0) { ignoreClick.current = false; return } onOpenChange(!open) }}>
      {open ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
    </button>
    <div id="music-widget-dock" className="music-widget-dock" role="toolbar" aria-label="Music tools"
      onPointerDown={start} onPointerUp={end} onPointerCancel={() => { gesture.current = null }}
      onLostPointerCapture={() => { gesture.current = null }} />
  </div>
}
