import { useRef, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DRONE_NOTE_STRIP } from '../../utils/droneEngine'

const WHEEL_NOTE_COUNT = 12
const WHEEL_RADIUS_PERCENT = 44.5

export interface DroneSoundWheelProps {
  activeNotes: number[]
  octave: number
  onToggleNote: (pitchClass: number) => void
  onIncrementOctave: () => void
  onDecrementOctave: () => void
  children: ReactNode
}

function shortNoteLabel(label: string): string {
  return label.split('/')[0] ?? label
}

function noteFromPoint(clientX: number, clientY: number): number | null {
  const element = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLButtonElement>('[data-drone-note]')
  const rawPitchClass = element?.dataset.pitchClass
  if (!rawPitchClass) return null
  const pitchClass = Number(rawPitchClass)
  return Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11 ? pitchClass : null
}

function notePosition(index: number): { left: string; top: string } {
  const angle = (index / WHEEL_NOTE_COUNT) * Math.PI * 2 - Math.PI / 2
  return {
    left: `${50 + WHEEL_RADIUS_PERCENT * Math.cos(angle)}%`,
    top: `${50 + WHEEL_RADIUS_PERCENT * Math.sin(angle)}%`,
  }
}

export default function DroneSoundWheel({
  activeNotes,
  octave,
  onToggleNote,
  onIncrementOctave,
  onDecrementOctave,
  children,
}: DroneSoundWheelProps) {
  const touchedNotesRef = useRef<Set<number>>(new Set())

  const touchNote = (pitchClass: number) => {
    if (touchedNotesRef.current.has(pitchClass)) return
    touchedNotesRef.current.add(pitchClass)
    onToggleNote(pitchClass)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    touchedNotesRef.current = new Set()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pitchClass = noteFromPoint(event.clientX, event.clientY)
    if (pitchClass !== null) touchNote(pitchClass)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    const pitchClass = noteFromPoint(event.clientX, event.clientY)
    if (pitchClass !== null) touchNote(pitchClass)
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    touchedNotesRef.current = new Set()
  }

  return (
    <div className="drone-sound-wheel pointer-events-auto">
      <div className="drone-sound-wheel__stage">
        <div className="drone-sound-wheel__center">{children}</div>
        <div
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
            const position = notePosition(index)
            return (
              <button
                key={pitchClass}
                type="button"
                data-drone-note
                data-pitch-class={pitchClass}
                className={`drone-sound-wheel__note ${active ? 'drone-sound-wheel__note--active' : ''}`}
                style={position}
                aria-pressed={active}
                aria-label={`${active ? 'Stop' : 'Start'} ${label} octave ${octave}`}
                onClick={(event) => {
                  if (event.detail === 0) onToggleNote(pitchClass)
                }}
              >
                {shortNoteLabel(label)}
              </button>
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
