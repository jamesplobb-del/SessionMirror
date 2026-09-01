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
  /** Latch or release the displayed note as a drone. Omitted when catch is unavailable. */
  onCatchNote?: () => void
  catchLabel?: string
  catchPressed?: boolean
  /** Quiet habit line for the held note. Independent of Pitch Insights. */
  coach?: string | null
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

function NoteName({ pitch, octave }: { pitch: string; octave: string }) {
  return (
    <>
      <span>{pitch}</span>
      {octave ? <small>{octave}</small> : null}
    </>
  )
}

function TuningGauge({
  readout,
  onCatchNote,
  catchLabel,
  catchPressed = false,
  coach = null,
}: TuningGaugeProps) {
  const active = readout.noteName !== '—'
  const cents = active ? Math.max(-50, Math.min(50, readout.cents)) : 0
  const zone = active ? getIntonationZone(cents) : 'idle'
  const status = statusForPitch(active, cents)
  const note = splitNoteName(readout.noteName)
  const canCatch = Boolean(onCatchNote && active)

  return (
    <section
      className={`pitch-living-readout pitch-living-readout--${zone}`}
      aria-label={
        active
          ? `${readout.noteName}, ${formatFrequencyHz(readout.frequencyHz)}, ${formatDisplayCents(readout.cents)}, ${status}${
              coach ? `. ${coach}` : ''
            }`
          : 'Tuner listening for a note'
      }
      aria-live="polite"
    >
      <p className="pitch-living-readout__status">
        <span aria-hidden />
        {status}
      </p>

      {canCatch ? (
        <button
          type="button"
          data-tutorial="tuner-drone-catch"
          className="pitch-living-readout__note pitch-living-readout__note--catch"
          onClick={onCatchNote}
          aria-label={catchLabel ?? `Hold ${readout.noteName} as a drone`}
          aria-pressed={catchPressed}
        >
          <NoteName pitch={note.pitch} octave={note.octave} />
        </button>
      ) : (
        <p className="pitch-living-readout__note">
          <NoteName pitch={note.pitch} octave={note.octave} />
        </p>
      )}

      {coach ? (
        <p className="pitch-living-readout__coach" aria-hidden="true">
          {coach}
        </p>
      ) : null}

      <div className="pitch-living-readout__detail">
        <strong>{active ? formatDisplayCents(readout.cents) : '—'}</strong>
        <span aria-hidden>·</span>
        <span>{formatFrequencyHz(readout.frequencyHz)}</span>
      </div>
    </section>
  )
}

export default memo(TuningGauge)
