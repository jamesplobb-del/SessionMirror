import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { Minus, Plus, Square, Play } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import DroneSoundWheel from './audioPractice/DroneSoundWheel'
import { useDrone } from '../hooks/useDrone'
import { type DroneWaveform } from '../utils/droneEngine'
import {
  clampWidgetPosition,
  getFloatingWidgetTopCenter,
  loadWidgetPosition,
  saveWidgetPosition,
} from '../utils/floatingWidgetLayout'
import { triggerLightHaptic } from '../utils/haptics'
import { iosDragRelease } from '../utils/motionPresets'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../utils/tunerTransposition'

interface DraggableDroneWidgetProps {
  boundaryRef: RefObject<HTMLElement | null>
  positionId?: string
  /** First-run placement, so the widget never spawns on the take cards. */
  defaultTopOffset?: number
  droneWaveform: DroneWaveform
  tunerTransposition: TunerTranspositionId
  hapticFeedback?: boolean
  /** Silence the drone while a take plays back, and bring it back after. */
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
  onClose?: () => void
}

const WIDGET_WIDTH = 268
const WIDGET_HEIGHT = 150
/** A (concert) — the note every tuning starts from. */
const FALLBACK_PITCH_CLASS = 9

/**
 * The metronome widget's sibling: a held pitch that lives on the desk, on
 * Camera and on Audio Record, instead of only inside the Tuner tab.
 *
 * The note picker is the Tuner tab's own scrolling ribbon, not a second way of
 * choosing a pitch — scroll it and the drone glides with you. Play/stop and
 * the octave steppers sit above it; the Tuner tab keeps the gauge, the chord
 * modes and the full-width ribbon.
 */
export default function DraggableDroneWidget({
  boundaryRef,
  positionId = 'main-drone',
  defaultTopOffset = 220,
  droneWaveform,
  tunerTransposition,
  hapticFeedback = true,
  isTakePlaying = false,
  muteDuringPlayback = true,
  onClose,
}: DraggableDroneWidgetProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const positionReadyRef = useRef(false)
  const resumePitchClassRef = useRef<number | null>(null)

  const drone = useDrone({ volume: 1, waveform: droneWaveform, hapticFeedback })
  const sounding = drone.enabled && drone.activeNotes.length > 0
  const heldPitchClass = drone.activeNotes[0] ?? drone.lastPitchClass ?? FALLBACK_PITCH_CLASS
  const written = getWrittenPitchLabel(heldPitchClass, drone.octave, tunerTransposition)

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
        // Sits below where the metronome lands, so the two read as a pair
        // rather than stacking on the same spot.
        const { x, y } = getFloatingWidgetTopCenter(
          bounds.clientWidth,
          bounds.clientHeight,
          WIDGET_WIDTH,
          WIDGET_HEIGHT,
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
      if (!positionReadyRef.current) applyPosition()
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
    if (positionReadyRef.current) persistPosition()
  }, [boundaryRef, dragX, dragY, persistPosition])

  useEffect(() => {
    const onResize = () => window.requestAnimationFrame(reclampPosition)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [reclampPosition])

  // Same rule as the metronome: quiet while a take plays, back when it ends.
  useEffect(() => {
    if (!muteDuringPlayback) return
    if (isTakePlaying) {
      if (sounding) {
        resumePitchClassRef.current = heldPitchClass
        drone.silence()
      }
      return
    }
    const resume = resumePitchClassRef.current
    if (resume !== null) {
      resumePitchClassRef.current = null
      drone.soloNote(resume)
    }
    // `drone` is a stable store facade; `sounding`/`heldPitchClass` are read at the moment playback flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTakePlaying, muteDuringPlayback])

  const handleShellPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      if (target.closest('button, [data-no-drag]')) return
      dragControls.start(event)
    },
    [dragControls],
  )

  const toggleSound = useCallback(() => {
    triggerLightHaptic(hapticFeedback)
    if (sounding) {
      resumePitchClassRef.current = null
      drone.silence()
      return
    }
    drone.soloNote(heldPitchClass)
  }, [drone, hapticFeedback, heldPitchClass, sounding])

  return (
    <motion.div
      ref={widgetRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.04}
      dragConstraints={boundaryRef}
      onPointerDown={handleShellPointerDown}
      onDragEnd={persistPosition}
      className={`drone-widget-draggable pointer-events-auto absolute left-0 top-0 z-[12] touch-none ${
        sounding ? 'drone-widget-draggable--sounding' : ''
      }`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={iosDragRelease}
      style={{ x: dragX, y: dragY, touchAction: 'none', width: WIDGET_WIDTH }}
    >
      <div
        className="ui-orient-spin drone-widget relative w-full rounded-3xl"
        aria-label={`Drone ${written.noteName}${sounding ? ', sounding' : ', silent'}. Drag to move.`}
      >
        <div className={`drone-widget__glow ${sounding ? 'drone-widget__glow--on' : ''}`} aria-hidden />

        <div className="drone-widget__chrome">
          <span
            className="drone-widget__drag-handle"
            aria-label="Drag drone"
            onPointerDown={(event) => {
              event.stopPropagation()
              dragControls.start(event)
            }}
          />
          {onClose && (
            <button
              type="button"
              data-no-drag
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                drone.silence()
                onClose()
              }}
              className="drone-widget__close pitch-widget-close"
              aria-label="Close drone"
            >
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path
                  d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="drone-widget__row pointer-events-auto">
          <button
            type="button"
            className={`drone-widget__play interactive-native ${sounding ? 'drone-widget__play--on' : ''}`}
            aria-label={sounding ? 'Stop drone' : `Start ${written.noteName} drone`}
            aria-pressed={sounding}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={toggleSound}
          >
            {sounding ? (
              <Square className="h-3.5 w-3.5" strokeWidth={2.6} fill="currentColor" />
            ) : (
              <Play className="ml-0.5 h-4 w-4" strokeWidth={2.4} fill="currentColor" />
            )}
          </button>

          <div className="drone-widget__readout">
            <span className="drone-widget__note-name">{written.label}</span>
            <span className="drone-widget__note-octave">{written.octave}</span>
            <span className="drone-widget__note-caption">Drone</span>
          </div>

          <div className="drone-widget__octave" role="group" aria-label="Octave">
            <button
              type="button"
              className="drone-widget__btn interactive-native"
              aria-label="Octave down"
              disabled={drone.octave <= 1}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={drone.decrementOctave}
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="drone-widget__btn interactive-native"
              aria-label="Octave up"
              disabled={drone.octave >= 7}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={drone.incrementOctave}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="drone-widget__ribbon" data-no-drag>
          <DroneSoundWheel
            compact
            activeNotes={drone.activeNotes}
            octave={drone.octave}
            onToggleNote={drone.toggleNote}
            onGlissNote={drone.glissNote}
            onSetNotes={drone.setNotes}
            onIncrementOctave={drone.incrementOctave}
            onDecrementOctave={drone.decrementOctave}
            hapticsEnabled={hapticFeedback}
            tunerTransposition={tunerTransposition}
          />
        </div>
      </div>
    </motion.div>
  )
}
