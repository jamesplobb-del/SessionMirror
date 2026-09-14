import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion, useIsPresent, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion'
import { clampWidgetPosition, loadPersistentWidgetPosition, savePersistentWidgetPosition, saveWidgetPosition, type WidgetPosition } from '../utils/floatingWidgetLayout'
import './widget-ball.css'

const BALL_SIZE = 56

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
  const ballX = useMotionValue(0)
  const ballY = useMotionValue(0)
  const dragged = useRef(false)
  const transferFocus = useRef(false)
  const reducedMotion = useReducedMotion()

  useLayoutEffect(() => {
    if (!transferFocus.current) return
    transferFocus.current = false
    if (collapsed) ballRef.current?.focus({ preventScroll: true })
    else widgetRef.current?.querySelector<HTMLButtonElement>('.widget-collapse')?.focus({ preventScroll: true })
  }, [collapsed, widgetRef])

  const clampBall = (nextX: number, nextY: number) => {
    const bounds = boundaryRef.current
    const next = clampWidgetPosition(bounds?.clientWidth ?? window.innerWidth,
      bounds?.clientHeight ?? window.innerHeight, BALL_SIZE, BALL_SIZE, nextX, nextY)
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

  const rememberBall = () => savePersistentWidgetPosition(`${positionId}-ball`, ballX.get(), ballY.get())

  useLayoutEffect(() => {
    if (!collapsed) return
    const resize = () => clampBall(ballX.get(), ballY.get())
    const observer = new ResizeObserver(resize)
    if (boundaryRef.current) observer.observe(boundaryRef.current)
    window.addEventListener('resize', resize)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
    // Motion values are stable; clamp reads the current boundary dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, boundaryRef, ballX, ballY])

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
    setCollapsed(false)
  }

  const ball = collapsed && visible && present ? <motion.button
    ref={ballRef} type="button" className="widget-ball pointer-events-auto"
    aria-label={`Expand ${label}${detail ? `, ${detail}` : ''}`} aria-expanded={false}
    title={`Open ${label}`} data-active={active}
    style={{ x: ballX, y: ballY }}
    drag dragConstraints={boundaryRef} dragMomentum={false} dragElastic={0}
    onPointerDown={() => { dragged.current = false }}
    onDragStart={() => { dragged.current = true }}
    onDragEnd={() => { clampBall(ballX.get(), ballY.get()); rememberBall() }}
    onClick={expand}
    onKeyDown={event => {
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12],
      }
      const move = delta[event.key]
      if (move) { event.preventDefault(); clampBall(ballX.get() + move[0], ballY.get() + move[1]); rememberBall() }
      else if (event.key === 'Enter' || event.key === ' ') dragged.current = false
    }}
    initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.75 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: reducedMotion ? 0 : 0.18 }}
  >
    {icon}<span>{detail ?? label}</span><i aria-hidden />
  </motion.button> : null

  return { collapsed, collapse, ball: ball && portalHost ? createPortal(ball, portalHost) : ball,
    panelAnimation: { opacity: collapsed ? 0 : 1, scale: collapsed && !reducedMotion ? 0.94 : 1 } }
}
