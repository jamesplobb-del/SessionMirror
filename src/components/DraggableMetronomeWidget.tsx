import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffect,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useMetronome } from '../hooks/useMetronome'
import { triggerLightHaptic } from '../utils/haptics'
import { usePinchResize } from '../hooks/usePinchResize'
import { getFloatingWidgetTopCenter, clampWidgetPosition, loadWidgetPosition, loadWidgetSize, saveWidgetPosition, saveWidgetSize } from '../utils/floatingWidgetLayout'
import {
  COMPOUND_METERS,
  MAX_BPM,
  METRONOME_SUBDIVISIONS,
  MIN_BPM,
  SIMPLE_METERS,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

interface DraggableMetronomeWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  positionId?: string
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
  onClose?: () => void
}

const DEFAULT_WIDGET_SIZE = { width: 268, height: 128 }
const MIN_WIDGET_SIZE = { width: 200, height: 120 }
const BPM_DRAG_SENSITIVITY = 0.35
const DOUBLE_TAP_MS = 320

function MetronomeControlButton({
  label,
  active = false,
  onPress,
  children,
  className = '',
}: {
  label: string
  active?: boolean
  onPress: () => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => {
        event.stopPropagation()
        if (event.button !== 0) return
        triggerLightHaptic()
        onPress()
      }}
      className={`metronome-widget__btn pointer-events-auto interactive-native ${active ? 'metronome-widget__btn--active' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export default function DraggableMetronomeWidget({
  boundaryRef,
  positionId = 'main-metronome',
  isTakePlaying = false,
  muteDuringPlayback = true,
  onClose,
}: DraggableMetronomeWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const bpmInputId = useId()
  const dragControls = useDragControls()
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const positionReadyRef = useRef(false)
  const { bpm, meter, subdivision, playing, beatIndex, setBpm, setMeter, setSubdivision, togglePlay, stop } =
    useMetronome({
    isTakePlaying,
    muteDuringPlayback,
  })

  const [maxSize, setMaxSize] = useState(() => ({
    width: Math.min(320, window.innerWidth - 24),
    height: Math.min(140, Math.floor(window.innerHeight * 0.22)),
  }))
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const bpmDragRef = useRef<{ startY: number; startBpm: number; moved: boolean } | null>(null)
  const lastTapAtRef = useRef(0)

  const savedSize = useMemo(() => loadWidgetSize(positionId), [positionId])
  const initialSize = savedSize ?? DEFAULT_WIDGET_SIZE

  const pinchLimits = useMemo(
    () => ({
      initial: initialSize,
      min: MIN_WIDGET_SIZE,
      max: maxSize,
    }),
    [initialSize, maxSize],
  )

  const {
    size: widgetSize,
    pinching,
    onPointerDown: onPinchPointerDown,
    onPointerMove: onPinchPointerMove,
    onPointerUp: onPinchPointerUp,
    onPointerCancel: onPinchPointerCancel,
    resetSize,
    setSize,
  } = usePinchResize(pinchLimits)

  useLayoutEffect(() => {
    if (savedSize) {
      setSize(savedSize)
    }
  }, [positionId, savedSize, setSize])

  useLayoutEffect(() => {
    const measureMax = () => {
      setMaxSize({
        width: Math.min(320, window.innerWidth - 24),
        height: Math.min(140, Math.floor(window.innerHeight * 0.22)),
      })
    }

    measureMax()
    window.addEventListener('resize', measureMax)
    return () => window.removeEventListener('resize', measureMax)
  }, [])

  useLayoutEffect(() => {
    if (positionReadyRef.current) return

    const applyPosition = () => {
      const bounds = boundaryRef.current
      if (!bounds) return false

      const saved = loadWidgetPosition(positionId)
      if (saved) {
        dragX.set(saved.x)
        dragY.set(saved.y)
      } else {
        const width = widgetRef.current?.offsetWidth ?? DEFAULT_WIDGET_SIZE.width
        const height = widgetRef.current?.offsetHeight ?? DEFAULT_WIDGET_SIZE.height
        const { x, y } = getFloatingWidgetTopCenter(
          bounds.clientWidth,
          bounds.clientHeight,
          width,
          height,
        )
        dragX.set(x)
        dragY.set(y)
      }

      positionReadyRef.current = true
      return true
    }

    if (!applyPosition()) {
      const saved = loadWidgetPosition(positionId)
      if (saved) {
        dragX.set(saved.x)
        dragY.set(saved.y)
        positionReadyRef.current = true
      }
    }

    const retryFrame = window.requestAnimationFrame(() => {
      if (!positionReadyRef.current) {
        applyPosition()
      }
    })

    return () => window.cancelAnimationFrame(retryFrame)
  }, [boundaryRef, dragX, dragY, positionId])

  const persistPosition = useCallback(() => {
    saveWidgetPosition(positionId, dragX.get(), dragY.get())
  }, [dragX, dragY, positionId])

  const reclampPosition = useCallback(() => {
    const bounds = boundaryRef.current
    const el = widgetRef.current
    if (!bounds || !el) return

    const { x, y } = clampWidgetPosition(
      bounds.clientWidth,
      bounds.clientHeight,
      el.offsetWidth,
      el.offsetHeight,
      dragX.get(),
      dragY.get(),
    )
    dragX.set(x)
    dragY.set(y)
    if (positionReadyRef.current) {
      persistPosition()
    }
  }, [boundaryRef, dragX, dragY, persistPosition])

  const persistSize = useCallback(() => {
    saveWidgetSize(positionId, widgetSize.width, widgetSize.height)
  }, [positionId, widgetSize.height, widgetSize.width])

  const wasPinchingRef = useRef(false)
  useEffect(() => {
    if (wasPinchingRef.current && !pinching) {
      persistSize()
    }
    wasPinchingRef.current = pinching
  }, [pinching, persistSize])

  useEffect(() => {
    const onResize = () => {
      window.requestAnimationFrame(reclampPosition)
    }
    window.addEventListener('resize', onResize)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.requestAnimationFrame(reclampPosition)
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reclampPosition])

  const handleShellPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      onPinchPointerUp(event)
      if (pinching || editingBpm || playing) return
      if (event.button !== 0) return

      const now = performance.now()
      if (now - lastTapAtRef.current <= DOUBLE_TAP_MS) {
        resetSize()
        saveWidgetSize(positionId, DEFAULT_WIDGET_SIZE.width, DEFAULT_WIDGET_SIZE.height)
        lastTapAtRef.current = 0
        return
      }
      lastTapAtRef.current = now
    },
    [editingBpm, onPinchPointerUp, pinching, playing, positionId, resetSize],
  )

  const commitBpmDraft = useCallback(() => {
    const parsed = Number.parseInt(bpmDraft, 10)
    if (Number.isFinite(parsed)) {
      setBpm(parsed)
    } else {
      setBpmDraft(String(bpm))
    }
    setEditingBpm(false)
  }, [bpm, bpmDraft, setBpm])

  const onBpmPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (editingBpm) return
      bpmDragRef.current = { startY: event.clientY, startBpm: bpm, moved: false }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    },
    [bpm, editingBpm],
  )

  const onBpmPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!bpmDragRef.current || playing) return
      event.stopPropagation()
      const deltaY = event.clientY - bpmDragRef.current.startY
      if (Math.abs(deltaY) > 3) {
        bpmDragRef.current.moved = true
      }
      setBpm(bpmDragRef.current.startBpm - deltaY * BPM_DRAG_SENSITIVITY)
    },
    [playing, setBpm],
  )

  const openBpmEditor = useCallback(() => {
    if (playing) {
      stop()
    }
    setBpmDraft(String(bpm))
    setEditingBpm(true)
  }, [bpm, playing, stop])

  const onBpmPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!bpmDragRef.current) return
      event.stopPropagation()
      const wasTap = !bpmDragRef.current.moved
      bpmDragRef.current = null
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        /* ignore */
      }
      if (wasTap && event.button === 0) {
        openBpmEditor()
      }
    },
    [openBpmEditor],
  )

  const endBpmDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!bpmDragRef.current) return
    event.stopPropagation()
    bpmDragRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const renderMeterButton = (value: MetronomeMeter) => (
    <MetronomeControlButton
      key={value}
      label={`${value} meter`}
      active={meter === value}
      onPress={() => setMeter(value)}
      className="metronome-widget__meter-btn"
    >
      {value}
    </MetronomeControlButton>
  )

  const renderSubdivisionButton = (value: MetronomeSubdivision, label: string) => (
    <MetronomeControlButton
      key={value}
      label={`${label} subdivisions`}
      active={subdivision === value}
      onPress={() => setSubdivision(value)}
      className="metronome-widget__subdivision-btn"
    >
      {label}
    </MetronomeControlButton>
  )

  const canShellDrag = !pinching && !editingBpm
  const shellDragListener = false

  const handleShellPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      onPinchPointerDown(event)
      if (pinching || editingBpm || playing) return
      const target = event.target as HTMLElement
      if (target.closest('button, input, textarea, select, a, [data-no-drag]')) return
      dragControls.start(event)
    },
    [dragControls, editingBpm, onPinchPointerDown, pinching, playing],
  )

  const handleClosePress = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (event.button !== 0) return
      stop()
      onClose?.()
    },
    [onClose, stop],
  )

  return (
    <motion.div
      ref={widgetRef}
      drag={canShellDrag}
      dragControls={dragControls}
      dragListener={shellDragListener}
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onPointerDown={handleShellPointerDown}
      onPointerMove={onPinchPointerMove}
      onPointerUp={handleShellPointerUp}
      onPointerCancel={onPinchPointerCancel}
      onDragEnd={persistPosition}
      className={`metronome-widget-draggable pointer-events-auto absolute left-0 top-0 z-[12] min-h-[104px] min-w-[200px] touch-none ${pinching ? 'metronome-widget-draggable--pinching' : ''} ${playing ? 'metronome-widget-draggable--playing' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{
        x: dragX,
        y: dragY,
        touchAction: 'none',
        width: widgetSize.width,
        height: widgetSize.height,
        minWidth: MIN_WIDGET_SIZE.width,
        minHeight: MIN_WIDGET_SIZE.height,
      }}
    >
      <div
        className="ui-orient-spin metronome-widget relative h-full min-h-0 w-full rounded-3xl"
        aria-label="Metronome. Pinch to resize. Double-tap empty space to reset size."
      >
        <div
          className="metronome-widget__drag-handle"
          aria-label="Drag metronome"
          onPointerDown={(event) => {
            if (pinching || editingBpm) return
            event.stopPropagation()
            dragControls.start(event)
          }}
        />

        <div
          className={`metronome-widget__accent ${beatIndex === 0 && playing ? 'metronome-widget__accent--pulse' : ''}`}
          aria-hidden
        />

        {onClose && (
          <button
            type="button"
            data-no-drag
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={handleClosePress}
            className="pitch-widget-close pointer-events-auto absolute right-3 top-3 z-30 flex h-[26px] w-[26px] items-center justify-center rounded-full transition hover:bg-white/20 active:scale-95"
            aria-label="Close metronome"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden className="text-white/90">
              <path
                d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}

        <div className="metronome-widget__row metronome-widget__row--main pointer-events-auto">
          <MetronomeControlButton
            label={playing ? 'Pause metronome' : 'Start metronome'}
            onPress={togglePlay}
            className="metronome-widget__play"
          >
            {playing ? (
              <Pause className="h-4 w-4" strokeWidth={2.4} />
            ) : (
              <Play className="h-4 w-4" strokeWidth={2.4} />
            )}
          </MetronomeControlButton>

          <div className="metronome-widget__bpm-wrap">
            {editingBpm ? (
              <input
                id={bpmInputId}
                type="number"
                inputMode="numeric"
                min={MIN_BPM}
                max={MAX_BPM}
                value={bpmDraft}
                autoFocus
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => setBpmDraft(event.target.value)}
                onBlur={commitBpmDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitBpmDraft()
                  if (event.key === 'Escape') {
                    setBpmDraft(String(bpm))
                    setEditingBpm(false)
                  }
                }}
                className="metronome-widget__bpm-input pointer-events-auto"
                aria-label="Beats per minute"
              />
            ) : (
              <button
                type="button"
                className="metronome-widget__bpm pointer-events-auto"
                aria-label={`${bpm} beats per minute. ${playing ? 'Tap to edit.' : 'Drag vertically to adjust, or tap to edit.'}`}
                onPointerDown={onBpmPointerDown}
                onPointerMove={onBpmPointerMove}
                onPointerUp={onBpmPointerUp}
                onPointerCancel={endBpmDrag}
              >
                <span className="metronome-widget__bpm-value">{bpm}</span>
                <span className="metronome-widget__bpm-label">BPM</span>
              </button>
            )}
          </div>
        </div>

        <div className="metronome-widget__row metronome-widget__row--meters pointer-events-auto">
          <div className="metronome-widget__meter-group">
            {SIMPLE_METERS.map(renderMeterButton)}
          </div>
          <span className="metronome-widget__meter-divider" aria-hidden />
          <div className="metronome-widget__meter-group">
            {COMPOUND_METERS.map(renderMeterButton)}
          </div>
        </div>

        <div className="metronome-widget__row metronome-widget__row--subdivisions pointer-events-auto">
          {METRONOME_SUBDIVISIONS.map(({ value, label }) => renderSubdivisionButton(value, label))}
        </div>
      </div>
    </motion.div>
  )
}
