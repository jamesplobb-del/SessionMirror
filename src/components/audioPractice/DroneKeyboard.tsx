import { useRef, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DRONE_NOTE_STRIP } from '../../utils/droneEngine'

export interface DroneKeyboardProps {
  activeNotes: number[]
  octave: number
  onToggleNote: (pitchClass: number) => void
  onIncrementOctave: () => void
  onDecrementOctave: () => void
}

function noteWithOctave(label: string, octave: number): string {
  const primaryLabel = label.split('/')[0] ?? label
  return `${primaryLabel}${octave}`
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

export default function DroneKeyboard({
  activeNotes,
  octave,
  onToggleNote,
  onIncrementOctave,
  onDecrementOctave,
}: DroneKeyboardProps) {
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
    <div className="drone-keyboard pointer-events-auto">
      <div
        className="drone-keyboard__strip"
        role="group"
        aria-label="Drone notes"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {DRONE_NOTE_STRIP.map(({ pitchClass, label }) => {
          const active = activeNotes.includes(pitchClass)
          const displayLabel = noteWithOctave(label, octave)
          return (
            <button
              key={pitchClass}
              type="button"
              data-drone-note
              data-pitch-class={pitchClass}
              className={`drone-keyboard__note ${active ? 'drone-keyboard__note--active' : ''}`}
              aria-pressed={active}
              aria-label={`${active ? 'Stop' : 'Start'} ${label}${octave} drone`}
              onClick={(event) => {
                if (event.detail === 0) onToggleNote(pitchClass)
              }}
            >
              {displayLabel}
            </button>
          )
        })}
      </div>

      <div className="drone-keyboard__octave" aria-label="Drone octave">
        <button
          type="button"
          className="drone-keyboard__octave-btn"
          aria-label="Lower octave"
          disabled={octave <= 0}
          onClick={onDecrementOctave}
        >
          −
        </button>
        <div className="drone-keyboard__octave-readout">
          <span className="drone-keyboard__octave-label">Octave</span>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={octave}
              className="drone-keyboard__octave-value"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              C{octave}
            </motion.span>
          </AnimatePresence>
        </div>
        <button
          type="button"
          className="drone-keyboard__octave-btn"
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
