import { useTakeGuidance } from '../context/TakeGuidanceContext'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { motion, useDragControls, useMotionValue, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight, MoveDiagonal2, Pin, RotateCcw, Share, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import BestTakeBox from './BestTakeBox'
import { clampTakeCardScale, loadTakeCardScale, saveTakeCardScale } from '../utils/takeCardSize'
import { isYoutubeDialogOpen } from '../utils/youtubeDialogState'
import PipWindow from './PipWindow'
import Pressable from './ui/Pressable'
import { useDragToPin, type PipDragUiState } from '../hooks/useDragToPin'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { iosDragGhostTransition, iosDragRelease, motionGpuLayer } from '../utils/motionPresets'
import { takeHasPlaybackMedia } from '../utils/takes'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import {
  loadPersistentWidgetPosition,
  savePersistentWidgetPosition,
} from '../utils/floatingWidgetLayout'
import {
  triggerConfirmedLongPressHaptic,
  triggerDragStartHaptic,
  triggerLightHaptic,
  warmHaptics,
} from '../utils/haptics'
import { readPhysicalUiPortal } from '../utils/physicalUiPortal'
import { useTutorialAction } from '../context/TutorialContext'

export interface PipCompareRowProps {
  compact?: boolean
  boundaryRef: RefObject<HTMLElement | null>
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  challengerTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  deleteDropRef: RefObject<HTMLElement | null>
  onPinBenchmark: (takeId: string) => void
  onMoveBenchmarkToCurrent: (takeId: string) => void
  onDeleteTake: (takeId: string) => void
  onUnpinBenchmark: () => void
  onClearLibraryReference?: () => void
  onUnpinChallenger: () => void
  onUploadBenchmark: (file: File) => void
  onSubmitYoutube: (embedUrl: string) => void
  onClearYoutube: () => void
  onToggleSplitView: () => void
  /** Share the seated take from its own tile. Absent for YouTube/library references. */
  onShareBenchmark?: () => void
  onShareChallenger?: () => void
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onDragStateChange?: (state: PipDragUiState) => void
  onBenchmarkPlaybackChange?: (playing: boolean) => void
  onChallengerPlaybackChange?: (playing: boolean) => void
  challengerAutoPlayRequestId?: string | null
  onChallengerAutoPlayComplete?: () => void
  hapticFeedback?: boolean
  positioningActive?: boolean
  showPinCurrentAsBest?: boolean
  onPinCurrentAsBest?: () => void
  onYoutubeHostChange?: (el: HTMLDivElement | null) => void
  youtubeIframeRef?: RefObject<HTMLIFrameElement | null>
}

function formatCompactDuration(duration?: number): string | null {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return null
  const rounded = Math.max(0, Math.round(duration))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatCompactTimestamp(timestamp?: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null
  const age = Date.now() - timestamp
  if (age >= 0 && age < 45_000) return 'Just now'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CompactTakeCaption({
  label,
  tone,
  name,
  timestamp,
  duration,
  hasMedia,
  youtube = false,
  library = false,
  onOpen,
  hapticFeedback,
  dragSourceProps,
  dragSourceActive = false,
  dragSourceArming = false,
  dataTutorial,
}: {
  label: string
  tone: 'best' | 'current'
  name: string
  timestamp?: number
  duration?: number
  hasMedia: boolean
  youtube?: boolean
  library?: boolean
  onOpen?: () => void
  hapticFeedback: boolean
  dragSourceProps?: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
    style?: CSSProperties
  }
  dragSourceActive?: boolean
  dragSourceArming?: boolean
  dataTutorial?: string
}) {
  const cue = useTakeGuidance(tone, hasMedia)
  const formattedDuration = formatCompactDuration(duration)
  const formattedTimestamp = formatCompactTimestamp(timestamp)
  const source = youtube ? 'YouTube' : library ? 'Library' : formattedTimestamp
  const detail =
    [source, formattedDuration].filter(Boolean).join(' · ') ||
    (tone === 'best' ? '' : 'Record a take')

  const content = (
    <>
      <span className="compact-take-caption__name">{hasMedia ? name : tone === 'best' ? 'Pin your best take' : 'Ready to record'}</span>
      {cue.visible ? <span className="take-guidance-label" role="status">{cue.label}</span> : hasMedia && detail && <span className="compact-take-caption__detail">{detail}</span>}
    </>
  )

  const captionClassName = `compact-take-caption compact-take-caption--${tone} ${
    dragSourceActive ? 'compact-take-caption--dragging' : ''
  } ${dragSourceArming ? 'compact-take-caption--arming' : ''}`

  if (hasMedia && onOpen && dragSourceProps) {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onOpen()
    }

    return (
      <div
        role="button"
        tabIndex={0}
        className={captionClassName}
        data-tutorial={dataTutorial}
        aria-label={`Drag ${label} directly to the other card, or tap for full-screen playback. Long press this caption to reposition the card.`}
        onKeyDown={handleKeyDown}
        {...dragSourceProps}
      >
        {content}
      </div>
    )
  }

  return onOpen ? (
    <Pressable
      type="button"
      intensity="soft"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className={captionClassName}
      data-tutorial={dataTutorial}
      onClick={onOpen}
      aria-label={`Open full-screen playback of ${label}`}
    >
      {content}
    </Pressable>
  ) : (
    <div className={captionClassName}>{content}</div>
  )
}

const TAKE_CARD_MOVE_HOLD_MS = 425
const TAKE_CARD_MOVE_CANCEL_PX = 12
const TAKE_CARD_BOUNDARY_INSET = 8
const TAKE_CARD_DRAG_COMPLETION_PX = 3
const viewportChangedEnoughToReposition = (
  previous: { width: number; height: number },
  next: { width: number; height: number },
) => Math.abs(next.width - previous.width) > 80 || Math.abs(next.height - previous.height) > 200

function MovableTakeSlot({
  movable,
  onOpenFullScreen,
  editing,
  onEnterEditing,
  onLayoutDragCompleted,
  resetNonce,
  wiggleDirection,
  positionId,
  boundaryRef,
  dropRef,
  positioningActive,
  transferDragSourceProps,
  consumeTransferClick,
  className,
  dataTutorial,
  hapticFeedback,
  children,
}: {
  movable: boolean
  onOpenFullScreen: () => void
  editing: boolean
  onEnterEditing: () => void
  onLayoutDragCompleted: () => void
  resetNonce: number
  wiggleDirection: -1 | 1
  positionId: string
  boundaryRef: RefObject<HTMLElement | null>
  dropRef: RefObject<HTMLDivElement | null>
  positioningActive: boolean
  transferDragSourceProps?: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  }
  consumeTransferClick?: () => boolean
  className: string
  dataTutorial?: string
  hapticFeedback: boolean
  children: ReactNode
}) {
  const dragControls = useDragControls()
  const slotNodeRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()
  const savedPosition = useRef(loadPersistentWidgetPosition(positionId))
  const [cardScale, setCardScale] = useState(() => loadTakeCardScale(positionId))
  const resizeRef = useRef<{ x: number; y: number; scale: number; width: number; height: number } | null>(null)
  const lastViewportSize = useRef({ width: window.innerWidth, height: window.innerHeight })
  const dragX = useMotionValue(savedPosition.current?.x ?? 0)
  const dragY = useMotionValue(savedPosition.current?.y ?? 0)
  const handledResetNonceRef = useRef(resetNonce)
  const pressRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    event: globalThis.PointerEvent
  } | null>(null)
  const holdTimerRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const enteringEditingRef = useRef(false)
  const dragTravelRef = useRef(0)
  const suppressClickRef = useRef(false)
  const suppressReleaseTimerRef = useRef<number | null>(null)
  const [armed, setArmed] = useState(false)
  const [dragging, setDragging] = useState(false)

  const clampPositionToBoundary = useCallback(() => {
    if (!positioningActive || !movable || editing || draggingRef.current) return
    // Dialog/keyboard geometry is temporary, not a new position for the cards.
    if (isYoutubeDialogOpen() || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
    const node = slotNodeRef.current
    const boundary = boundaryRef.current
    if (!node || !boundary) return

    const currentX = dragX.get()
    const currentY = dragY.get()
    if (!savedPosition.current && currentX === 0 && currentY === 0) return
    const rect = node.getBoundingClientRect()
    const bounds = boundary.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
      return
    }

    const centerX = (rect.left + rect.right) / 2 - currentX
    const centerY = (rect.top + rect.bottom) / 2 - currentY
    const baseLeft = centerX - node.offsetWidth * cardScale / 2
    const baseRight = centerX + node.offsetWidth * cardScale / 2
    const baseTop = centerY - node.offsetHeight * cardScale / 2
    const baseBottom = centerY + node.offsetHeight * cardScale / 2
    const minX = bounds.left + TAKE_CARD_BOUNDARY_INSET - baseLeft
    const maxX = bounds.right - TAKE_CARD_BOUNDARY_INSET - baseRight
    const minY = bounds.top + TAKE_CARD_BOUNDARY_INSET - baseTop
    const maxY = bounds.bottom - TAKE_CARD_BOUNDARY_INSET - baseBottom
    const clampAxis = (value: number, min: number, max: number) =>
      min <= max
        ? Math.min(max, Math.max(min, value))
        : (min + max) / 2
    const nextX = clampAxis(currentX, minX, maxX)
    const nextY = clampAxis(currentY, minY, maxY)
    if (Math.abs(nextX - currentX) < 0.5 && Math.abs(nextY - currentY) < 0.5) {
      return
    }

    dragX.set(nextX)
    dragY.set(nextY)
    // Viewport correction is temporary; only a deliberate drag is persisted.
  }, [boundaryRef, cardScale, dragX, dragY, editing, movable, positioningActive])

  useLayoutEffect(() => {
    if (!positioningActive) return
    if (isYoutubeDialogOpen() || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
    const size = { width: window.innerWidth, height: window.innerHeight }
    if (!viewportChangedEnoughToReposition(lastViewportSize.current, size)) return
    lastViewportSize.current = size
    clampPositionToBoundary()
  }, [clampPositionToBoundary, positioningActive])

  useEffect(() => {
    let frame: number | null = null
    const scheduleClamp = () => {
      if (!positioningActive) return
      if (isYoutubeDialogOpen() || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      const size = { width: window.innerWidth, height: window.innerHeight }
      if (!viewportChangedEnoughToReposition(lastViewportSize.current, size)) return
      lastViewportSize.current = size
      if (frame !== null) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        frame = null
        clampPositionToBoundary()
      })
    }

    window.addEventListener('resize', scheduleClamp)
    window.addEventListener('orientationchange', scheduleClamp)

    return () => {
      window.removeEventListener('resize', scheduleClamp)
      window.removeEventListener('orientationchange', scheduleClamp)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [clampPositionToBoundary, positioningActive])

  useEffect(() => {
    if (handledResetNonceRef.current === resetNonce) return
    handledResetNonceRef.current = resetNonce
    dragX.set(0)
    dragY.set(0)
    savedPosition.current = null
    setCardScale(1)
    saveTakeCardScale(positionId, 1)
    savePersistentWidgetPosition(positionId, 0, 0)
  }, [dragX, dragY, positionId, resetNonce])

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const releaseClickSuppressionSoon = useCallback(() => {
    if (suppressReleaseTimerRef.current !== null) {
      window.clearTimeout(suppressReleaseTimerRef.current)
    }
    suppressReleaseTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
      suppressReleaseTimerRef.current = null
    }, 250)
  }, [])

  const finishPress = useCallback(
    (pointerId?: number) => {
      if (
        pointerId !== undefined &&
        pressRef.current &&
        pressRef.current.pointerId !== pointerId
      ) {
        return
      }
      clearHoldTimer()
      pressRef.current = null
      if (!draggingRef.current) {
        setArmed(false)
        releaseClickSuppressionSoon()
      }
    },
    [clearHoldTimer, releaseClickSuppressionSoon],
  )

  useEffect(() => {
    const handleGlobalPointerEnd = (event: globalThis.PointerEvent) => {
      finishPress(event.pointerId)
    }
    const handleBlur = () => finishPress()

    window.addEventListener('pointerup', handleGlobalPointerEnd)
    window.addEventListener('pointercancel', handleGlobalPointerEnd)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd)
      window.removeEventListener('pointercancel', handleGlobalPointerEnd)
      window.removeEventListener('blur', handleBlur)
      clearHoldTimer()
      if (suppressReleaseTimerRef.current !== null) {
        window.clearTimeout(suppressReleaseTimerRef.current)
      }
    }
  }, [clearHoldTimer, finishPress])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!movable || event.button !== 0) return
      const target = event.target as HTMLElement
      // React portal events still bubble through this card, even outside its DOM.
      if (!slotNodeRef.current?.contains(target)) return
      if (target.closest('button, a, input, textarea, select, [contenteditable="true"], [data-card-move-ignore]') && !target.closest('.compact-take-caption')) return
      // The card body transfers a take on movement; only its caption arms
      // layout editing on a long press so a slow media drag cannot move the box.
      if (transferDragSourceProps && !target.closest('.compact-take-caption, .compact-take-caption__label')) return

      clearHoldTimer()
      if (hapticFeedback) warmHaptics()
      pressRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        event: event.nativeEvent,
      }

      if (editing) {
        enteringEditingRef.current = false
        suppressClickRef.current = true
        setArmed(true)
        dragControls.start(event.nativeEvent, { snapToCursor: false })
        return
      }

      holdTimerRef.current = window.setTimeout(() => {
        const press = pressRef.current
        if (!press) return
        suppressClickRef.current = true
        setArmed(true)
        enteringEditingRef.current = true
        onEnterEditing()
        if (hapticFeedback) {
          void triggerConfirmedLongPressHaptic()
        }
        dragControls.start(press.event, { snapToCursor: false })
      }, TAKE_CARD_MOVE_HOLD_MS)
    },
    [
      clearHoldTimer,
      dragControls,
      editing,
      hapticFeedback,
      movable,
      onEnterEditing,
      transferDragSourceProps,
    ],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const press = pressRef.current
      if (!press || press.pointerId !== event.pointerId || armed) return
      const distance = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY,
      )
      if (distance > TAKE_CARD_MOVE_CANCEL_PX) {
        clearHoldTimer()
        pressRef.current = null
      }
    },
    [armed, clearHoldTimer],
  )

  const handleDragStart = useCallback(() => {
    draggingRef.current = true
    dragTravelRef.current = 0
    suppressClickRef.current = true
    setDragging(true)
    if (editing && hapticFeedback && !enteringEditingRef.current) {
      void triggerDragStartHaptic()
    }
    enteringEditingRef.current = false
  }, [editing, hapticFeedback])

  const handleDragEnd = useCallback(() => {
    const completedLayoutDrag = dragTravelRef.current >= TAKE_CARD_DRAG_COMPLETION_PX
    if (completedLayoutDrag) {
      savedPosition.current = { x: dragX.get(), y: dragY.get() }
      savePersistentWidgetPosition(positionId, dragX.get(), dragY.get())
    }
    draggingRef.current = false
    pressRef.current = null
    setDragging(false)
    setArmed(false)
    releaseClickSuppressionSoon()
    dragTravelRef.current = 0
    if (completedLayoutDrag) onLayoutDragCompleted()
  }, [dragX, dragY, onLayoutDragCompleted, positionId, releaseClickSuppressionSoon])

  const assignDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      slotNodeRef.current = node
      dropRef.current = node
    },
    [dropRef],
  )

  return (
    <motion.div
      initial={false}
      ref={assignDropRef}
      className={`${className} ${
        movable ? 'compact-take-slot--movable' : ''
      } ${editing ? 'compact-take-slot--layout-editing' : ''} ${
        editing && wiggleDirection > 0 ? 'compact-take-slot--wiggle-reverse' : ''
      } ${armed ? 'compact-take-slot--move-armed' : ''} ${
        dragging ? 'compact-take-slot--repositioning' : ''
      }`}
      data-tutorial={dataTutorial}
      data-movable-take-card={movable ? 'true' : undefined}
      drag={movable}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={boundaryRef}
      dragElastic={0}
      dragMomentum={false}
      onPointerDownCapture={(event) => {
        if ((event.target as HTMLElement).closest('[data-take-media-drag]')) {
          transferDragSourceProps?.onPointerDown(event)
        }
      }}
      onPointerDown={(event) => {
        handlePointerDown(event)
        if (!(event.target as HTMLElement).closest('.compact-take-caption')) {
          transferDragSourceProps?.onPointerDown(event)
        }
      }}
      onPointerMove={(event) => {
        handlePointerMove(event)
        transferDragSourceProps?.onPointerMove(event)
      }}
      onPointerUp={(event) => {
        transferDragSourceProps?.onPointerUp(event)
        finishPress(event.pointerId)
      }}
      onPointerCancel={(event) => {
        transferDragSourceProps?.onPointerCancel(event)
        finishPress(event.pointerId)
      }}
      onDragStart={handleDragStart}
      onDrag={(_event, info) => {
        dragTravelRef.current = Math.max(
          dragTravelRef.current,
          Math.hypot(info.offset.x, info.offset.y),
        )
      }}
      onDragEnd={handleDragEnd}
      onClickCapture={(event) => {
        if (consumeTransferClick?.()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (!suppressClickRef.current) {
          // Transfer surfaces own their tap as well as their drag gesture.
          const target = event.target as HTMLElement
          if (transferDragSourceProps && !target.closest('button, a, input, [data-card-move-ignore]')) return
          if (movable && !editing && slotNodeRef.current?.contains(target) &&
              !target.closest('.compact-take-caption, .pip-drag-layer, button, a, input, [data-card-move-ignore]')) onOpenFullScreen()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        suppressClickRef.current = false
      }}
      animate={
        editing && !dragging
          ? {
              scale: cardScale,
              rotate:
                wiggleDirection < 0
                  ? [-0.38, 0.38, -0.38]
                  : [0.38, -0.38, 0.38],
            }
          : { scale: movable ? cardScale : 1, rotate: 0 }
      }
      transition={
        editing && !dragging
          ? {
              ...iosDragRelease,
              scale: { duration: 0 },
              rotate: { duration: 0.24, repeat: Infinity, ease: 'linear' },
            }
          : reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }
      }
      style={movable ? { x: dragX, y: dragY, transformOrigin: 'center center' } : undefined}
    >
      {children}
      {movable && editing && <button
        type="button" className="take-card-resize-handle" data-card-move-ignore
        aria-label="Resize take card. Drag to resize or use arrow keys."
        onClick={event => { event.preventDefault(); event.stopPropagation() }}
        onPointerDown={event => {
          event.preventDefault(); event.stopPropagation()
          const node = slotNodeRef.current
          if (!node) return
          suppressClickRef.current = true
          resizeRef.current = { x:event.clientX, y:event.clientY, scale:cardScale, width:node.offsetWidth, height:node.offsetHeight }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={event => {
          const start = resizeRef.current
          const node = slotNodeRef.current
          const boundary = boundaryRef.current
          if (!start || !node || !boundary) return
          event.stopPropagation()
          const rect = node.getBoundingClientRect(), bounds = boundary.getBoundingClientRect()
          const cx = (rect.left + rect.right)/2, cy = (rect.top + rect.bottom)/2
          const max = Math.min(2, 2*Math.min(cx-bounds.left-12,bounds.right-cx-12)/start.width, 2*Math.min(cy-bounds.top-12,bounds.bottom-cy-12)/start.height)
          const delta = ((event.clientX-start.x)*start.width + (event.clientY-start.y)*start.height)*2/(start.width**2+start.height**2)
          setCardScale(clampTakeCardScale(start.scale + delta, max))
        }}
        onPointerUp={event => {
          if (!resizeRef.current) return
          event.stopPropagation(); resizeRef.current = null
          saveTakeCardScale(positionId, cardScale)
          savePersistentWidgetPosition(positionId, dragX.get(), dragY.get())
          savedPosition.current = {x:dragX.get(),y:dragY.get()}
          onLayoutDragCompleted(); releaseClickSuppressionSoon()
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => {
          if (resizeRef.current) setCardScale(resizeRef.current.scale)
          resizeRef.current = null; releaseClickSuppressionSoon()
        }}
        onKeyDown={event => {
          if (!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key)) return
          event.preventDefault(); event.stopPropagation()
          const next = clampTakeCardScale(cardScale + (['ArrowUp','ArrowRight'].includes(event.key) ? .1 : -.1))
          setCardScale(next); saveTakeCardScale(positionId,next)
        }}
      ><MoveDiagonal2 aria-hidden /></button>}
    </motion.div>
  )
}

function CompactTakeClearButton({
  label,
  onClear,
  hapticFeedback,
}: {
  label: string
  onClear: () => void
  hapticFeedback: boolean
}) {
  return (
    <Pressable
      type="button"
      intensity="icon"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className="compact-take-card__clear"
      data-card-move-ignore
      onClick={onClear}
      aria-label={`Unload ${label}`}
    >
      <X aria-hidden />
    </Pressable>
  )
}

/**
 * Share lives on the tile the player is looking at: the same round glass
 * button as the pin, beside it. The keeper should leave from here, not from
 * two screens away in Vault.
 */
function CompactShareButton({
  label,
  onShare,
  hapticFeedback,
}: {
  label: string
  onShare: () => void
  hapticFeedback: boolean
}) {
  return (
    <Pressable
      type="button"
      intensity="icon"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className="compact-take-card__share"
      data-card-move-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onShare()
      }}
      aria-label={`Share ${label}`}
      title={`Share ${label}`}
    >
      <Share aria-hidden />
    </Pressable>
  )
}

function CompactPinCurrentButton({
  onPin,
  hapticFeedback,
}: {
  onPin: () => void
  hapticFeedback: boolean
}) {
  const notifyTutorial = useTutorialAction()

  return (
    <Pressable
      type="button"
      intensity="icon"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className="compact-take-card__pin"
      data-tutorial="pin-current-as-best"
      data-card-move-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onPin()
        notifyTutorial?.('current-take-pinned')
      }}
      aria-label="Pin current take as Best Take"
      title="Pin as Best Take"
    >
      <Pin aria-hidden />
    </Pressable>
  )
}

function TakeCardLayoutToolbar({
  onReset,
  hapticFeedback,
}: {
  onReset: () => void
  hapticFeedback: boolean
}) {
  return (
    <motion.div
      className="take-card-layout-toolbar pointer-events-auto"
      data-take-card-layout-toolbar
      role="status"
      aria-label="Take card layout editing is active. Tap outside the cards when finished."
      initial={{ opacity: 0, y: -6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={iosDragRelease}
    >
      <span className="take-card-layout-toolbar__copy">
        <strong>Arrange Take Cards</strong>
        <small>Drag to move · corner to resize</small>
      </span>
      <Pressable
        type="button"
        intensity="soft"
        squish={false}
        haptic="success"
        hapticFeedback={hapticFeedback}
        className="take-card-layout-toolbar__reset"
        data-card-move-ignore
        onClick={onReset}
        aria-label="Reset take cards to their default sizes and positions"
      >
        <RotateCcw aria-hidden />
        <span>Reset</span>
      </Pressable>
    </motion.div>
  )
}

export function PipDragGhost({
  take,
  x,
  y,
  overPin,
  overDelete,
  actionLabel = 'Move',
  actionTone = 'best',
}: {
  take: Take
  x: number
  y: number
  overPin: boolean
  overDelete: boolean
  actionLabel?: string
  actionTone?: 'best' | 'current'
}) {
  const poster =
    take.thumbnailUrl ||
    (take.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : undefined)

  return (
    <div
      className="pip-drag-ghost pointer-events-none fixed z-[60]"
      style={{
        ...motionGpuLayer,
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <motion.div
        className={`pip-drag-ghost-inner ui-orient-spin overflow-hidden rounded-xl border-[0.5px] bg-black shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-2 ${
          overDelete
            ? 'border-red-400/70 ring-red-400/50'
            : overPin && actionTone === 'best'
              ? 'border-amber-300/80 ring-amber-300/55'
              : overPin
                ? 'border-sky-300/80 ring-sky-300/55'
                : 'border-white/20 ring-white/20'
        }`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: overDelete ? 1.05 : 1 }}
        transition={iosDragGhostTransition}
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-black" />
        )}
        <span
          className={`absolute bottom-1 left-1 rounded px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-white ${
            overDelete
              ? 'bg-red-500/90'
              : overPin && actionTone === 'best'
                ? 'bg-amber-500/95'
                : 'bg-sky-500/90'
          }`}
        >
          {overDelete ? 'Delete' : overPin ? `Release · ${actionLabel}` : actionLabel}
        </span>
      </motion.div>
    </div>
  )
}

export default memo(function PipCompareRow({
  compact = false,
  boundaryRef,
  benchmarkTake,
  libraryBenchmarkPlayback,
  challengerTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  deleteDropRef,
  onPinBenchmark,
  onMoveBenchmarkToCurrent,
  onDeleteTake,
  onUnpinBenchmark,
  onClearLibraryReference,
  onUnpinChallenger,
  onSubmitYoutube,
  onClearYoutube,
  onToggleSplitView,
  onShareBenchmark,
  onShareChallenger,
  onExpandBenchmark,
  onExpandChallenger,
  onDragStateChange,
  onBenchmarkPlaybackChange,
  onChallengerPlaybackChange,
  challengerAutoPlayRequestId = null,
  onChallengerAutoPlayComplete,
  hapticFeedback = true,
  positioningActive = true,
  showPinCurrentAsBest = false,
  onPinCurrentAsBest,
  onYoutubeHostChange,
  youtubeIframeRef,
}: PipCompareRowProps) {
  const notifyTutorial = useTutorialAction()
  const benchmarkDropRef = useRef<HTMLDivElement>(null)
  const challengerDropRef = useRef<HTMLDivElement>(null)
  const cancelTransferDragsRef = useRef<() => void>(() => {})
  const layoutMovedRef = useRef(false)
  const [layoutEditing, setLayoutEditing] = useState(false)
  const openBestFullScreen = useCallback(() => {
    if (layoutEditing) return
    onExpandBenchmark?.()
  }, [layoutEditing, onExpandBenchmark])
  const openCurrentFullScreen = useCallback(() => {
    if (layoutEditing) return
    onExpandChallenger?.()
  }, [layoutEditing, onExpandChallenger])
  const [layoutResetNonce, setLayoutResetNonce] = useState(0)

  const enterLayoutEditing = useCallback(() => {
    cancelTransferDragsRef.current()
    layoutMovedRef.current = false
    setLayoutEditing(true)
    notifyTutorial?.('take-card-layout-entered')
  }, [notifyTutorial])

  useEffect(() => {
    if (compact) return
    setLayoutEditing(false)
  }, [compact])

  useEffect(() => {
    if (!layoutEditing) return

    document.body.classList.add('take-card-layout-editing')
    const finishOnOutsideTap = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          '[data-movable-take-card], [data-take-card-layout-toolbar]',
        )
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      const completedLayoutDrag = layoutMovedRef.current
      layoutMovedRef.current = false
      setLayoutEditing(false)
      if (completedLayoutDrag) {
        notifyTutorial?.('take-card-layout-finished')
      }
      if (hapticFeedback) triggerLightHaptic()
    }

    window.addEventListener('pointerdown', finishOnOutsideTap, true)
    return () => {
      document.body.classList.remove('take-card-layout-editing')
      window.removeEventListener('pointerdown', finishOnOutsideTap, true)
    }
  }, [hapticFeedback, layoutEditing, notifyTutorial])

  const resetTakeCardLayout = useCallback(() => {
    setLayoutResetNonce((nonce) => nonce + 1)
  }, [])

  const transferCurrentToBest = useCallback(
    (takeId: string) => {
      onPinBenchmark(takeId)
      notifyTutorial?.('take-card-transfer-completed')
    },
    [notifyTutorial, onPinBenchmark],
  )

  const transferBestToCurrent = useCallback(
    (takeId: string) => {
      // When both slots are occupied, promoting Current through the normal Best
      // handler performs a true swap: the old Best becomes Current. Copying the
      // Best id into Current would leave two identical cards.
      if (challengerTake?.id && challengerTake.id !== takeId) {
        onPinBenchmark(challengerTake.id)
      } else {
        onMoveBenchmarkToCurrent(takeId)
      }
      notifyTutorial?.('take-card-transfer-completed')
    },
    [
      challengerTake?.id,
      notifyTutorial,
      onMoveBenchmarkToCurrent,
      onPinBenchmark,
    ],
  )

  const markLayoutDragCompleted = useCallback(() => {
    layoutMovedRef.current = true
  }, [])

  const benchmarkAcceptsTakeTransfer = !libraryBenchmarkPlayback && !youtubeEmbedUrl
  const benchmarkTransferIsSwap = Boolean(
    challengerTake?.id && challengerTake.id !== benchmarkTake?.id,
  )
  const benchmarkTransferLabel = benchmarkTransferIsSwap ? 'Swap Takes' : 'Move to Current'
  const challengerTransferEnabled =
    !layoutEditing &&
    benchmarkAcceptsTakeTransfer &&
    takeHasPlaybackMedia(challengerTake)

  const {
    ghost: challengerGhost,
    isDragging: challengerDragging,
    isArming: challengerArming,
    dragSourceProps: challengerDragSourceProps,
    consumeSuppressedClick: consumeChallengerClick,
    cancelDrag: cancelChallengerDrag,
  } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    deleteDropTargetRef: deleteDropRef,
    onPin: transferCurrentToBest,
    onDelete: onDeleteTake,
    onTap: compact ? openCurrentFullScreen : onExpandChallenger,
    onDragStateChange,
    enabled: challengerTransferEnabled,
    activationMode: compact ? 'move' : 'hold',
    dragThresholdPx: compact ? 8 : undefined,
    allowMediaButtonDrag: compact,
    hapticFeedback,
  })

  const {
    ghost: benchmarkGhost,
    isDragging: benchmarkDragging,
    isArming: benchmarkArming,
    dragSourceProps: benchmarkDragSourceProps,
    consumeSuppressedClick: consumeBenchmarkClick,
    cancelDrag: cancelBenchmarkDrag,
  } = useDragToPin({
    sourceTakeId: libraryBenchmarkPlayback || youtubeEmbedUrl ? null : benchmarkTake?.id ?? null,
    dropTargetRef: challengerDropRef,
    onPin: transferBestToCurrent,
    onTap: compact ? openBestFullScreen : onExpandBenchmark,
    enabled:
      !layoutEditing &&
      takeHasPlaybackMedia(benchmarkTake) &&
      !libraryBenchmarkPlayback &&
      !youtubeEmbedUrl,
    activationMode: compact ? 'move' : 'hold',
    dragThresholdPx: compact ? 8 : undefined,
    allowMediaButtonDrag: compact,
    commitHaptic: !challengerTake,
    hapticFeedback,
  })

  cancelTransferDragsRef.current = () => {
    cancelChallengerDrag()
    cancelBenchmarkDrag()
  }

  const compactBenchmarkHasMedia = Boolean(
    youtubeEmbedUrl || libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake),
  )
  const clearCompactBenchmark = youtubeEmbedUrl
    ? onClearYoutube
    : libraryBenchmarkPlayback
    ? onClearLibraryReference ?? onUnpinBenchmark
    : onUnpinBenchmark
  const compactCurrentHasMedia = takeHasPlaybackMedia(challengerTake)
  const compactCurrentShowPin = Boolean(
    compact &&
    compactCurrentHasMedia &&
    showPinCurrentAsBest &&
    onPinCurrentAsBest,
  )

  return (
    <>
      <div
        className={`app-pip-row ${compact ? 'app-pip-row--compact' : ''}`}
        data-tutorial="pip-row"
      >
        <MovableTakeSlot
          movable={compact}
          onOpenFullScreen={openBestFullScreen}
          editing={layoutEditing}
          onEnterEditing={enterLayoutEditing}
          onLayoutDragCompleted={markLayoutDragCompleted}
          resetNonce={layoutResetNonce}
          wiggleDirection={-1}
          positionId="camera-best-take-card-v2"
          boundaryRef={boundaryRef}
          dropRef={benchmarkDropRef}
          positioningActive={positioningActive}
          transferDragSourceProps={compact && !layoutEditing && takeHasPlaybackMedia(benchmarkTake) &&
            benchmarkAcceptsTakeTransfer ? benchmarkDragSourceProps : undefined}
          consumeTransferClick={consumeBenchmarkClick}
          hapticFeedback={hapticFeedback}
          className={`app-pip-slot pointer-events-auto ${
            compact ? 'compact-take-slot compact-take-slot--best' : ''
          } ${
            compact && challengerDragging && !challengerGhost?.overDelete
              ? 'compact-take-slot--transfer-ready'
              : ''
          } ${
            compact && challengerGhost?.overPin ? 'compact-take-slot--drop-active' : ''
          }`}
        >
          {compact && <span className="compact-take-caption__label">Best Take</span>}
          <BestTakeBox
            layout="pip"
            allowReferenceSources={false}
            compact={compact}
            take={benchmarkTake}
            libraryPlayback={libraryBenchmarkPlayback}
            youtubeEmbedUrl={youtubeEmbedUrl}
            suspendPlayback={suspendPipPlayback}
            videoRef={benchmarkPipVideoRef}
            dropHighlight={challengerGhost?.overPin ?? false}
            onUnpinTake={onUnpinBenchmark}
            onClearLibraryReference={onClearLibraryReference}
            onClearYoutube={onClearYoutube}
            onSubmitYoutube={onSubmitYoutube}
            onToggleSplitView={onToggleSplitView}
            onExpand={
              libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake)
                ? onExpandBenchmark
                : undefined
            }
            onPlaybackChange={onBenchmarkPlaybackChange}
            onYoutubeHostChange={onYoutubeHostChange}
            youtubeIframeRef={youtubeIframeRef}
            dragSourceActive={benchmarkDragging}
            dragSourceArming={benchmarkArming}
            dragSourceProps={
              benchmarkAcceptsTakeTransfer &&
              !compact &&
              takeHasPlaybackMedia(benchmarkTake)
                ? benchmarkDragSourceProps
                : undefined
            }
          />
          {compact && (
            <CompactTakeCaption
              label="Best Take"
              tone="best"
              name={
                libraryBenchmarkPlayback?.name ??
                (youtubeEmbedUrl ? 'YouTube Reference' : benchmarkTake?.name ?? 'No best take')
              }
              timestamp={
                libraryBenchmarkPlayback || youtubeEmbedUrl
                  ? undefined
                  : benchmarkTake?.timestamp
              }
              duration={libraryBenchmarkPlayback?.duration ?? benchmarkTake?.duration}
              hasMedia={compactBenchmarkHasMedia}
              youtube={Boolean(youtubeEmbedUrl)}
              library={Boolean(libraryBenchmarkPlayback)}
              onOpen={openBestFullScreen}
              hapticFeedback={hapticFeedback}
              dragSourceProps={
                benchmarkAcceptsTakeTransfer &&
                !layoutEditing &&
                takeHasPlaybackMedia(benchmarkTake)
                  ? benchmarkDragSourceProps
                  : undefined
              }
              dragSourceActive={benchmarkDragging}
              dragSourceArming={benchmarkArming}
            />
          )}
          {compact && compactBenchmarkHasMedia && (
            <CompactTakeClearButton
              label="Best Take"
              onClear={clearCompactBenchmark}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && compactBenchmarkHasMedia && onShareBenchmark && (
            <CompactShareButton
              label="Best Take"
              onShare={onShareBenchmark}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && challengerDragging && !challengerGhost?.overDelete && (
            <span
              className={`compact-take-transfer-target compact-take-transfer-target--best ${
                challengerGhost?.overPin
                  ? 'compact-take-transfer-target--active'
                  : ''
              }`}
              aria-hidden
            >
              <Pin />
              <span>{challengerGhost?.overPin ? 'Release for Best' : 'Make Best'}</span>
            </span>
          )}
        </MovableTakeSlot>

        <MovableTakeSlot
          movable={compact}
          onOpenFullScreen={openCurrentFullScreen}
          editing={layoutEditing}
          onEnterEditing={enterLayoutEditing}
          onLayoutDragCompleted={markLayoutDragCompleted}
          resetNonce={layoutResetNonce}
          wiggleDirection={1}
          positionId="camera-current-take-card-v2"
          boundaryRef={boundaryRef}
          dropRef={challengerDropRef}
          positioningActive={positioningActive}
          transferDragSourceProps={compact && challengerTransferEnabled ? challengerDragSourceProps : undefined}
          consumeTransferClick={consumeChallengerClick}
          hapticFeedback={hapticFeedback}
          className={`app-pip-slot pointer-events-auto ${
            compact ? 'compact-take-slot compact-take-slot--current' : ''
          } ${
            compact && benchmarkDragging ? 'compact-take-slot--transfer-ready' : ''
          } ${
            compactCurrentShowPin ? 'compact-take-slot--has-pin' : ''
          } ${
            compact && benchmarkGhost?.overPin ? 'compact-take-slot--drop-active' : ''
          }`}
          dataTutorial="challenger-card"
        >
          {compact && <span className="compact-take-caption__label">Current Take</span>}
          <PipWindow
            compact={compact}
            src={challengerTake?.videoUrl ?? null}
          filePath={challengerTake?.filePath}
          mimeType={
            challengerTake?.videoMimeType ??
            (challengerTake?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
          }
          takeName={challengerTake?.name}
          label="Current Take"
          variant="challenger"
          emptyMessage="Load a take from the vault."
          mirror={challengerTake?.mirrorPlayback === true}
          recordingOrientation={challengerTake?.recordingOrientation}
          suspendPlayback={suspendPipPlayback}
          videoRef={challengerPipVideoRef}
          onUnpin={onUnpinChallenger}
          onExpand={takeHasPlaybackMedia(challengerTake) ? onExpandChallenger : undefined}
          dropHighlight={benchmarkGhost?.overPin ?? false}
          dragSourceActive={challengerDragging}
          dragSourceArming={challengerArming}
          dragSourceProps={
            !compact && challengerTransferEnabled
              ? challengerDragSourceProps
              : undefined
          }
          onPlaybackChange={onChallengerPlaybackChange}
          autoPlayRequestId={challengerAutoPlayRequestId}
          takeId={challengerTake?.id ?? null}
          onAutoPlayComplete={onChallengerAutoPlayComplete}
          showPinAsBest={!compact && showPinCurrentAsBest}
          onPinAsBest={onPinCurrentAsBest}
          posterUrl={
            challengerTake?.thumbnailUrl ??
            (challengerTake?.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : null)
          }
          />
          {compact && (
            <CompactTakeCaption
              label="Current Take"
              tone="current"
              name={challengerTake?.name ?? 'No current take'}
              timestamp={challengerTake?.timestamp}
              duration={challengerTake?.duration}
              hasMedia={compactCurrentHasMedia}
              onOpen={openCurrentFullScreen}
              hapticFeedback={hapticFeedback}
              dragSourceProps={
                challengerTransferEnabled && compactCurrentHasMedia
                  ? challengerDragSourceProps
                  : undefined
              }
              dragSourceActive={challengerDragging}
              dragSourceArming={challengerArming}
              dataTutorial="drag-current-to-best"
            />
          )}
          {compact && compactCurrentHasMedia && (
            <CompactTakeClearButton
              label="Current Take"
              onClear={onUnpinChallenger}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && compactCurrentHasMedia && onShareChallenger && (
            <CompactShareButton
              label="Current Take"
              onShare={onShareChallenger}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compactCurrentShowPin && onPinCurrentAsBest && (
            <CompactPinCurrentButton
              onPin={onPinCurrentAsBest}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && benchmarkDragging && (
            <span
              className={`compact-take-transfer-target compact-take-transfer-target--current ${
                benchmarkGhost?.overPin
                  ? 'compact-take-transfer-target--active'
                  : ''
              }`}
              aria-hidden
            >
              <ArrowLeftRight />
              <span>
                {benchmarkGhost?.overPin
                  ? benchmarkTransferIsSwap
                    ? 'Release to Swap'
                    : 'Release for Current'
                  : benchmarkTransferLabel}
              </span>
            </span>
          )}
        </MovableTakeSlot>
      </div>

      {compact &&
        layoutEditing &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="take-card-top-control">
            <TakeCardLayoutToolbar
              onReset={resetTakeCardLayout}
              hapticFeedback={hapticFeedback}
            />
          </div>,
          readPhysicalUiPortal(),
        )}

      {challengerGhost && challengerTake && (
        <PipDragGhost
          take={challengerTake}
          x={challengerGhost.x}
          y={challengerGhost.y}
          overPin={challengerGhost.overPin}
          overDelete={challengerGhost.overDelete}
          actionLabel="Make Best"
          actionTone="best"
        />
      )}

      {benchmarkGhost && benchmarkTake && (
        <PipDragGhost
          take={benchmarkTake}
          x={benchmarkGhost.x}
          y={benchmarkGhost.y}
          overPin={benchmarkGhost.overPin}
          overDelete={benchmarkGhost.overDelete}
          actionLabel={benchmarkTransferLabel}
          actionTone="current"
        />
      )}
    </>
  )
})
