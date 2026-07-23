import { memo } from 'react'
import {
  formatDisplayCents,
  formatFrequencyHz,
  getIntonationZone,
  TUNING_GREEN_CENTS,
  type PitchReadout,
} from '../../utils/pitchUtils'

interface TuningGaugeProps {
  readout: PitchReadout
}

function splitNoteName(noteName: string): { pitch: string; octave: string } {
  const match = /^([A-G]#?)(-?\d+)$/.exec(noteName)
  return match ? { pitch: match[1], octave: match[2] } : { pitch: noteName, octave: '' }
}

function statusForPitch(active: boolean, cents: number): string {
  if (!active) return 'Listening'
  if (Math.abs(cents) <= TUNING_GREEN_CENTS) return 'In tune'
  if (getIntonationZone(cents) === 'yellow') {
    return cents < 0 ? 'Slightly flat' : 'Slightly sharp'
  }
  return cents < 0 ? 'Flat' : 'Sharp'
}

function TuningGauge({ readout }: TuningGaugeProps) {
  const active = readout.noteName !== '—'
  const cents = active ? Math.max(-50, Math.min(50, readout.cents)) : 0
  const zone = active ? getIntonationZone(cents) : 'idle'
  const status = statusForPitch(active, cents)
  const note = splitNoteName(readout.noteName)

  return (
    <section
      className={`pitch-living-readout pitch-living-readout--${zone}`}
      aria-label={
        active
          ? `${readout.noteName}, ${formatFrequencyHz(readout.frequencyHz)}, ${formatDisplayCents(readout.cents)}, ${status}`
          : 'Tuner listening for a note'
      }
      aria-live="polite"
    >
      <p className="pitch-living-readout__status">
        <span aria-hidden />
        {status}
      </p>

      <p className="pitch-living-readout__note">
        <span>{note.pitch}</span>
        {note.octave ? <small>{note.octave}</small> : null}
      </p>

      <div className="pitch-living-readout__detail">
        <strong>{active ? formatDisplayCents(readout.cents) : '—'}</strong>
        <span aria-hidden>·</span>
        <span>{formatFrequencyHz(readout.frequencyHz)}</span>
      </div>
    </section>
  )
}

export default memo(TuningGauge)
