import { getBalanceInstrument, isBalanceDecayInstrument } from './balanceInstruments'
import { useMemo, useRef } from 'react'
import { Mic, Play, Settings } from 'lucide-react'
import ArcadePickerChip from '../../components/labs/ArcadePickerChip'
import Pressable from '../../components/ui/Pressable'
import type { PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import type { PitchReadout } from '../../utils/pitchUtils'
import BalanceArcadeShell from './BalanceArcadeShell'
import BalanceScene from './BalanceScene'
import { balanceDifficultyLabel } from './balanceLevels'
import { balanceCustomRoutineIssue, midiToBalanceNoteName, routineSummary } from './balanceMusic'
import { formatBalanceDuration, toleranceCentsForSettings } from './balanceStorage'
import type { BalanceCustomRoutine, BalanceSettings, BalanceTarget } from './balanceTypes'

interface BalanceQuickPlayProps {
  settings: BalanceSettings
  customRoutines: BalanceCustomRoutine[]
  previewTarget: BalanceTarget | null
  bestBalancedMs: number
  readout: PitchReadout
  sourceHealth: PitchSourceHealth
  permissionBlocked: boolean
  permissionPending: boolean
  hapticFeedback: boolean
  onBack: () => void
  onStart: () => void
  onUpdate: (patch: Partial<BalanceSettings>) => void
  onOptions: () => void
  onRequestMic: () => void
}

/**
 * The instant-play card: the note, the goal and the difficulty as three chips
 * over the real game world, one enormous Play, and the whole configuration
 * screen one quiet tap away.
 *
 * The hero is `BalanceScene` held at its idle frame rather than a drawing of
 * it, so what the player is looking at is exactly what they are about to walk
 * across — including how far away the destination island is for the duration
 * they picked.
 */
export default function BalanceQuickPlay({
  settings,
  customRoutines,
  previewTarget,
  bestBalancedMs,
  readout,
  sourceHealth,
  permissionBlocked,
  permissionPending,
  hapticFeedback,
  onBack,
  onStart,
  onUpdate,
  onOptions,
  onRequestMic,
}: BalanceQuickPlayProps) {
  const tolerance = toleranceCentsForSettings(settings)
  const hasPitch = readout.noteName !== '—' && readout.frequencyHz > 0
  const difficulty = balanceDifficultyLabel(tolerance)

  const previewVisualRef = useRef({
    cents: 0,
    progress: 0,
    speed: 0,
    balancedMs: 0,
    confidentMs: 0,
    pitchPresent: false,
  })

  const noteLabel =
    previewTarget?.writtenLabel ??
    (settings.routineType === 'scale'
      ? midiToBalanceNoteName(settings.scale.rootWrittenMidi)
      : settings.routineType === 'single'
        ? midiToBalanceNoteName(settings.single.writtenMidi)
        : '—')

  /*
   * The Note chip opens a picker with the same bounds as the setup screen:
   * the instrument's written range. A custom routine's notes are its own, so
   * there it stays a label.
   */
  const instrument = getBalanceInstrument(settings.instrumentId)
  const noteMidi =
    settings.routineType === 'scale' ? settings.scale.rootWrittenMidi : settings.single.writtenMidi
  const noteCanChange =
    settings.routineType !== 'custom' && instrument.maxWrittenMidi > instrument.minWrittenMidi
  const noteOptions = useMemo(
    () =>
      Array.from({ length: instrument.maxWrittenMidi - instrument.minWrittenMidi + 1 }, (_, index) => {
        const midi = instrument.minWrittenMidi + index
        return { value: midi, label: midiToBalanceNoteName(midi) }
      }),
    [instrument.maxWrittenMidi, instrument.minWrittenMidi],
  )
  const chooseNote = (midi: number) => {
    if (settings.routineType === 'scale') {
      onUpdate({ scale: { ...settings.scale, rootWrittenMidi: midi } })
    } else {
      onUpdate({ single: { ...settings.single, writtenMidi: midi } })
    }
  }

  const goalLabel =
    settings.goalMode === 'personalBest' ? 'Best' : `${settings.goalSeconds} sec`

  const micLabel = permissionBlocked
    ? 'Microphone permission is off'
    : permissionPending || sourceHealth === 'connecting'
      ? 'Connecting microphone…'
      : hasPitch
        ? `Hearing ${readout.noteName}`
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable'
          : 'Play a note to check your mic'

  const routineLabel = useMemo(
    () => routineSummary(settings, customRoutines),
    [customRoutines, settings],
  )

  const customIssue = balanceCustomRoutineIssue(settings, customRoutines)

  return (
    <BalanceArcadeShell
      title="Quick Play"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Back to Balance home"
      stat={bestBalancedMs > 0 ? { label: 'Best', value: formatBalanceDuration(bestBalancedMs) } : null}
      className="balance-arcade--quick"
    >
      <div>
        <h1 className="balance-display balance-display--hero">Balance</h1>
        <p className="balance-subdisplay">{isBalanceDecayInstrument(settings.instrumentId) ? 'Re-strike your note as it fades. Reach the flag.' : 'Hold your note. Reach the flag.'}</p>
      </div>

      <div className="balance-quick__hero">
        <BalanceScene
          phase="setup"
          target={previewTarget}
          visualRef={previewVisualRef}
          characterId={settings.characterId}
          toleranceCents={tolerance}
          goalSeconds={settings.goalSeconds}
        />
      </div>

      <div className="balance-chips">
        {noteCanChange ? (
          <ArcadePickerChip
            label="Note"
            value={noteMidi}
            display={noteLabel}
            options={noteOptions}
            hapticFeedback={hapticFeedback}
            className="balance-chip"
            onChange={chooseNote}
          />
        ) : (
          <span className="balance-chip">
            <small>Note</small>
            <strong>{noteLabel}</strong>
          </span>
        )}
        <span className="balance-chip">
          <small>Goal</small>
          <strong>{goalLabel}</strong>
        </span>
        <span className="balance-chip balance-chip--tone" data-level={difficulty}>
          <small>±{tolerance}¢</small>
          <strong>{difficulty}</strong>
        </span>
      </div>

      {customIssue && <p className="balance-subdisplay" role="status">{customIssue}</p>}
      <div className="balance-quick__actions">
        <Pressable
          haptic="medium"
          hapticFeedback={hapticFeedback}
          className="balance-cta"
          onClick={onStart}
          disabled={Boolean(customIssue)}
        >
          <Play aria-hidden /> Play
        </Pressable>

        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          className="balance-textlink"
          onClick={onOptions}
        >
          <Settings aria-hidden /> More options
        </Pressable>

        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          onClick={onRequestMic}
          className={`balance-quick__mic ${hasPitch ? 'is-live' : ''} ${permissionBlocked ? 'is-error' : ''}`}
        >
          <Mic aria-hidden />
          <span>
            <b>{micLabel}</b>
            <small>{routineLabel}</small>
          </span>
          <strong>
            {hasPitch
              ? `${readout.noteName} ${Math.round(readout.cents) >= 0 ? '+' : ''}${Math.round(readout.cents)}¢`
              : '—'}
          </strong>
        </Pressable>
      </div>
    </BalanceArcadeShell>
  )
}
