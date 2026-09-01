import { Check } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import BalanceStaffNote from './BalanceStaffNote'
import { BALANCE_INSTRUMENTS } from './balanceInstruments'
import { midiToBalanceNoteName } from './balanceMusic'

interface BalanceInstrumentPickerProps {
  instrumentId: string
  hapticFeedback: boolean
  onBack: () => void
  onSelect: (instrumentId: string) => void
}

/** Printed order — brass, woodwind, strings, then everything else. */
const FAMILY_ORDER = ['Brass', 'Woodwind', 'Strings', 'Voice & keys'] as const

/**
 * Pick the horn.
 *
 * This decides every note the game will ask for — the levels are offsets from
 * this instrument's own starting note, clamped to its own range — so it is
 * reachable in one tap from the first screen rather than buried under Quick
 * Play's options, where a tuba player would have spent a whole session being
 * asked for notes a fifth above their horn.
 *
 * Each row prints the range it unlocks and the note the trail starts on, so
 * the consequence of the choice is visible before it is made.
 */
export default function BalanceInstrumentPicker({
  instrumentId,
  hapticFeedback,
  onBack,
  onSelect,
}: BalanceInstrumentPickerProps) {
  const families = [...FAMILY_ORDER].filter((family) =>
    BALANCE_INSTRUMENTS.some((instrument) => instrument.family === family),
  )

  return (
    <BalanceArcadeShell
      title="Instrument"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Back to Balance home"
      className="balance-arcade--picker"
    >
      <h1 className="balance-display balance-display--page">Your Instrument</h1>
      <p className="balance-subdisplay">Levels follow your horn&apos;s own range.</p>

      {families.map((family) => (
        <section key={family} className="balance-picker__group">
          <h2 className="balance-picker__family">{family}</h2>
          <div className="balance-picker__list">
            {BALANCE_INSTRUMENTS.filter((instrument) => instrument.family === family).map(
              (instrument) => {
                const selected = instrument.id === instrumentId
                return (
                  <Pressable
                    key={instrument.id}
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    className={`balance-picker__row ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => onSelect(instrument.id)}
                  >
                    <span className="balance-picker__text">
                      <strong>{instrument.name}</strong>
                      <small>
                        {midiToBalanceNoteName(instrument.minWrittenMidi)}–
                        {midiToBalanceNoteName(instrument.maxWrittenMidi)} · starts on{' '}
                        {midiToBalanceNoteName(instrument.homeWrittenMidi)}
                      </small>
                    </span>
                    <BalanceStaffNote
                      writtenMidi={instrument.homeWrittenMidi}
                      clef={instrument.clef}
                      height={52}
                      fit="staff"
                      className="balance-picker__staff"
                    />
                    {selected ? <Check className="balance-picker__check" aria-hidden /> : null}
                  </Pressable>
                )
              },
            )}
          </div>
        </section>
      ))}
    </BalanceArcadeShell>
  )
}
