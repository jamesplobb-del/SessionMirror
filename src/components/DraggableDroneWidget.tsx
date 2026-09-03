import { AnimatePresence, motion, useDragControls, useMotionValue } from 'framer-motion'
import { Minus, Plus, Square, Play } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useDrone } from '../hooks/useDrone'
import { useLongPress } from '../hooks/useLongPress'
import { DRONE_NOTE_STRIP, type DroneWaveform } from '../utils/droneEngine'
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
  droneWaveform: DroneWaveform
  tunerTransposition: TunerTranspositionId
  hapticFeedback?: boolean
  /** Silence the drone while a take plays back, and bring it back after. */
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
  onClose?: () => void
}

const WIDGET_WIDTH = 236
const COLLAPSED_HEIGHT = 96
/** A (concert) — the note every tuning starts from. */
const FALLBACK_PITCH_CLASS = 9

/**
 * The metronome widget's sibling: a held pitch that lives on the desk, on
 * Camera and on Audio Record, instead of only inside the Tuner tab. Written
 * note, octave, play/stop. Tap or long-press the note to unfold a one-octave
 * keyboard; the Tuner tab keeps the gauge and the full keyboard.
 */
export default function DraggableDroneWidget({
  boundaryRef,
  positionId = 'main-drone',
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
  const [keyboardOpen, setKeyboardOpen] = useState(false)

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
        const width = widgetRef.current?.offsetWidth ?? WIDGET_WIDTH
        const height = widgetRef.current?.offsetHeight ?? COLLAPSED_HEIGHT
        const { x, y } = getFloatingWidgetTopCenter(
          bounds.clientWidth,
          bounds.clientHeight,
          width,
          height,
        )
        // Sit just under where the metronome lands so the two read as a pair.
        dragX.set(x)
        dragY.set(y + 148)
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
    if (positionReadyRef.current) persistPosition()
  }, [boundaryRef, dragX, dragY, persistPosition])

  useEffect(() => {
    const onResize = () => window.requestAnimationFrame(reclampPosition)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [reclampPosition])

  // Opening the keyboard makes the widget taller; keep it on screen.
  useEffect(() => {
    const frame = window.requestAnimationFrame(reclampPosition)
    return () => window.cancelAnimationFrame(frame)
  }, [keyboardOpen, reclampPosition])

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

  const chooseNote = useCallback(
    (pitchClass: number) => {
      triggerLightHaptic(hapticFeedback)
      drone.soloNote(pitchClass)
    },
    [drone, hapticFeedback],
  )

  const noteLongPress = useLongPress({
    onClick: () => setKeyboardOpen((open) => !open),
    onLongPress: () => setKeyboardOpen(true),
    hapticFeedback,
  })

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
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={iosDragRelease}
      style={{ x: dragX, y: dragY, touchAction: 'none', width: WIDGET_WIDTH }}
    >
      <div
        className="ui-orient-spin drone-widget relative w-full rounded-3xl"
        aria-label={`Drone ${written.noteName}${sounding ? ', sounding' : ', silent'}. Drag to move.`}
      >
        <div
          className="drone-widget__drag-handle"
          aria-label="Drag drone"
          onPointerDown={(event) => {
            event.stopPropagation()
            dragControls.start(event)
          }}
        />
        <div className={`drone-widget__glow ${sounding ? 'drone-widget__glow--on' : ''}`} aria-hidden />

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
            className="pitch-widget-close pointer-events-auto absolute right-3 top-3 z-30 flex h-[26px] w-[26px] items-center justify-center rounded-full transition hover:bg-white/20 active:scale-95"
            aria-label="Close drone"
          >
            <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden className="text-white/90">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <div className="drone-widget__row pointer-events-auto">
          <button
            type="button"
            className={`drone-widget__play interactive-native ${sounding ? 'drone-widget__play--on' : ''}`}
            aria-label={sounding ? 'Stop drone' : 'Start drone'}
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

          <button
            type="button"
            className="drone-widget__note"
            aria-label={`Drone note ${written.noteName}. Tap to choose a note.`}
            aria-expanded={keyboardOpen}
            onContextMenu={(event) => event.preventDefault()}
            {...noteLongPress}
          >
            <span className="drone-widget__note-name">{written.label}</span>
            <span className="drone-widget__note-octave">{written.octave}</span>
            <span className="drone-widget__note-caption">Drone</span>
          </button>

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

        <AnimatePresence initial={false}>
          {keyboardOpen && (
            <motion.div
              key="keys"
              className="drone-widget__keys pointer-events-auto"
              role="listbox"
              aria-label="Drone note"
              data-no-drag
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="drone-widget__keys-row">
                {DRONE_NOTE_STRIP.map(({ pitchClass }) => {
                  const key = getWrittenPitchLabel(pitchClass, drone.octave, tunerTransposition)
                  const accidental = key.label.length > 1
                  const active = sounding && drone.activeNotes.includes(pitchClass)
                  return (
                    <button
                      key={pitchClass}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-label={key.noteName}
                      className={`drone-widget__key ${accidental ? 'drone-widget__key--accidental' : ''} ${
                        active ? 'drone-widget__key--active' : ''
                      }`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => chooseNote(pitchClass)}
                    >
                      {key.label}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
