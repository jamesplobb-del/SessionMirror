import { useLayoutEffect, useRef, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MUSIC_DOCK_ARRIVAL_EVENT, type MusicDockArrivalDetail } from '../utils/widgetDockMotion'

/** The dock stays mounted while its rail slides away, so tool state is preserved. */
export default function MusicWidgetDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const railRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLButtonElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointerId: number; x: number } | null>(null)
  const ignoreClick = useRef(false)
  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!open && dock?.contains(dock.ownerDocument.activeElement)) {
      handleRef.current?.focus({ preventScroll: true })
    }
  }, [open])
  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let arrival: Animation | undefined
    const acknowledgeArrival = (event: Event) => {
      const detail = (event as CustomEvent<MusicDockArrivalDetail>).detail
      if (preference.matches || !rail.animate || !rail.getClientRects().length || !detail?.id) return
      const belongsToDock = [...(dockRef.current?.querySelectorAll<HTMLElement>('[data-music-dock-id]') ?? [])]
        .some(tool => tool.dataset.musicDockId === detail.id)
      if (!belongsToDock) return
      arrival?.cancel()
      arrival = rail.animate([
        { translate: '0 0' },
        { translate: `${open ? -4 : -3}px 0`, offset: .35 },
        { translate: '1px 0', offset: .7 },
        { translate: '0 0' },
      ], { duration: 300, easing: 'ease-in-out' })
    }
    const cancelForReducedMotion = () => { if (preference.matches) arrival?.cancel() }
    window.addEventListener(MUSIC_DOCK_ARRIVAL_EVENT, acknowledgeArrival)
    preference.addEventListener('change', cancelForReducedMotion)
    return () => {
      window.removeEventListener(MUSIC_DOCK_ARRIVAL_EVENT, acknowledgeArrival)
      preference.removeEventListener('change', cancelForReducedMotion)
      arrival?.cancel()
    }
  }, [open])
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
  return <div ref={railRef} className={`music-widget-drawer${open ? '' : ' music-widget-drawer--closed'}`}>
    <button ref={handleRef} type="button" className="music-widget-drawer__handle"
      aria-label={open ? 'Hide music tools' : 'Show music tools'} aria-expanded={open}
      aria-controls="music-widget-dock" title={open ? 'Hide music tools' : 'Show music tools'}
      onPointerDown={start} onPointerUp={end} onPointerCancel={() => { gesture.current = null }}
      onLostPointerCapture={() => { gesture.current = null }}
      onClick={event => { if (ignoreClick.current && event.detail !== 0) { ignoreClick.current = false; return } onOpenChange(!open) }}>
      {open ? <ChevronRight aria-hidden /> : <ChevronLeft aria-hidden />}
    </button>
    <div ref={dockRef} id="music-widget-dock" className="music-widget-dock" role="toolbar" aria-label="Music tools"
      inert={!open} aria-hidden={!open}
      onPointerDown={start} onPointerUp={end} onPointerCancel={() => { gesture.current = null }}
      onLostPointerCapture={() => { gesture.current = null }} />
    <div id="music-widget-drawer-tools" className="music-widget-drawer__tools" inert={!open} />
  </div>
}
