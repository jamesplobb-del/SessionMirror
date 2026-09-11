import { useLayoutEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import { clampWidgetPosition, loadWidgetPosition, saveWidgetPosition, loadWidgetSize, saveWidgetSize } from '../utils/floatingWidgetLayout'

const ID = 'hands-free-tools'
export function useHandsFreePanelLayout(enabled: boolean) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ x: 12, y: 120, width: 300 })
  const live = useRef(layout)
  const gesture = useRef<{ id: number; x: number; y: number; initial: typeof layout; resize: boolean } | null>(null)
  const apply = (next: typeof layout, save = false) => {
    const width = Math.max(Math.min(220, window.innerWidth - 24), Math.min(420, window.innerWidth - 24, next.width))
    const position = clampWidgetPosition(window.innerWidth, window.innerHeight, width,
      panelRef.current?.offsetHeight ?? 140, next.x, next.y)
    live.current = { ...position, width }
    setLayout(live.current)
    if (save) {
      saveWidgetPosition(ID, position.x, position.y)
      saveWidgetSize(ID, width, panelRef.current?.offsetHeight ?? 140)
    }
  }
  useLayoutEffect(() => {
    if (!enabled) return
    const saved = loadWidgetPosition(ID)
    const size = loadWidgetSize(ID)
    apply({ x: saved?.x ?? (window.innerWidth - 300) / 2, y: saved?.y ?? window.innerHeight * .55, width: size?.width ?? 300 })
    const clamp = () => apply(live.current)
    const observer = new ResizeObserver(clamp)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', clamp)
    return () => { observer.disconnect(); window.removeEventListener('resize', clamp) }
  }, [enabled])
  const start = (event: PointerEvent<HTMLButtonElement>, resize: boolean) => {
    if (gesture.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, initial: live.current, resize }
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    const dx = event.clientX - g.x, dy = event.clientY - g.y
    apply(g.resize ? { ...g.initial, width: g.initial.width + dx } : { ...g.initial, x: g.initial.x + dx, y: g.initial.y + dy })
  }
  const end = () => { if (gesture.current) apply(live.current, true); gesture.current = null }
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, resize: boolean) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -16 : 16
    apply(resize ? { ...live.current, width: live.current.width + delta } : {
      ...live.current,
      x: live.current.x + (event.key.includes('Left') || event.key.includes('Right') ? delta : 0),
      y: live.current.y + (event.key.includes('Up') || event.key.includes('Down') ? delta : 0),
    }, true)
  }
  return { panelRef, layout, controls: (resize: boolean) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => start(e, resize),
    onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end,
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => keyboard(e, resize),
  }) }
}
