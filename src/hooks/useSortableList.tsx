import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { dropIndex, edgeScrollSpeed, shiftsFor } from '../utils/sortableOrder'
import { loadAppSettings } from '../utils/appSettings'
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics'
import '../styles/sortable-list.css'

const HOLD_MS = 280
const HOLD_SLOP = 8
const MOUSE_SLOP = 5
const SETTLE_MS = 180

interface Options {
  /** Row ids in their current order. */
  ids: readonly string[]
  onMove: (from: number, to: number) => void
  /** The element that scrolls the list; it scrolls itself while a row is held near its edge. */
  scrollRef: RefObject<HTMLElement | null>
  disabled?: boolean
  /** Names a row for screen readers; announced as "<name>, position 2 of 5" after a move. */
  describe?: (id: string) => string
}

interface Gesture {
  id: string
  pointerId: number
  startX: number
  startY: number
  startScroll: number
  /** Where on the row the finger landed, so it stays there if rows fold away. */
  grab: number
  lastY: number
  mode: 'pending' | 'active'
  immediate: boolean
  pointerType: string
  timer: number | null
  els: HTMLElement[]
  rects: { top: number; height: number }[]
  from: number
  to: number
  frame: number | null
  settling: boolean
}

/**
 * Press-and-drag ordering. A grip handle lifts a row at once; the row body lifts
 * after a short hold on touch, or a few pixels of travel with a mouse, so a
 * tap still taps and a swipe still scrolls. Rows slide out of the way as the
 * dragged row passes. Keyboard and VoiceOver reorder through the handle's
 * up/down arrows, so no visible arrow buttons are needed.
 */
export function useSortableList({ ids, onMove, scrollRef, disabled = false, describe }: Options) {
  const listRef = useRef<HTMLOListElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(0)
  const pendingFocus = useRef<number | null>(null)
  const latest = useRef({ ids, onMove, disabled, describe })
  latest.current = { ids, onMove, disabled, describe }

  const haptic = useCallback((strong: boolean) => {
    try {
      const enabled = loadAppSettings().hapticFeedback
      if (strong) triggerMediumHaptic(enabled); else triggerLightHaptic(enabled)
    } catch { /* Haptics are a nicety. */ }
  }, [])

  const rowElements = useCallback((): HTMLElement[] => {
    const list = listRef.current
    if (!list) return []
    return latest.current.ids.map(id => list.querySelector<HTMLElement>(`[data-sort-id="${CSS.escape(id)}"]`)).filter((el): el is HTMLElement => Boolean(el))
  }, [])

  const blockScroll = useRef((event: TouchEvent) => { if (gesture.current?.mode === 'active' && event.cancelable) event.preventDefault() })
  const unlisten = useRef<(() => void) | null>(null)

  const clearInline = useCallback((els: HTMLElement[]) => {
    for (const el of els) { el.style.transform = ''; el.style.transition = ''; el.style.zIndex = '' }
  }, [])

  const finish = useCallback((commit: boolean) => {
    const g = gesture.current
    if (!g) return
    if (g.timer !== null) { window.clearTimeout(g.timer); g.timer = null }
    if (g.frame !== null) { cancelAnimationFrame(g.frame); g.frame = null }
    if (g.mode === 'pending') { gesture.current = null; unlisten.current?.(); unlisten.current = null; return }
    if (g.settling) return
    unlisten.current?.(); unlisten.current = null
    suppressClickUntil.current = performance.now() + 400
    const target = commit ? g.to : g.from
    const shifts = shiftsFor(g.rects, g.from, target)
    g.settling = true
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dragged = g.els[g.from]
    if (dragged && !reduce) {
      dragged.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1)`
      dragged.style.transform = `translate3d(0, ${shifts[g.from] ?? 0}px, 0)`
    }
    const commitNow = () => {
      // The list may have unmounted while the row settled.
      if (gesture.current !== g) return
      flushSync(() => {
        if (commit && target !== g.from) latest.current.onMove(g.from, target)
        setDraggingId(null)
      })
      clearInline(g.els)
      gesture.current = null
      if (commit && target !== g.from) {
        setAnnouncement(`${latest.current.describe ? latest.current.describe(g.id) : 'Moved'}, position ${target + 1} of ${latest.current.ids.length}`)
      }
    }
    if (reduce || !dragged) commitNow(); else window.setTimeout(commitNow, SETTLE_MS + 10)
  }, [clearInline])

  const layout = useCallback(() => {
    const g = gesture.current
    const scroller = scrollRef.current
    if (!g || g.mode !== 'active') return
    const scrolled = scroller ? scroller.scrollTop - g.startScroll : 0
    const dy = g.lastY - g.startY + scrolled
    const dragged = g.els[g.from]
    if (dragged) dragged.style.transform = `translate3d(0, ${dy}px, 0) scale(1.02)`
    const to = dropIndex(g.rects, g.from, g.rects[g.from]!.top + dy)
    if (to === g.to) return
    g.to = to
    haptic(false)
    const shifts = shiftsFor(g.rects, g.from, to)
    g.els.forEach((el, i) => { if (i !== g.from) el.style.transform = shifts[i] ? `translate3d(0, ${shifts[i]}px, 0)` : '' })
  }, [haptic, scrollRef])

  const tick = useCallback(() => {
    const g = gesture.current
    const scroller = scrollRef.current
    if (!g || g.mode !== 'active' || g.settling) return
    if (scroller) {
      const bounds = scroller.getBoundingClientRect()
      const speed = edgeScrollSpeed(g.lastY, bounds.top, bounds.bottom)
      if (speed) {
        const before = scroller.scrollTop
        scroller.scrollTop = before + speed
        if (scroller.scrollTop !== before) layout()
      }
    }
    g.frame = requestAnimationFrame(tick)
  }, [layout, scrollRef])

  const activate = useCallback(() => {
    const g = gesture.current
    if (!g || g.mode !== 'pending') return
    if (g.timer !== null) { window.clearTimeout(g.timer); g.timer = null }
    g.mode = 'active'
    // Marking the list as sorting lets CSS fold away anything expanded before rows are measured.
    flushSync(() => setDraggingId(g.id))
    const els = rowElements()
    const from = latest.current.ids.indexOf(g.id)
    if (from < 0 || els.length !== latest.current.ids.length) {
      flushSync(() => setDraggingId(null))
      gesture.current = null; unlisten.current?.(); unlisten.current = null
      return
    }
    g.els = els
    g.rects = els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height } })
    g.from = from; g.to = from
    g.startScroll = scrollRef.current?.scrollTop ?? 0
    // If rows folded away, the grab point moves with the row, so the row stays under the finger.
    const row = g.rects[from]!
    g.startY = row.top + Math.min(Math.max(g.grab, 8), Math.max(8, row.height - 8))
    window.getSelection()?.removeAllRanges()
    els[from]!.style.zIndex = '4'
    haptic(true)
    layout()
    g.frame = requestAnimationFrame(tick)
  }, [haptic, layout, rowElements, scrollRef, tick])

  const start = useCallback((event: PointerEvent<HTMLElement>, id: string, immediate: boolean) => {
    if (latest.current.disabled || gesture.current || event.button !== 0 || !event.isPrimary) return
    const g: Gesture = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startScroll: 0, grab: 0, lastY: event.clientY,
      mode: 'pending', immediate, pointerType: event.pointerType, timer: null, els: [], rects: [], from: -1, to: -1, frame: null, settling: false }
    const rowEl = listRef.current?.querySelector<HTMLElement>(`[data-sort-id="${CSS.escape(id)}"]`)
    if (rowEl) g.grab = event.clientY - rowEl.getBoundingClientRect().top
    gesture.current = g
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== g.pointerId || gesture.current !== g) return
      g.lastY = e.clientY
      if (g.mode === 'pending') {
        const travelled = Math.hypot(e.clientX - g.startX, e.clientY - g.startY)
        if (g.pointerType === 'mouse') { if (travelled > MOUSE_SLOP) activate() }
        else if (travelled > HOLD_SLOP) finish(false)
        return
      }
      if (e.cancelable) e.preventDefault()
      layout()
    }
    const up = (e: globalThis.PointerEvent) => { if (e.pointerId === g.pointerId && gesture.current === g) finish(true) }
    const cancel = (e: globalThis.PointerEvent) => { if (e.pointerId === g.pointerId && gesture.current === g) finish(false) }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('touchmove', blockScroll.current, { passive: false })
    unlisten.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('touchmove', blockScroll.current)
    }
    if (immediate) activate()
    else if (event.pointerType !== 'mouse') g.timer = window.setTimeout(activate, HOLD_MS)
  }, [activate, finish, layout])

  useEffect(() => () => {
    const g = gesture.current
    if (g?.timer) window.clearTimeout(g.timer)
    if (g?.frame) cancelAnimationFrame(g.frame)
    unlisten.current?.()
    if (g) clearInline(g.els)
    gesture.current = null
  }, [clearInline])

  // Moving a focused node in the DOM drops focus; give it back to the handle.
  useLayoutEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    pendingFocus.current = null
    listRef.current?.querySelectorAll<HTMLElement>('[data-sort-handle]')[index]?.focus({ preventScroll: false })
  })

  const moveByKey = (id: string, to: number) => {
    const { ids: current, onMove: move, describe: say } = latest.current
    const from = current.indexOf(id)
    const clamped = Math.max(0, Math.min(current.length - 1, to))
    if (from < 0 || clamped === from) return
    pendingFocus.current = clamped
    move(from, clamped)
    setAnnouncement(`${say ? say(id) : 'Moved'}, position ${clamped + 1} of ${current.length}`)
  }

  /** `holdToDrag: false` leaves the row body alone, so only its handle drags (rows with their own swipe). */
  const itemProps = (id: string, { holdToDrag = true }: { holdToDrag?: boolean } = {}) => ({
    'data-sort-id': id,
    'data-dragging': draggingId === id ? '' : undefined,
    ...(holdToDrag ? {
      onPointerDown: (event: PointerEvent<HTMLElement>) => start(event, id, false),
      onClickCapture: (event: { preventDefault(): void; stopPropagation(): void }) => {
        if (performance.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation() }
      },
      onContextMenu: (event: { preventDefault(): void }) => { if (gesture.current) event.preventDefault() },
    } : {}),
  })

  const handleProps = (id: string, name: string) => {
    const index = ids.indexOf(id)
    return {
      role: 'slider' as const,
      tabIndex: disabled ? -1 : 0,
      'aria-label': `Reorder ${name}`,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': 1,
      'aria-valuemax': ids.length,
      'aria-valuenow': index + 1,
      'aria-valuetext': `Position ${index + 1} of ${ids.length}`,
      'aria-disabled': disabled || undefined,
      'data-sort-handle': id,
      onPointerDown: (event: PointerEvent<HTMLElement>) => { event.stopPropagation(); start(event, id, true) },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (disabled) return
        const from = latest.current.ids.indexOf(id)
        const key = event.key
        if (key === 'ArrowUp' || key === 'ArrowLeft') moveByKey(id, from - 1)
        else if (key === 'ArrowDown' || key === 'ArrowRight') moveByKey(id, from + 1)
        else if (key === 'Home') moveByKey(id, 0)
        else if (key === 'End') moveByKey(id, latest.current.ids.length - 1)
        else return
        event.preventDefault()
        event.stopPropagation()
      },
    }
  }

  const liveRegion: ReactNode = <span className="sortable-live" role="status" aria-live="polite">{announcement}</span>

  return { listRef, draggingId, sorting: draggingId !== null, itemProps, handleProps, liveRegion }
}
