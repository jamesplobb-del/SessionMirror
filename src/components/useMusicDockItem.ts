import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'

const ORDER_KEY = 'besttake:music-widget-dock-order:v1'
const ORDER_EVENT = 'besttake:music-widget-dock-order'
const DEFAULT_ORDER = ['routine-bar-ball', 'desk-metronome', 'desk-drone', 'main-pitch-audio', 'hands-free-tools', 'references', 'desk-takes']

function dockOrder(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
    if (Array.isArray(saved)) return [...new Set([...saved.filter((id): id is string => typeof id === 'string'), ...DEFAULT_ORDER])]
  } catch { /* Use the original order if storage is unavailable. */ }
  return [...DEFAULT_ORDER]
}

function placeDockItem(id: string, targetId: string, after: boolean) {
  if (id === targetId) return
  const order = dockOrder().filter(item => item !== id)
  const index = order.indexOf(targetId)
  if (index < 0) return
  order.splice(index + Number(after), 0, id)
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)) } catch { /* The current layout still updates. */ }
  window.dispatchEvent(new CustomEvent(ORDER_EVENT, { detail: order }))
}

function dockButtons(id: string): HTMLButtonElement[] {
  const dock = document.getElementById('music-widget-dock')
  return [...(dock?.querySelectorAll<HTMLButtonElement>('[data-music-dock-id]') ?? [])]
    .filter(button => button.dataset.musicDockId !== id)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
}

export type DockDropPoint = { x: number; y: number }

/** Shared drag behavior for collapsed Music tools, including References. */
export function useMusicDockItem(id: string, onOpen: (point?: DockDropPoint) => void) {
  const [order, setOrder] = useState(() => dockOrder().indexOf(id))
  const [offset, setOffset] = useState<DockDropPoint | null>(null)
  const gesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    const refresh = (event: Event) => {
      const next = event instanceof CustomEvent && Array.isArray(event.detail) ? event.detail as string[] : dockOrder()
      setOrder(next.indexOf(id))
    }
    window.addEventListener(ORDER_EVENT, refresh)
    return () => window.removeEventListener(ORDER_EVENT, refresh)
  }, [id])

  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
    suppressClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.x, dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 6) return
    current.moved = true
    event.preventDefault()
    setOffset({ x: dx, y: dy })
    const dock = document.getElementById('music-widget-dock')
    if (dock) {
      const bounds = dock.getBoundingClientRect()
      if (event.clientY > bounds.bottom - 44) dock.scrollBy(0, 12)
      else if (event.clientY < bounds.top + 44) dock.scrollBy(0, -12)
    }
  }
  const pointerEnd = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    gesture.current = null
    setOffset(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancelled || !current.moved) return
    suppressClick.current = true
    const dock = document.getElementById('music-widget-dock')
    const bounds = dock?.getBoundingClientRect()
    if (bounds && event.clientX < bounds.left - 18) {
      onOpen({ x: event.clientX, y: event.clientY })
      return
    }
    const others = dockButtons(id)
    if (!others.length) return
    const before = others.find(button => event.clientY < button.getBoundingClientRect().top + button.offsetHeight / 2)
    if (before) placeDockItem(id, before.dataset.musicDockId!, false)
    else placeDockItem(id, others.at(-1)!.dataset.musicDockId!, true)
  }
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClick.current && event.detail !== 0) { event.preventDefault(); suppressClick.current = false; return }
    onOpen()
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const buttons = dockButtons(id)
    const currentIndex = dockOrder().indexOf(id)
    const next = event.key === 'ArrowUp'
      ? buttons.filter(button => dockOrder().indexOf(button.dataset.musicDockId!) < currentIndex).at(-1)
      : buttons.find(button => dockOrder().indexOf(button.dataset.musicDockId!) > currentIndex)
    if (next) placeDockItem(id, next.dataset.musicDockId!, event.key === 'ArrowDown')
  }

  return { order: order < 0 ? DEFAULT_ORDER.length : order,
    translate: offset ? `${offset.x}px ${offset.y}px` : undefined,
    pointerDown, pointerMove, pointerEnd, click, keyDown }
}
