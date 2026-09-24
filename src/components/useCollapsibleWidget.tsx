import { reportFeatureAction } from '../utils/featureGuidance'
import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { animate, motion, useIsPresent, useMotionValue, useReducedMotion, type MotionValue } from 'framer-motion'
import { iosDragRelease } from '../utils/motionPresets'
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
  icon, detail, active = false, resetKey, expandRequest = false, onExpandRequestConsumed,
  onRestore, ballSlot = 0, visible = true, dockRight = false, showBall = true,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  widgetRef: RefObject<HTMLDivElement | null>
  x: MotionValue<number>; y: MotionValue<number>; positionId: string
  label: string; icon: ReactNode; detail?: string; active?: boolean; resetKey?: string
  /** One-shot request to present the full panel, such as enabling it from Music Workspace. */
  expandRequest?: boolean
  onExpandRequestConsumed?: () => void
  onRestore?: (position: WidgetPosition) => void
  ballSlot?: number
  visible?: boolean
  dockRight?: boolean
  /** Music's page controls open from the header and do not get a dock ball. */
  showBall?: boolean
}) {
  const [collapsed, setCollapsed] = useState(() => !expandRequest)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  const present = useIsPresent()
  useLayoutEffect(() => {
    const findHost = () => setPortalHost(
      dockRight && (boundaryRef.current?.clientWidth ?? window.innerWidth) >= 700
        ? document.getElementById('music-widget-dock') ?? boundaryRef.current
        : boundaryRef.current,
    )
    findHost()
    const observer = new ResizeObserver(findHost)
    if (boundaryRef.current) observer.observe(boundaryRef.current)
    window.addEventListener('resize', findHost)
    return () => { observer.disconnect(); window.removeEventListener('resize', findHost) }
  }, [boundaryRef, dockRight])
  const ballRef = useRef<HTMLButtonElement>(null)
  const placementId = useRef(Symbol(positionId))
  const ballX = useMotionValue(0)
  const ballY = useMotionValue(0)
  const dragged = useRef(false)
  const ballGesture = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | null>(null)
  const transferFocus = useRef(false)
  const reducedMotion = useReducedMotion()
  const previousPlacement = useRef({ resetKey, positionId, ballSlot, boundaryRef })
  const previousExpandRequest = useRef(expandRequest)
  const expandRequestConsumed = useRef(false)
  const useRightDock = () => dockRight && (boundaryRef.current?.clientWidth ?? window.innerWidth) >= 700
  const docked = portalHost?.id === 'music-widget-dock'
  const ballStorageId = () => `${positionId}-ball${useRightDock() ? '-music' : ''}`

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
    if (visible && present && !docked && showBall) ballPlacements.set(placementId.current, { boundary: boundaryRef, x: ballX, y: ballY })
    ballX.set(next.x)
    ballY.set(next.y)
  }

  useLayoutEffect(() => {
    const prior = previousPlacement.current
    const shouldReset = prior.resetKey !== resetKey || prior.positionId !== positionId ||
      prior.ballSlot !== ballSlot || prior.boundaryRef !== boundaryRef
    previousPlacement.current = { resetKey, positionId, ballSlot, boundaryRef }
    const bounds = boundaryRef.current
    const saved = useRightDock() ? null : loadPersistentWidgetPosition(ballStorageId())
    clampBall(saved?.x ?? (bounds?.clientWidth ?? window.innerWidth) - BALL_SIZE - 12,
      saved?.y ?? ((useRightDock() ? 160 : Math.min(220, (bounds?.clientHeight ?? window.innerHeight) * 0.3)) + ballSlot * 68))
    if (shouldReset) setCollapsed(true)
    // Routine changes reset existing tools to independently accessible balls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, positionId, ballSlot, boundaryRef, dockRight])

  useLayoutEffect(() => {
    if (!expandRequest) {
      previousExpandRequest.current = false
      return
    }
    if (previousExpandRequest.current) return
    previousExpandRequest.current = true
    setCollapsed(false)
  }, [expandRequest])

  useEffect(() => {
    if (!expandRequest) {
      expandRequestConsumed.current = false
      return
    }
    if (expandRequestConsumed.current) return
    expandRequestConsumed.current = true
    onExpandRequestConsumed?.()
  }, [expandRequest, onExpandRequestConsumed])

  useLayoutEffect(() => {
    const id = placementId.current
    if (collapsed && visible && present && portalHost && !docked && showBall) clampBall(ballX.get(), ballY.get())
    else ballPlacements.delete(id)
    return () => { ballPlacements.delete(id) }
    // Reconcile when a ball becomes visible or joins its actual portal boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, visible, present, portalHost, docked, showBall])

  const rememberBall = () => savePersistentWidgetPosition(ballStorageId(), ballX.get(), ballY.get())

  /**
   * Let go of a ball and it settles on the nearer side edge, clear of the
   * other balls — so tools line up along the sides instead of being left
   * wherever a finger lifted, mid-page.
   */
  const settleBall = () => {
    const width = boundaryRef.current?.clientWidth ?? window.innerWidth
    const fromX = ballX.get()
    const fromY = ballY.get()
    const edgeX = useRightDock() ? width - BALL_SIZE - 12 : fromX + BALL_SIZE / 2 < width / 2 ? 12 : width - BALL_SIZE - 12
    clampBall(edgeX, fromY)
    const toX = ballX.get()
    const toY = ballY.get()
    rememberBall()
    if (reducedMotion) return
    ballX.set(fromX)
    ballY.set(fromY)
    void animate(ballX, toX, iosDragRelease)
    void animate(ballY, toY, iosDragRelease)
  }

  useLayoutEffect(() => {
    if (!collapsed || docked || !showBall) return
    let previousWidth = boundaryRef.current?.clientWidth
    const resize = () => {
      if (ballGesture.current) return
      const width = boundaryRef.current?.clientWidth
      const rotated = width !== undefined && previousWidth !== undefined && Math.abs(width - previousWidth) > 8
      previousWidth = width
      clampBall(rotated && useRightDock() ? width! - BALL_SIZE - 12 : ballX.get(), ballY.get())
    }
    const observer = new ResizeObserver(resize)
    if (boundaryRef.current) observer.observe(boundaryRef.current)
    window.addEventListener('resize', resize)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize) }
    // Motion values are stable; clamp reads the current boundary dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, docked, showBall, boundaryRef, ballX, ballY])

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
    } else if (dragged.current) settleBall()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const collapse = () => {
    const widget = widgetRef.current
    if (!widget) return
    if (!docked && showBall) {
      const width = boundaryRef.current?.clientWidth ?? window.innerWidth
      const cornerX = x.get() + widget.offsetWidth - BALL_SIZE
      clampBall(useRightDock() ? width - BALL_SIZE - 12 : cornerX + BALL_SIZE / 2 < width / 2 ? 12 : width - BALL_SIZE - 12, y.get())
      rememberBall()
    }
    transferFocus.current = widget.contains(document.activeElement)
    dragged.current = false
    setCollapsed(true)
  }

  const expand = () => {
    if (dragged.current) { dragged.current = false; return }
    const bounds = boundaryRef.current
    const widget = widgetRef.current
    if (!bounds || !widget) return
    const ballRect = docked ? ballRef.current?.getBoundingClientRect() : null
    const boundsRect = bounds.getBoundingClientRect()
    const fromX = ballRect ? ballRect.right - boundsRect.left - widget.offsetWidth : ballX.get() + BALL_SIZE - widget.offsetWidth
    const fromY = ballRect ? ballRect.top - boundsRect.top : ballY.get()
    const next = clampWidgetPosition(bounds.clientWidth, bounds.clientHeight,
      widget.offsetWidth, widget.offsetHeight, fromX, fromY)
    x.set(next.x)
    y.set(next.y)
    saveWidgetPosition(positionId, next.x, next.y)
    onRestore?.(next)
    transferFocus.current = document.activeElement === ballRef.current
    ballPlacements.delete(placementId.current)
    reportFeatureAction('widget-expanded')
    setCollapsed(false)
  }

  const ball = collapsed && visible && present && showBall ? <>
    <motion.button
    ref={ballRef} type="button" className={`widget-ball pointer-events-auto${docked ? ' widget-ball--docked' : ''}`}
    aria-label={`Expand ${label}${detail ? `, ${detail}` : ''}`} aria-expanded={false}
    title={`Open ${label}`} data-active={active}
    style={{ x: ballX, y: ballY, order: ballSlot }}
    onPointerDown={docked ? undefined : startBallDrag}
    onPointerMove={docked ? undefined : moveBall}
    onPointerUp={docked ? undefined : event => endBallDrag(event)}
    onPointerCancel={docked ? undefined : event => endBallDrag(event, true)}
    onLostPointerCapture={docked ? undefined : event => endBallDrag(event, true)}
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
    {icon}<span>{detail ?? label}</span><ChevronDown className="widget-ball__expand" aria-hidden /><i aria-hidden />
    </motion.button>
  </> : null

  return { collapsed, collapse, ball: ball && portalHost ? createPortal(ball, portalHost) : ball,
    panelAnimation: { opacity: collapsed ? 0 : 1, scale: collapsed && !reducedMotion ? 0.94 : 1 } }
}
