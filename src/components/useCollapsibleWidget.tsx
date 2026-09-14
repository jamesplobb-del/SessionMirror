import { ChevronsDown } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { motion, useIsPresent, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion'
import { findAvailableWidgetBallPosition, clampWidgetPosition, loadPersistentWidgetPosition, savePersistentWidgetPosition, saveWidgetPosition, type WidgetPosition } from '../utils/floatingWidgetLayout'
import './widget-ball.css'

const BALL_SIZE = 56
// Synchronous reservations prevent widgets mounting in the same frame from
// choosing the same spot. Each boundary is translated into viewport coordinates.
const ballPlacements = new Map<symbol, {
  boundary: RefObject<HTMLElement | null>; x: MotionValue<number>; y: MotionValue<number>
}>()

/** Presentation only. The full widget stays mounted and retains its audio owner. */
export function useCollapsibleWidget({ boundaryRef, widgetRef, x, y, positionId, label,
  icon, detail, active = false, resetKey, onRestore, ballSlot = 0, visible = true,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  widgetRef: RefObject<HTMLDivElement | null>
  x: MotionValue<number>; y: MotionValue<number>; positionId: string
  label: string; icon: ReactNode; detail?: string; active?: boolean; resetKey?: string
  onRestore?: (position: WidgetPosition) => void
  ballSlot?: number
  visible?: boolean
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const present = useIsPresent()
  useLayoutEffect(() => { setPortalHost(boundaryRef.current) }, [boundaryRef])
  const ballRef = useRef<HTMLButtonElement>(null)
  const placementId = useRef(Symbol(positionId))
  const ballX = useMotionValue(0)
  const ballY = useMotionValue(0)
  const dragged = useRef(false)
  const ballGesture = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
  const transferFocus = useRef(false)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (!transferFocus.current) return
    transferFocus.current = false
    if (collapsed) ballRef.current?.focus({ preventScroll: true })
    else widgetRef.current?.querySelector<HTMLButtonElement>('.widget-collapse')?.focus({ preventScroll: true })
  }, [collapsed, widgetRef])

  const clampBall = (nextX: number, nextY: number, avoidOverlap = true) => {
    const bounds = boundaryRef.current
    const origin = bounds?.getBoundingClientRect()
    const occupied = [...ballPlacements.entries()]
      .filter(([id]) => id !== placementId.current)
      .map(([, entry]) => {
        const other = entry.boundary.current?.getBoundingClientRect()
        return { x: entry.x.get() + (other?.left ?? 0) - (origin?.left ?? 0),
          y: entry.y.get() + (other?.top ?? 0) - (origin?.top ?? 0) }
      })
    const next = findAvailableWidgetBallPosition(bounds?.clientWidth ?? window.innerWidth,
      bounds?.clientHeight ?? window.innerHeight, { x: nextX, y: nextY }, avoidOverlap ? occupied : [])
    if (visible && present) ballPlacements.set(placementId.current, { boundary: boundaryRef, x: ballX, y: ballY })
    ballX.set(next.x)
    ballY.set(next.y)
  }

  useLayoutEffect(() => {
    const bounds = boundaryRef.current
    const saved = loadPersistentWidgetPosition(`${positionId}-ball`)
    clampBall(saved?.x ?? (bounds?.clientWidth ?? window.innerWidth) - BALL_SIZE - 12,
      saved?.y ?? Math.min(220, (bounds?.clientHeight ?? window.innerHeight) * 0.3) + ballSlot * 68)
    setCollapsed(true)
    // New tools and new routine steps arrive as independently accessible balls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, positionId, ballSlot, boundaryRef])

  useLayoutEffect(() => {
    const id = placementId.current
    if (collapsed && visible && present && portalHost) clampBall(ballX.get(), ballY.get())
    else ballPlacements.delete(id)
    return () => { ballPlacements.delete(id) }
    // Reconcile when a ball becomes visible or joins its actual portal boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, visible, present, portalHost])

  const rememberBall = () => savePersistentWidgetPosition(`${positionId}-ball`, ballX.get(), ballY.get())

  useLayoutEffect(() => {
    if (!collapsed) return
    const resize = () => { if (!ballGesture.current) clampBall(ballX.get(), ballY.get()) }
    const observer = new ResizeObserver(resize)
    if (boundaryRef.current) observer.observe(boundaryRef.current)
    window.addEventListener('resize', resize)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
    // Motion values are stable; clamp reads the current boundary dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, boundaryRef, ballX, ballY])

  // Pointer coordinates keep the portaled Hands-Free ball in the same coordinate
  // space as its fixed boundary; layout projection must not rebase its position.
  const startBallDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || ballGesture.current) return
    event.stopPropagation()
    dragged.current = false
    ballGesture.current = { pointerId: event.pointerId, clientX: event.clientX,
      clientY: event.clientY, x: ballX.get(), y: ballY.get() }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveBall = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = ballGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const dx = event.clientX - gesture.clientX
    const dy = event.clientY - gesture.clientY
    if (!dragged.current && Math.hypot(dx, dy) < 6) return
    dragged.current = true
    event.preventDefault()
    const bounds = boundaryRef.current
    const rect = bounds?.getBoundingClientRect()
    const scaleX = bounds?.clientWidth && rect?.width ? rect.width / bounds.clientWidth : 1
    const scaleY = bounds?.clientHeight && rect?.height ? rect.height / bounds.clientHeight : 1
    clampBall(gesture.x + dx / scaleX, gesture.y + dy / scaleY, false)
  }
  const endBallDrag = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const gesture = ballGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (!cancel) moveBall(event)
    ballGesture.current = null
    if (cancel) {
      clampBall(gesture.x, gesture.y, false)
      dragged.current = true
    } else if (dragged.current) rememberBall()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const collapse = () => {
    const widget = widgetRef.current
    if (!widget) return
    clampBall(x.get() + widget.offsetWidth - BALL_SIZE, y.get())
    transferFocus.current = widget.contains(document.activeElement)
    dragged.current = false
    setCollapsed(true)
  }

  const expand = () => {
    if (dragged.current) { dragged.current = false; return }
    const bounds = boundaryRef.current
    const widget = widgetRef.current
    if (!bounds || !widget) return
    const next = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight,
      widget.offsetWidth, widget.offsetHeight, ballX.get() + BALL_SIZE - widget.offsetWidth, ballY.get())
    x.set(next.x)
    y.set(next.y)
    saveWidgetPosition(positionId, next.x, next.y)
    onRestore?.(next)
    transferFocus.current = document.activeElement === ballRef.current
    ballPlacements.delete(placementId.current)
    setCollapsed(false)
  }

  const ball = collapsed && visible && present ? <motion.button
    ref={ballRef} type="button" className="widget-ball pointer-events-auto"
    aria-label={`Expand ${label}${detail ? `, ${detail}` : ''}`} aria-expanded={false}
    title={`Open ${label}`} data-active={active}
    style={{ x: ballX, y: ballY }}
    onPointerDown={startBallDrag}
    onPointerMove={moveBall}
    onPointerUp={event => endBallDrag(event)}
    onPointerCancel={event => endBallDrag(event, true)}
    onLostPointerCapture={event => endBallDrag(event, true)}
    onClick={expand}
    onKeyDown={event => {
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12],
      }
      const move = delta[event.key]
      if (move) { event.preventDefault(); clampBall(ballX.get() + move[0], ballY.get() + move[1], false); rememberBall() }
      else if (event.key === 'Enter' || event.key === ' ') dragged.current = false
    }}
    initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.75 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: reducedMotion ? 0 : 0.18 }}
  >
    {icon}<span>{detail ?? label}</span><ChevronsDown className="widget-ball__expand" aria-hidden /><i aria-hidden />
  </motion.button> : null

  return { collapsed, collapse, ball: ball && portalHost ? createPortal(ball, portalHost) : ball,
    panelAnimation: { opacity: collapsed ? 0 : 1, scale: collapsed && !reducedMotion ? 0.94 : 1 } }
}
