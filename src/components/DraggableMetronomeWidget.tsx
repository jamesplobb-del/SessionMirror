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
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useMetronome } from '../hooks/useMetronome'
import { useTapTempo } from '../hooks/useTapTempo'
import {
  triggerLightHaptic,
  triggerMetronomeTapHaptic,
  triggerMetronomeToggleHaptic,
} from '../utils/haptics'
import { iosDragRelease } from '../utils/motionPresets'
import { usePinchResize } from '../hooks/usePinchResize'
import { getFloatingWidgetTopCenter, clampWidgetPosition, loadWidgetPosition, loadWidgetSize, saveWidgetPosition, saveWidgetSize } from '../utils/floatingWidgetLayout'
import MetronomeAudioSelect from './audioPractice/MetronomeAudioSelect'
import MetronomeBeatMarkers from './audioPractice/MetronomeBeatMarkers'
import RhythmCellGlyph from './audioPractice/RhythmCellGlyph'
import {
  getPracticeRhythmOptions,
  PRACTICE_ALL_METERS,
} from './audioPractice/audioPracticeMetronome'
import {
  getPulseNotation,
  getRhythmCellNotation,
  rhythmCellHint,
} from '../metronome/metronomeNotation'
import {
  MAX_BPM,
  MIN_BPM,
  subTicksPerPulse,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

interface DraggableMetronomeWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  positionId?: string
  /** First-run placement, so the widget never spawns on the take cards. */
  defaultTopOffset?: number
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
  /** Keep the widget visible but prevent a second metronome clock while a native transport owns timing. */
  controlsLocked?: boolean
  onClose?: () => void
}

const DEFAULT_WIDGET_SIZE = { width: 288, height: 176 }
const MIN_WIDGET_SIZE = { width: 216, height: 150 }
const BPM_DRAG_SENSITIVITY = 0.35
const DOUBLE_TAP_MS = 320

function MetronomeControlButton({
  label,
  active = false,
  haptic = 'light',
  onPress,
  children,
  className = '',
}: {
  label: string
  active?: boolean
  haptic?: 'light' | false
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
        if (haptic === 'light') triggerLightHaptic()
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
  defaultTopOffset = 72,
  isTakePlaying = false,
  muteDuringPlayback = true,
  controlsLocked = false,
  onClose,
}: DraggableMetronomeWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const bpmInputId = useId()
  const dragControls = useDragControls()
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const positionReadyRef = useRef(false)
  const {
    bpm,
    meter,
    subdivision,
    pulseModeId,
    pulseCount,
    pulseName,
    playing,
    beatIndex,
    subTickIndex,
    beatPulseId,
    accentLevels,
    setBpm,
    setMeter,
    setSubdivision,
    toggleBeatAccent,
    togglePlay,
    stop,
  } = useMetronome({
    isTakePlaying,
    muteDuringPlayback,
  })

  const { registerTap } = useTapTempo(setBpm)

  const [maxSize, setMaxSize] = useState(() => ({
    width: Math.min(320, window.innerWidth - 24),
    height: Math.min(140, Math.floor(window.innerHeight * 0.22)),
  }))
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(bpm))
  const bpmDragRef = useRef<{ startY: number; startBpm: number; moved: boolean } | null>(null)
  const lastTapAtRef = useRef(0)

  // A size saved before the panel grew a beat row would clip it, so an old
  // pinch is honoured only down to the layout's own floor.
  const savedSize = useMemo(() => {
    const stored = loadWidgetSize(positionId)
    if (!stored) return null
    return {
      width: Math.max(stored.width, MIN_WIDGET_SIZE.width),
      height: Math.max(stored.height, MIN_WIDGET_SIZE.height),
    }
  }, [positionId])
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
        width: Math.min(340, window.innerWidth - 24),
        height: Math.min(232, Math.floor(window.innerHeight * 0.32)),
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
          defaultTopOffset,
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
  }, [boundaryRef, defaultTopOffset, dragX, dragY, positionId])

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
      // Double-tap resets the size, so it can only count taps on the panel
      // itself — opening a picker and choosing from it is two taps too.
      const target = event.target as HTMLElement
      if (target.closest('button, input, [data-no-drag], .metronome-audio-select')) return

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

  // The same option sets the Metronome tab builds, so a rhythm is named for
  // what it actually plays under the current pulse — "8ths" in 6/8 is not the
  // same note value as "8ths" in 4/4.
  const rhythmOptions = useMemo(
    () => getPracticeRhythmOptions(meter, pulseModeId),
    [meter, pulseModeId],
  )
  const pulseNotation = useMemo(
    () => getPulseNotation(meter, pulseCount),
    [meter, pulseCount],
  )
  const subNotchCount = subTicksPerPulse(meter, subdivision, pulseCount)
  const activeAccent = accentLevels[beatIndex] ?? 'weak'
  const accentTone =
    beatIndex === 0
      ? 'gold'
      : activeAccent === 'strong' || activeAccent === 'medium'
        ? 'blue-strong'
        : 'blue'

  const handleMeterChange = useCallback(
    (value: MetronomeMeter) => {
      if (value !== meter) setMeter(value)
    },
    [meter, setMeter],
  )

  const handleSubdivisionChange = useCallback(
    (value: MetronomeSubdivision) => {
      if (value !== subdivision) setSubdivision(value)
    },
    [setSubdivision, subdivision],
  )

  const handleTapTempo = useCallback(() => {
    triggerMetronomeTapHaptic()
    registerTap()
  }, [registerTap])

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

  const handleTogglePlay = useCallback(() => {
    triggerMetronomeToggleHaptic(playing)
    togglePlay()
  }, [playing, togglePlay])

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
      className={`metronome-widget-draggable pointer-events-auto absolute left-0 top-0 z-[12] touch-none ${pinching ? 'metronome-widget-draggable--pinching' : ''} ${playing ? 'metronome-widget-draggable--playing' : ''} ${controlsLocked ? 'metronome-widget-draggable--locked' : ''}`}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={iosDragRelease}
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

        {/* Gold on the downbeat, blue elsewhere — the tab's beat language,
            re-keyed on the pulse so the flash restarts with the click. */}
        {playing ? (
          <span
            key={beatPulseId}
            className={`metronome-widget__accent metronome-widget__accent--pulse metronome-pulse-tone--${accentTone}`}
            aria-hidden
          />
        ) : null}

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

        {controlsLocked ? <span className="metronome-widget__sync-lock">Recording sync</span> : null}

        <fieldset disabled={controlsLocked} className="metronome-widget__locked-controls">
        <div
          className="metronome-widget__beats"
          style={
            {
              '--beat-columns': pulseCount > 8 ? Math.ceil(pulseCount / 2) : pulseCount,
            } as CSSProperties
          }
        >
          <MetronomeBeatMarkers
            interactive={!controlsLocked}
            playing={playing}
            beatIndex={beatIndex}
            subTickIndex={subTickIndex}
            beatPulseId={beatPulseId}
            beatsPerBar={pulseCount}
            accentLevels={accentLevels}
            subNotchCount={subNotchCount}
            toggleBeatAccent={toggleBeatAccent}
          />
        </div>

        <div className="metronome-widget__row metronome-widget__row--main pointer-events-auto">
          <MetronomeControlButton
            label={playing ? 'Pause metronome' : 'Start metronome'}
            haptic={false}
            onPress={handleTogglePlay}
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
                aria-label={`${bpm} beats per minute, counted in ${pulseName}. ${playing ? 'Tap to edit.' : 'Drag vertically to adjust, or tap to edit.'}`}
                onPointerDown={onBpmPointerDown}
                onPointerMove={onBpmPointerMove}
                onPointerUp={onBpmPointerUp}
                onPointerCancel={endBpmDrag}
              >
                {/* Which note BPM counts, so 6/8 at 120 can't be read as
                    eighths when it is dotted quarters. Same glyph the tab
                    prints above its tempo. */}
                <RhythmCellGlyph
                  notation={pulseNotation}
                  height={13}
                  className="metronome-widget__bpm-note"
                />
                <span className="metronome-widget__bpm-equals" aria-hidden>
                  =
                </span>
                <span className="metronome-widget__bpm-value">{bpm}</span>
                <span className="metronome-widget__bpm-label">BPM</span>
              </button>
            )}
          </div>

          <MetronomeControlButton
            label="Tap tempo"
            haptic={false}
            onPress={handleTapTempo}
            className="metronome-widget__tap"
          >
            Tap
          </MetronomeControlButton>
        </div>

        <div className="metronome-widget__row metronome-widget__row--selects pointer-events-auto">
          <MetronomeAudioSelect
            label="Time"
            ariaLabel="Time signature"
            value={meter}
            options={PRACTICE_ALL_METERS.map((value) => ({ value, label: value }))}
            onChange={handleMeterChange}
          />
          <MetronomeAudioSelect
            label="Rhythm"
            ariaLabel="Rhythm subdivision"
            value={subdivision}
            options={rhythmOptions.map((option) => {
              const notation = getRhythmCellNotation(meter, option.value, pulseCount)
              return {
                value: option.value,
                label: option.name,
                hint: rhythmCellHint(notation),
                glyph: <RhythmCellGlyph notation={notation} height={16} />,
              }
            })}
            onChange={handleSubdivisionChange}
          />
        </div>
        </fieldset>
      </div>
    </motion.div>
  )
}
