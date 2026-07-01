import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DRONE_NOTE_STRIP } from '../../utils/droneEngine'

const WHEEL_NOTE_COUNT = 12
const WHEEL_RADIUS_PERCENT = 42.5
const GLISSANDO_THRESHOLD_PX = 10
const INNER_DEAD_ZONE_RATIO = 0.31
const OUTER_EDGE_RATIO = 0.64

export interface DroneSoundWheelProps {
  activeNotes: number[]
  octave: number
  onToggleNote: (pitchClass: number) => void
  onSoloNote: (pitchClass: number) => void
  onIncrementOctave: () => void
  onDecrementOctave: () => void
  onDroneInteraction?: () => void
  children: ReactNode
}

function shortNoteLabel(label: string): string {
  return label.split('/')[0] ?? label
}

function notePosition(index: number): { left: string; top: string } {
  const angle = (index / WHEEL_NOTE_COUNT) * Math.PI * 2 - Math.PI / 2
  return {
    left: `${50 + WHEEL_RADIUS_PERCENT * Math.cos(angle)}%`,
    top: `${50 + WHEEL_RADIUS_PERCENT * Math.sin(angle)}%`,
  }
}

function pitchClassFromWheelPoint(rect: DOMRect, clientX: number, clientY: number): number | null {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const dist = Math.hypot(dx, dy)
  const minR = rect.width * INNER_DEAD_ZONE_RATIO
  const maxR = rect.width * OUTER_EDGE_RATIO
  if (dist < minR || dist > maxR) return null

  let angle = Math.atan2(dy, dx) + Math.PI / 2
  if (angle < 0) angle += Math.PI * 2
  const index = Math.round((angle / (Math.PI * 2)) * WHEEL_NOTE_COUNT) % WHEEL_NOTE_COUNT
  return DRONE_NOTE_STRIP[index]?.pitchClass ?? null
}

export default function DroneSoundWheel({
  activeNotes,
  octave,
  onToggleNote,
  onSoloNote,
  onIncrementOctave,
  onDecrementOctave,
  onDroneInteraction,
  children,
}: DroneSoundWheelProps) {
  const ringRef = useRef<HTMLDivElement>(null)
  const [glissandoPitch, setGlissandoPitch] = useState<number | null>(null)
  const sessionRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    isGlissando: false,
    downPitchClass: null as number | null,
    lastSoloPitch: null as number | null,
  })

  const readPitchAt = (clientX: number, clientY: number): number | null => {
    const rect = ringRef.current?.getBoundingClientRect()
    if (!rect) return null
    return pitchClassFromWheelPoint(rect, clientX, clientY)
  }

  const resetSession = () => {
    sessionRef.current = {
      pointerId: -1,
      startX: 0,
      startY: 0,
      isGlissando: false,
      downPitchClass: null,
      lastSoloPitch: null,
    }
    setGlissandoPitch(null)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pitchClass = readPitchAt(event.clientX, event.clientY)
    if (pitchClass === null) return

    event.preventDefault()
    onDroneInteraction?.()
    sessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isGlissando: false,
      downPitchClass: pitchClass,
      lastSoloPitch: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    const session = sessionRef.current
    const pitchClass = readPitchAt(event.clientX, event.clientY)
    const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)

    if (
      !session.isGlissando &&
      (distance >= GLISSANDO_THRESHOLD_PX ||
        (pitchClass !== null &&
          session.downPitchClass !== null &&
          pitchClass !== session.downPitchClass &&
          distance > 4))
    ) {
      session.isGlissando = true
    }

    if (!session.isGlissando || pitchClass === null) return

    event.preventDefault()
    onDroneInteraction?.()
    setGlissandoPitch(pitchClass)

    if (session.lastSoloPitch === pitchClass) return
    session.lastSoloPitch = pitchClass
    onSoloNote(pitchClass)
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (!session.isGlissando && session.downPitchClass !== null) {
      const pitchClass = readPitchAt(event.clientX, event.clientY)
      if (pitchClass === session.downPitchClass) {
        onDroneInteraction?.()
        onToggleNote(session.downPitchClass)
      }
    }

    resetSession()
  }

  return (
    <div className="drone-sound-wheel pointer-events-auto">
      <div className="drone-sound-wheel__stage">
        <div className="drone-sound-wheel__guide" aria-hidden />
        <div className="drone-sound-wheel__center">{children}</div>
        <div
          ref={ringRef}
          className="drone-sound-wheel__ring"
          role="group"
          aria-label="Drone notes"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {DRONE_NOTE_STRIP.map(({ pitchClass, label }, index) => {
            const active = activeNotes.includes(pitchClass)
            const glissando = glissandoPitch === pitchClass
            const position = notePosition(index)
            return (
              <span
                key={pitchClass}
                data-drone-note
                data-pitch-class={pitchClass}
                className={`drone-sound-wheel__note ${
                  active ? 'drone-sound-wheel__note--active' : ''
                } ${glissando ? 'drone-sound-wheel__note--glissando' : ''}`}
                style={position}
                aria-hidden
              >
                {shortNoteLabel(label)}
              </span>
            )
          })}
        </div>
      </div>

      <div className="drone-sound-wheel__octave" aria-label="Drone octave">
        <span className="drone-sound-wheel__octave-label">Oct</span>
        <button
          type="button"
          className="drone-sound-wheel__octave-btn"
          aria-label="Lower octave"
          disabled={octave <= 0}
          onClick={onDecrementOctave}
        >
          −
        </button>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={octave}
            className="drone-sound-wheel__octave-value"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            {octave}
          </motion.span>
        </AnimatePresence>
        <button
          type="button"
          className="drone-sound-wheel__octave-btn"
          aria-label="Raise octave"
          disabled={octave >= 8}
          onClick={onIncrementOctave}
        >
          +
        </button>
      </div>
    </div>
  )
}
