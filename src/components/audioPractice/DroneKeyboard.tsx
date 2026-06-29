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
  return label
    .split('/')
    .map((part) => `${part}${octave}`)
    .join('/')
}

export default function DroneKeyboard({
  activeNotes,
  octave,
  onToggleNote,
  onIncrementOctave,
  onDecrementOctave,
}: DroneKeyboardProps) {
  return (
    <div className="drone-keyboard pointer-events-auto">
      <div className="drone-keyboard__strip" role="group" aria-label="Drone notes">
        {DRONE_NOTE_STRIP.map(({ pitchClass, label }) => {
          const active = activeNotes.includes(pitchClass)
          const displayLabel = noteWithOctave(label, octave)
          return (
            <button
              key={pitchClass}
              type="button"
              className={`drone-keyboard__note ${active ? 'drone-keyboard__note--active' : ''}`}
              aria-pressed={active}
              aria-label={`${active ? 'Stop' : 'Start'} ${displayLabel} drone`}
              onClick={() => onToggleNote(pitchClass)}
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
