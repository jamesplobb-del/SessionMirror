import { motion, useMotionValue } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useMetronome } from '../hooks/useMetronome'
import { usePinchResize } from '../hooks/usePinchResize'
import {
  COMPOUND_METERS,
  MAX_BPM,
  MIN_BPM,
  SIMPLE_METERS,
  type MetronomeMeter,
} from '../utils/metronomeConfig'

interface DraggableMetronomeWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  layoutKey?: string
}

const DEFAULT_WIDGET_SIZE = { width: 268, height: 96 }
const MIN_WIDGET_SIZE = { width: 220, height: 84 }
const BPM_DRAG_SENSITIVITY = 0.35

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
        onPress()
      }}
      className={`metronome-widget__btn pointer-events-auto ${active ? 'metronome-widget__btn--active' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export default function DraggableMetronomeWidget({
  boundaryRef,
  layoutKey = '',
}: DraggableMetronomeWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const bpmInputId = useId()
  const dragX = useMotionValue(12)
  const dragY = useMotionValue(72)
  const { bpm, meter, playing, beatIndex, setBpm, setMeter, togglePlay } = useMetronome()

  const [maxSize, setMaxSize] = useState(() => ({
    width: Math.min(320, window.innerWidth - 24),
    height: Math.min(140, Math.floor(window.innerHeight * 0.22)),
  }))
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const bpmDragRef = useRef<{ startX: number; startBpm: number; moved: boolean } | null>(null)

  const pinchLimits = useMemo(
    () => ({
      initial: DEFAULT_WIDGET_SIZE,
      min: MIN_WIDGET_SIZE,
      max: maxSize,
    }),
    [maxSize],
  )

  const {
    size: widgetSize,
    pinching,
    onPointerDown: onPinchPointerDown,
    onPointerMove: onPinchPointerMove,
    onPointerUp: onPinchPointerUp,
    onPointerCancel: onPinchPointerCancel,
  } = usePinchResize(pinchLimits)

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
  }, [layoutKey])

  useLayoutEffect(() => {
    const measureInitialPosition = () => {
      const bounds = boundaryRef.current
      if (!bounds) return false
      dragX.set(12)
      dragY.set(Math.max(72, bounds.clientHeight - 280))
      return true
    }

    if (!measureInitialPosition()) {
      dragY.set(72)
    }

    const retryFrame = window.requestAnimationFrame(measureInitialPosition)
    return () => window.cancelAnimationFrame(retryFrame)
  }, [boundaryRef, dragX, dragY, layoutKey])

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
      bpmDragRef.current = { startX: event.clientX, startBpm: bpm, moved: false }
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
      if (!bpmDragRef.current) return
      event.stopPropagation()
      const delta = event.clientX - bpmDragRef.current.startX
      if (Math.abs(delta) > 3) {
        bpmDragRef.current.moved = true
      }
      setBpm(bpmDragRef.current.startBpm + delta * BPM_DRAG_SENSITIVITY)
    },
    [setBpm],
  )

  const openBpmEditor = useCallback(() => {
    setBpmDraft(String(bpm))
    setEditingBpm(true)
  }, [bpm])

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

  return (
    <motion.div
      ref={widgetRef}
      drag={!pinching && !editingBpm}
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onPointerDown={onPinchPointerDown}
      onPointerMove={onPinchPointerMove}
      onPointerUp={onPinchPointerUp}
      onPointerCancel={onPinchPointerCancel}
      className={`metronome-widget-draggable pointer-events-auto absolute left-0 top-0 z-[6] touch-none ${pinching ? 'metronome-widget-draggable--pinching' : ''}`}
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
        minHeight: widgetSize.height,
      }}
    >
      <div className="ui-orient-spin metronome-widget relative h-full min-h-0 w-full overflow-hidden rounded-3xl">
        <div
          className={`metronome-widget__accent ${beatIndex === 0 && playing ? 'metronome-widget__accent--pulse' : ''}`}
          aria-hidden
        />

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
                aria-label={`${bpm} beats per minute. Drag horizontally to adjust, or tap to edit.`}
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
      </div>
    </motion.div>
  )
}
