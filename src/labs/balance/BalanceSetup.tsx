import { useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronDown, Mic, Play } from 'lucide-react'
import type { PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import type { PitchReadout } from '../../utils/pitchUtils'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import {
  BALANCE_DIRECTION_LABELS,
  BALANCE_INSTRUMENTS,
  BALANCE_SCALE_TYPE_LABELS,
  clampWrittenMidi,
  getBalanceInstrument,
  midiToBalanceNoteName,
  routineSummary,
} from './balanceMusic'
import { formatBalanceDuration, toleranceCentsForSettings } from './balanceStorage'
import type {
  BalanceCustomRoutine,
  BalanceScaleDirection,
  BalanceScaleType,
  BalanceSettings,
  BalanceTarget,
  BalanceTolerancePreset,
} from './balanceTypes'
import BalanceRoutineEditor from './BalanceRoutineEditor'

type SetupSection = 'routine' | 'instrument' | 'goal' | 'sound'

interface BalanceSetupProps {
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
  onRequestMic: () => void
  onUpdate: (patch: Partial<BalanceSettings>) => void
  onSaveCustom: (routine: BalanceCustomRoutine) => void
  onDeleteCustom: (id: string) => void
}

function SetupGroup({
  id,
  open,
  title,
  summary,
  hapticFeedback,
  onToggle,
  children,
}: {
  id: SetupSection
  open: boolean
  title: string
  summary: string
  hapticFeedback: boolean
  onToggle: (id: SetupSection) => void
  children: ReactNode
}) {
  return (
    <section className={`balance-setup-group ${open ? 'is-open' : ''}`}>
      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-setup-group__head"
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <span><strong>{title}</strong><small>{summary}</small></span>
        <ChevronDown aria-hidden />
      </Pressable>
      {open && <div className="balance-setup-group__body">{children}</div>}
    </section>
  )
}

function NoteSelect({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  value: number
  min: number
  max: number
  onChange: (midi: number) => void
}) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((midi) => (
        <option key={midi} value={midi}>{midiToBalanceNoteName(midi)}</option>
      ))}
    </select>
  )
}

export default function BalanceSetup({
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
  onRequestMic,
  onUpdate,
  onSaveCustom,
  onDeleteCustom,
}: BalanceSetupProps) {
  const [openSection, setOpenSection] = useState<SetupSection | null>(null)
  const instrument = getBalanceInstrument(settings.instrumentId)
  const hasPitch = readout.noteName !== '—' && readout.frequencyHz > 0
  const selectedCustom = customRoutines.find((routine) => routine.id === settings.selectedCustomRoutineId)
  const restLabel =
    settings.soundRest.restDuration === 'matchGoal'
      ? 'match goal'
      : settings.soundRest.restDuration === 'manual'
        ? 'manual'
        : `${settings.soundRest.restDuration}s`
  const goalLabel = settings.goalMode === 'personalBest' ? 'Personal Best' : `${settings.goalSeconds} sec per note`
  const tolerance = toleranceCentsForSettings(settings)
  const scaleSpan = settings.scale.octaveRange * 12
  const maxScaleRoot = Math.max(instrument.minWrittenMidi, instrument.maxWrittenMidi - scaleSpan)
  const micLabel = permissionBlocked
    ? 'Microphone permission is off'
    : permissionPending || sourceHealth === 'connecting'
      ? 'Connecting microphone…'
      : hasPitch
        ? `Hearing ${readout.noteName}`
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable'
          : 'Play a note to check your mic'

  const updateSound = (patch: Partial<BalanceSettings['soundRest']>) =>
    onUpdate({ soundRest: { ...settings.soundRest, ...patch } })

  return (
    <div className="balance-screen balance-screen--setup">
      <header className="balance-head">
        <Pressable intensity="icon" hapticFeedback={hapticFeedback} onClick={onBack} aria-label="Back to Practice Games">
          <ArrowLeft aria-hidden />
        </Pressable>
        <div><h1>Balance</h1><p>Long tones</p></div>
        <p className="balance-head__best"><small>Best</small><strong>{bestBalancedMs > 0 ? formatBalanceDuration(bestBalancedMs) : '—'}</strong></p>
      </header>

      <section className="balance-setup-preview">
        <div className="balance-setup-preview__scene" aria-hidden>
          <span className="balance-preview-cloud" />
          <span className="balance-preview-platform" />
          <span className="balance-preview-rope" />
          <span className="balance-preview-person"><i /><b /></span>
          <span className="balance-preview-note">{previewTarget?.writtenLabel ?? 'C5'}</span>
        </div>
        <h2>Stay centered to keep moving.</h2>
        <p>{previewTarget ? `Written ${previewTarget.writtenLabel} · Concert ${previewTarget.concertLabel}` : 'Choose a routine to preview its first note.'}</p>
      </section>

      <div className="balance-start">
        <Pressable
          haptic="medium"
          hapticFeedback={hapticFeedback}
          className="balance-primary-button"
          onClick={() => {
            onRequestMic()
            onStart()
          }}
          disabled={settings.routineType === 'custom' && !selectedCustom}
        ><Play aria-hidden /> Start</Pressable>
        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          onClick={onRequestMic}
          className={`balance-mic-check ${hasPitch ? 'is-live' : ''} ${permissionBlocked ? 'is-error' : ''}`}
        >
          <Mic aria-hidden />
          <span>{micLabel}<small>Nothing is recorded or stored.</small></span>
          <strong>{hasPitch ? `${readout.noteName} ${Math.round(readout.cents) >= 0 ? '+' : ''}${Math.round(readout.cents)}¢` : '—'}</strong>
        </Pressable>
      </div>

      <SetupGroup
        id="routine"
        open={openSection === 'routine'}
        title="Routine"
        summary={routineSummary(settings, customRoutines)}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <div className="balance-choice-row" role="radiogroup" aria-label="Routine type">
          {(['single', 'scale', 'custom'] as const).map((type) => (
            <Pressable
              key={type}
              intensity="soft"
              hapticFeedback={hapticFeedback}
              className={settings.routineType === type ? 'is-selected' : ''}
              onClick={() => onUpdate({ routineType: type })}
              role="radio"
              aria-checked={settings.routineType === type}
            >{type === 'single' ? 'Single Note' : type === 'scale' ? 'Scale' : 'Custom'}</Pressable>
          ))}
        </div>

        {settings.routineType === 'single' && (
          <>
            <label className="balance-setting-row" htmlFor="balance-single-note"><span>Target written note</span>
              <NoteSelect id="balance-single-note" value={settings.single.writtenMidi} min={instrument.minWrittenMidi} max={instrument.maxWrittenMidi} onChange={(writtenMidi) => onUpdate({ single: { ...settings.single, writtenMidi } })} />
            </label>
            <label className="balance-setting-row" htmlFor="balance-repetitions"><span>Repetitions</span>
              <select id="balance-repetitions" value={settings.single.repetitions} onChange={(event) => onUpdate({ single: { ...settings.single, repetitions: Number(event.target.value) } })}>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </>
        )}

        {settings.routineType === 'scale' && (
          <>
            <label className="balance-setting-row" htmlFor="balance-scale-root"><span>Root written note</span>
              <NoteSelect id="balance-scale-root" value={Math.min(settings.scale.rootWrittenMidi, maxScaleRoot)} min={instrument.minWrittenMidi} max={maxScaleRoot} onChange={(rootWrittenMidi) => onUpdate({ scale: { ...settings.scale, rootWrittenMidi } })} />
            </label>
            <label className="balance-setting-row" htmlFor="balance-scale-type"><span>Scale type</span>
              <select id="balance-scale-type" value={settings.scale.scaleType} onChange={(event) => onUpdate({ scale: { ...settings.scale, scaleType: event.target.value as BalanceScaleType } })}>
                {(Object.keys(BALANCE_SCALE_TYPE_LABELS) as BalanceScaleType[]).map((type) => <option key={type} value={type}>{BALANCE_SCALE_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-scale-direction"><span>Direction</span>
              <select id="balance-scale-direction" value={settings.scale.direction} onChange={(event) => onUpdate({ scale: { ...settings.scale, direction: event.target.value as BalanceScaleDirection } })}>
                {(Object.keys(BALANCE_DIRECTION_LABELS) as BalanceScaleDirection[]).map((direction) => <option key={direction} value={direction}>{BALANCE_DIRECTION_LABELS[direction]}</option>)}
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-octaves"><span>Octave range</span>
              <select id="balance-octaves" value={settings.scale.octaveRange} onChange={(event) => {
                const octaveRange = Number(event.target.value) as 1 | 2
                onUpdate({ scale: { ...settings.scale, octaveRange, rootWrittenMidi: Math.min(settings.scale.rootWrittenMidi, instrument.maxWrittenMidi - octaveRange * 12) } })
              }}>
                <option value={1}>1 octave</option>
                <option value={2} disabled={instrument.maxWrittenMidi - instrument.minWrittenMidi < 24}>2 octaves</option>
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-scale-repetitions"><span>Repetitions</span>
              <select id="balance-scale-repetitions" value={settings.scale.repetitions} onChange={(event) => onUpdate({ scale: { ...settings.scale, repetitions: Number(event.target.value) } })}>
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </>
        )}

        {settings.routineType === 'custom' && (
          <BalanceRoutineEditor
            instrument={instrument}
            routines={customRoutines}
            selectedId={settings.selectedCustomRoutineId}
            hapticFeedback={hapticFeedback}
            onSelect={(selectedCustomRoutineId) => onUpdate({ selectedCustomRoutineId })}
            onSave={onSaveCustom}
            onDelete={onDeleteCustom}
          />
        )}
      </SetupGroup>

      <SetupGroup
        id="instrument"
        open={openSection === 'instrument'}
        title="Instrument"
        summary={`${instrument.name} · ${instrument.clef[0]?.toUpperCase()}${instrument.clef.slice(1)} clef · Written pitch`}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <label className="balance-setting-row" htmlFor="balance-instrument"><span>Instrument</span>
          <select
            id="balance-instrument"
            value={instrument.id}
            onChange={(event) => {
              const nextInstrument = getBalanceInstrument(event.target.value)
              onUpdate({
                instrumentId: nextInstrument.id,
                single: { ...settings.single, writtenMidi: clampWrittenMidi(settings.single.writtenMidi, nextInstrument) },
                scale: {
                  ...settings.scale,
                  rootWrittenMidi: Math.min(
                    clampWrittenMidi(settings.scale.rootWrittenMidi, nextInstrument),
                    nextInstrument.maxWrittenMidi - settings.scale.octaveRange * 12,
                  ),
                },
              })
            }}
          >
            {BALANCE_INSTRUMENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="balance-instrument-facts">
          <span>Transposition<strong>{instrument.transposition === 'concert' ? 'Concert C' : instrument.transposition.replace('_', ' · ')}</strong></span>
          <span>Written range<strong>{midiToBalanceNoteName(instrument.minWrittenMidi)}–{midiToBalanceNoteName(instrument.maxWrittenMidi)}</strong></span>
          <span>Current target<strong>{previewTarget ? `Written ${previewTarget.writtenLabel} · Concert ${previewTarget.concertLabel}` : '—'}</strong></span>
        </div>
      </SetupGroup>

      <SetupGroup
        id="goal"
        open={openSection === 'goal'}
        title="Goal & Precision"
        summary={`${goalLabel} · ${settings.tolerancePreset === 'custom' ? 'Custom' : settings.tolerancePreset[0]?.toUpperCase() + settings.tolerancePreset.slice(1)} ±${tolerance}¢`}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <label className="balance-setting-row" htmlFor="balance-goal-mode"><span>Goal mode</span>
          <select id="balance-goal-mode" value={settings.goalMode} onChange={(event) => onUpdate({ goalMode: event.target.value as BalanceSettings['goalMode'] })}>
            <option value="fixed">Fixed duration</option><option value="personalBest">Personal Best</option>
          </select>
        </label>
        {settings.goalMode === 'fixed' && (
          <label className="balance-setting-row" htmlFor="balance-duration"><span>Duration per note</span>
            <select id="balance-duration" value={settings.goalSeconds} onChange={(event) => onUpdate({ goalSeconds: Number(event.target.value) as BalanceSettings['goalSeconds'] })}>
              {[5, 8, 10, 15].map((value) => <option key={value} value={value}>{value} seconds</option>)}
            </select>
          </label>
        )}
        <label className="balance-setting-row" htmlFor="balance-tolerance"><span>Pitch tolerance</span>
          <select id="balance-tolerance" value={settings.tolerancePreset} onChange={(event) => onUpdate({ tolerancePreset: event.target.value as BalanceTolerancePreset })}>
            <option value="beginner">Beginner ±15¢</option><option value="standard">Standard ±10¢</option><option value="precision">Precision ±5¢</option><option value="custom">Custom</option>
          </select>
        </label>
        {settings.tolerancePreset === 'custom' && (
          <label className="balance-range-row" htmlFor="balance-custom-tolerance"><span>Custom tolerance <strong>±{settings.customToleranceCents}¢</strong></span>
            <input id="balance-custom-tolerance" type="range" min={3} max={30} value={settings.customToleranceCents} onChange={(event) => onUpdate({ customToleranceCents: Number(event.target.value) })} />
          </label>
        )}
      </SetupGroup>

      <SetupGroup
        id="sound"
        open={openSection === 'sound'}
        title="Sound & Rest"
        summary={`${settings.soundRest.referencePitch ? 'Reference on' : 'Reference off'} · Rest ${restLabel}`}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <label className="balance-switch-row"><span>Reference pitch before each note</span><IOSSwitch checked={settings.soundRest.referencePitch} onChange={(referencePitch) => updateSound({ referencePitch })} ariaLabel="Reference pitch before each note" hapticFeedback={hapticFeedback} /></label>
        <label className="balance-switch-row"><span>Continuous drone</span><IOSSwitch checked={settings.soundRest.continuousDrone} onChange={(continuousDrone) => updateSound({ continuousDrone })} ariaLabel="Continuous drone" hapticFeedback={hapticFeedback} /></label>
        <label className="balance-range-row" htmlFor="balance-volume"><span>Reference/drone volume <strong>{Math.round(settings.soundRest.volume * 100)}%</strong></span><input id="balance-volume" type="range" min={10} max={100} value={settings.soundRest.volume * 100} onChange={(event) => updateSound({ volume: Number(event.target.value) / 100 })} /></label>
        <label className="balance-switch-row"><span>Count-in</span><IOSSwitch checked={settings.soundRest.countIn} onChange={(countIn) => updateSound({ countIn })} ariaLabel="Count in" hapticFeedback={hapticFeedback} /></label>
        <label className="balance-setting-row" htmlFor="balance-rest"><span>Rest between notes</span>
          <select id="balance-rest" value={String(settings.soundRest.restDuration)} onChange={(event) => updateSound({ restDuration: event.target.value === 'matchGoal' || event.target.value === 'manual' ? event.target.value : Number(event.target.value) as 5 | 10 })}>
            <option value="matchGoal">Match goal duration</option><option value="5">5 seconds</option><option value="10">10 seconds</option><option value="manual">Manual</option>
          </select>
        </label>
        <label className="balance-switch-row"><span>Auto-advance after rest</span><IOSSwitch checked={settings.soundRest.autoAdvance} onChange={(autoAdvance) => updateSound({ autoAdvance })} ariaLabel="Auto advance after rest" hapticFeedback={hapticFeedback} /></label>
      </SetupGroup>
    </div>
  )
}
