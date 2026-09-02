import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useGameMicRecovery, type GameMicRequest } from '../useGameMicRecovery'
import {
  ChevronDown,
  Headphones,
  Mic,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Shuffle,
} from 'lucide-react'
import './staff-jumper.css'
import '../balance/balance-arcade.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import { GAME_TEST_INPUT, SILENT_READOUT, syntheticReadout, TEST_TAP_HOLD_MS } from '../gameTestInput'
import {
  computeAccuracy,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  DIFFICULTY_TIMEOUT_SECONDS,
  getConcertTonicPitchClass,
  getScaleRangePreview,
  getTargetNoteAtStep,
  keysForScaleMode,
  pitchClassLabel,
  RANGE_LABELS,
  STAFF_JUMPER_DIFFICULTIES,
  STAFF_JUMPER_RANGES,
  scaleDisplayName,
  type StaffJumperDifficulty,
  type StaffJumperKey,
  type StaffJumperRange,
  type StaffJumperScaleMode,
} from './staffJumperMusicLogic'
import type { StaffJumperTransposition } from './staffJumperInstrumentRanges'
import {
  getStaffJumperInstrument,
  getStaffJumperInstrumentsByFamily,
  homeKeyForInstrument,
  loadStaffJumperInstrumentId,
  saveStaffJumperInstrumentId,
  STAFF_JUMPER_INSTRUMENT_FAMILIES,
} from './staffJumperInstruments'
import {
  METERS,
  STAFF_JUMPER_METERS,
  STAFF_JUMPER_TEMPO_DEFAULT,
  STAFF_JUMPER_TEMPO_MAX,
  STAFF_JUMPER_TEMPO_MIN,
  type StaffJumperMeter,
} from './staffJumperRhythm'
import {
  loadPracticeGameCharacter,
  type PracticeGameCharacterId,
} from '../practiceGameCharacters'
import { savePracticeGameInstrumentId } from '../practiceGameInstrument'
import {
  CLEF_LABELS,
  STAFF_JUMPER_READING_CLEFS,
  type StaffJumperClef,
} from './staffNotationMap'
import { useStaffJumperGame } from './useStaffJumperGame'
import type { TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../../components/ui/Pressable'
import ArcadeCycleChip, { cycleNext } from '../../components/labs/ArcadeCycleChip'
import BalanceArcadeShell from '../balance/BalanceArcadeShell'
import StaffJumperGame from './StaffJumperGame'
import StaffPreview from './StaffPreview'

const TEMPO_PRESETS = [60, 72, 80, 88, 96, 108, 120, 132] as const

function cycleTempo(current: number): number {
  return TEMPO_PRESETS.find((bpm) => bpm > current) ?? TEMPO_PRESETS[0]!
}

function tempoPresetIndex(bpm: number): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  TEMPO_PRESETS.forEach((preset, index) => {
    const dist = Math.abs(preset - bpm)
    if (dist < bestDist) {
      best = index
      bestDist = dist
    }
  })
  return best
}

interface StaffJumperScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  hapticFeedback: boolean
  onRequestMicStream: GameMicRequest
  onBack: () => void
}

/**
 * The manual written-pitch row, kept underneath the instrument picker for
 * anything the list does not name. Each key is labelled with the instruments
 * that read it, because a bare dropdown of key names made everyone guess.
 */
const WRITTEN_PITCH_CHOICES: {
  id: StaffJumperTransposition
  name: string
  instruments: string
}[] = [
  { id: 'concert', name: 'Concert C', instruments: 'Flute · Violin · Voice · Piano' },
  { id: 'bb', name: 'B♭', instruments: 'Trumpet · Clarinet · Tenor sax' },
  { id: 'eb', name: 'E♭', instruments: 'Alto sax · Bari sax' },
  { id: 'f', name: 'F', instruments: 'French horn' },
  { id: 'a', name: 'A', instruments: 'Clarinet in A' },
  { id: 'g', name: 'G', instruments: 'Alto flute' },
]

interface InstrumentSetup {
  instrumentId: string | null
  clef: StaffJumperClef
  transposition: StaffJumperTransposition
  key: StaffJumperKey
}

/**
 * What the saved instrument decides before the screen has drawn anything.
 *
 * With no instrument saved this is the old concert-pitch default, and the
 * picker opens on "Other", which is also what a hand-set clef leaves behind.
 */
function initialInstrumentSetup(): InstrumentSetup {
  const instrument = getStaffJumperInstrument(loadStaffJumperInstrumentId())
  if (!instrument) {
    return { instrumentId: null, clef: 'treble', transposition: 'concert', key: 'C' }
  }
  return {
    instrumentId: instrument.id,
    clef: instrument.clef,
    transposition: instrument.transposition,
    key: homeKeyForInstrument(instrument, 'major'),
  }
}

/*
 * The three pieces of setup furniture below live at module scope on purpose.
 *
 * The screen re-renders on every microphone reading — several times a second,
 * so the mic check can say what it hears. Declared inside that render they
 * would be a brand-new component type each time, and React would throw away
 * the whole open panel and build it again: harmless-looking, except that iOS
 * closes a native picker the instant its <select> is replaced, which made the
 * instrument dropdown impossible to open on a phone.
 */

/** Inline text options — the choice is just the word, underlined when on. */
function Options<T extends string>({
  value,
  options,
  onChange,
  label,
  hapticFeedback,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (next: T) => void
  label: string
  hapticFeedback: boolean
}) {
  return (
    <div className="sj-options" role="group" aria-label={label}>
      {options.map((option) => (
        <Pressable
          key={option.id}
          type="button"
          intensity="soft"
          hapticFeedback={hapticFeedback}
          onClick={() => onChange(option.id)}
          className={`sj-option ${value === option.id ? 'sj-option--on' : ''}`}
          aria-pressed={value === option.id}
        >
          {option.label}
        </Pressable>
      ))}
    </div>
  )
}

function OptionsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sj-panel">
      <div className="sj-panel__head">
        <strong>{title}</strong>
      </div>
      <div className="sj-group__body">{children}</div>
    </section>
  )
}

function formatRunTime(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(rounded / 60)
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`
}

export default function StaffJumperScreen({
  streamRef,
  streamGeneration,
  tunerInstrument,
  hapticFeedback,
  onRequestMicStream,
  onBack,
}: StaffJumperScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [savedSetup] = useState(initialInstrumentSetup)
  const [draftScaleMode, setDraftScaleMode] = useState<StaffJumperScaleMode>('major')
  const [draftKey, setDraftKey] = useState<StaffJumperKey>(savedSetup.key)
  const [draftRange, setDraftRange] = useState<StaffJumperRange>('1-octave')
  const [draftDifficulty, setDraftDifficulty] = useState<StaffJumperDifficulty>('easy')
  const [draftInstrumentId, setDraftInstrumentId] = useState<string | null>(savedSetup.instrumentId)
  const [draftClef, setDraftClef] = useState<StaffJumperClef>(savedSetup.clef)
  const [draftTransposition, setDraftTransposition] = useState<StaffJumperTransposition>(
    savedSetup.transposition,
  )
  const [draftPlayerModel] = useState<PracticeGameCharacterId>(
    loadPracticeGameCharacter,
  )
  const [draftMeter, setDraftMeter] = useState<StaffJumperMeter>('simple')
  const [draftTempo, setDraftTempo] = useState(STAFF_JUMPER_TEMPO_DEFAULT)
  const [draftMetronome, setDraftMetronome] = useState(true)
  const [draftDrone, setDraftDrone] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  /**
   * The preview shows one sample of a randomized exercise, so it needs its own
   * seed — otherwise it would redraw different notes on every keystroke.
   */
  const [previewSeed, setPreviewSeed] = useState(() => Date.now())

  const availableKeys = keysForScaleMode(draftScaleMode)

  useEffect(() => {
    if (!availableKeys.includes(draftKey)) {
      setDraftKey(availableKeys[0]!)
    }
  }, [availableKeys, draftKey])

  const selectedInstrument = getStaffJumperInstrument(draftInstrumentId)

  /**
   * Picking an instrument rewrites the reading context wholesale: the clef it
   * is printed in, the pitch it is written at, and the scale its method book
   * opens on. That last one is the point — a trombonist should land on B♭ in
   * bass clef, not on the concert C every setup used to start from.
   */
  const chooseInstrument = (id: string) => {
    const instrument = getStaffJumperInstrument(id)
    setDraftInstrumentId(instrument?.id ?? null)
    saveStaffJumperInstrumentId(instrument?.id ?? null)
    if (instrument) savePracticeGameInstrumentId(instrument.id)
    if (!instrument) return
    setDraftClef(instrument.clef)
    setDraftTransposition(instrument.transposition)
    setDraftKey(homeKeyForInstrument(instrument, draftScaleMode))
  }

  /** Setting the clef or written pitch by hand means this is nobody's preset. */
  const clearInstrument = () => {
    if (draftInstrumentId === null) return
    setDraftInstrumentId(null)
    saveStaffJumperInstrumentId(null)
  }

  const chooseClef = (clef: StaffJumperClef) => {
    setDraftClef(clef)
    if (selectedInstrument && selectedInstrument.clef !== clef) clearInstrument()
  }

  const chooseTransposition = (transposition: StaffJumperTransposition) => {
    setDraftTransposition(transposition)
    if (selectedInstrument && selectedInstrument.transposition !== transposition) clearInstrument()
  }

  /**
   * Major and minor keep the same signature across the switch, so a player who
   * never left their instrument's home key stays home. One who chose their own
   * key keeps it.
   */
  const chooseScaleMode = (scaleMode: StaffJumperScaleMode) => {
    setDraftScaleMode(scaleMode)
    if (!selectedInstrument) return
    if (draftKey !== homeKeyForInstrument(selectedInstrument, draftScaleMode)) return
    setDraftKey(homeKeyForInstrument(selectedInstrument, scaleMode))
  }

  useEffect(() => {
    onRequestMicStream()
  }, [onRequestMicStream, streamGeneration])

  const pitchEnabled = true
  /*
   * Coming back from the background, the stream is usually dead while
   * still looking present. This re-acquires it and, through the epoch in
   * the tracker key below, rebuilds the analysis graph on top of it —
   * without which the game returns to a suspended AudioContext and hears
   * nothing at all.
   */
  const micEpoch = useGameMicRecovery(pitchEnabled, onRequestMicStream)

  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `staff-jumper-${streamGeneration}-${micEpoch}`,
    canvasRef,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      tunerInstrument,
      realtimeMode: true,
      continuousScroll: false,
      allowStandaloneMicFallback: true,
    },
  )

  /**
   * Instrument-free testing: a tap sounds the note the game is waiting for.
   *
   * The synthetic reading is substituted for the microphone's, so the game
   * itself is unaware of it — pitch matching, the stability window, timing
   * against the click and the linger all behave exactly as they would with a
   * horn. Holding it for a fixed spell and then falling silent is what makes
   * one tap advance exactly one note.
   */
  const [tapMidi, setTapMidi] = useState<number | null>(null)
  const targetMidiRef = useRef<number | null>(null)
  const tapTimerRef = useRef<number | null>(null)
  const effectiveReadout = !GAME_TEST_INPUT
    ? readout
    : tapMidi == null
      ? SILENT_READOUT
      : syntheticReadout(tapMidi)

  useEffect(() => () => {
    if (tapTimerRef.current != null) window.clearTimeout(tapTimerRef.current)
  }, [])

  const playTestNote = () => {
    const midi = targetMidiRef.current
    if (midi == null) return
    if (tapTimerRef.current != null) window.clearTimeout(tapTimerRef.current)
    setTapMidi(midi)
    tapTimerRef.current = window.setTimeout(() => setTapMidi(null), TEST_TAP_HOLD_MS)
  }

  const {
    state,
    start,
    restart,
    backToSetup,
    completeFall,
    pause,
    resume,
    noteRemainingMs,
    noteTimeoutMs,
  } = useStaffJumperGame(effectiveReadout, pitchEnabled, hapticFeedback)

  targetMidiRef.current =
    state.config && state.phase === 'playing'
      ? getTargetNoteAtStep(state.config, state.sequenceStep).midi
      : null
  const draftConfig = useMemo(
    () => ({
      key: draftKey,
      scaleMode: draftScaleMode,
      range: draftRange,
      difficulty: draftDifficulty,
      clef: draftClef,
      tunerInstrument,
      transposition: draftTransposition,
      instrumentId: draftInstrumentId,
      playerModel: draftPlayerModel,
      meter: draftMeter,
      tempoBpm: draftTempo,
      metronome: draftMetronome,
      drone: draftDrone,
    }),
    [
      draftClef,
      draftDifficulty,
      draftDrone,
      draftInstrumentId,
      draftKey,
      draftMetronome,
      draftPlayerModel,
      draftRange,
      draftMeter,
      draftScaleMode,
      draftTempo,
      draftTransposition,
      tunerInstrument,
    ],
  )
  const rangePreview = useMemo(() => getScaleRangePreview(draftConfig), [draftConfig])
  const previewConfig = useMemo(
    () => ({ ...draftConfig, sessionSeed: previewSeed }),
    [draftConfig, previewSeed],
  )
  const meterSpec = METERS[draftMeter]
  const droneNoteLabel = pitchClassLabel(getConcertTonicPitchClass(draftConfig), draftKey)

  const hasPitchSignal =
    Number.isFinite(readout.frequencyHz) &&
    readout.frequencyHz > 0 &&
    Boolean(readout.noteName && readout.noteName !== '—')

  if (state.phase === 'setup') {
    const writtenPitchChoice =
      WRITTEN_PITCH_CHOICES.find((item) => item.id === draftTransposition) ??
      WRITTEN_PITCH_CHOICES[0]!
    const instrumentFact = selectedInstrument?.shortName ?? `${writtenPitchChoice.name} · custom`
    const difficultyIndex = STAFF_JUMPER_DIFFICULTIES.indexOf(draftDifficulty)
    const rangeIndex = STAFF_JUMPER_RANGES.indexOf(draftRange)
    const openMore = () => setShowOptions(true)

    return (
      <BalanceArcadeShell
        title="Staff Jumper"
        hapticFeedback={hapticFeedback}
        onBack={onBack}
        backLabel="Back to Practice Games"
        stat={{ label: 'Best', value: String(state.bestScore || '—') }}
        className="balance-arcade--ready"
        footer={
          <div className="balance-ready__dock">
            <Pressable
              type="button"
              haptic="medium"
              hapticFeedback={hapticFeedback}
              onClick={() => start(draftConfig)}
              className="balance-cta"
            >
              <Play aria-hidden /> Play
            </Pressable>
            <p className={`sj-start__mic ${hasPitchSignal ? 'sj-start__mic--live' : ''}`}>
              <Mic aria-hidden />
              {hasPitchSignal ? `Hearing ${readout.noteName}` : 'Play a note to check your mic'}
            </p>
            {(draftMetronome || draftDrone) && (
              <p className="balance-ready__headphones">
                <Headphones aria-hidden />
                {draftDrone
                  ? 'Use headphones — the mic hears the drone as a played note.'
                  : 'Use headphones — the mic can hear the click and misread it.'}
              </p>
            )}
          </div>
        }
      >
        <div>
          <h1 className="balance-display balance-display--page">
            {scaleDisplayName(draftKey, draftScaleMode)}
          </h1>
          <p className="balance-subdisplay">
            {instrumentFact} · {rangePreview.lowLabel}–{rangePreview.highLabel}
          </p>
        </div>

        {/* The hero is the music itself. Every control below redraws it. */}
        <section className="sj-hero">
          <div className="sj-hero__top">
            <div>
              <h2>
                <Pressable
                  type="button"
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  onClick={openMore}
                  className="sj-hero__edit"
                  aria-label={`Change key, currently ${scaleDisplayName(draftKey, draftScaleMode)}`}
                >
                  {scaleDisplayName(draftKey, draftScaleMode)}
                </Pressable>
              </h2>
              <p>
                {rangePreview.lowLabel} to {rangePreview.highLabel} · {CLEF_LABELS[draftClef]} ·{' '}
                {meterSpec.label} ·{' '}
                <Pressable
                  type="button"
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  onClick={openMore}
                  className="sj-hero__edit sj-hero__edit--inline"
                  aria-label={`Change tempo, currently ${draftTempo} BPM`}
                >
                  {draftTempo} BPM
                </Pressable>
              </p>
            </div>
            <Pressable
              type="button"
              intensity="soft"
              hapticFeedback={hapticFeedback}
              onClick={() => setPreviewSeed(Date.now())}
              className="sj-hero__shuffle"
              aria-label="Shuffle the example exercise"
            >
              <Shuffle aria-hidden />
            </Pressable>
          </div>

          <StaffPreview config={previewConfig} onEdit={openMore} />

          <p className="sj-hero__hint">Tap the clef, key or time signature to change it.</p>
        </section>

        <div className="balance-cycle-row" role="group" aria-label="Exercise settings">
          <ArcadeCycleChip
            label="Level"
            value={DIFFICULTY_LABELS[draftDifficulty]}
            step={Math.max(0, difficultyIndex)}
            stepCount={STAFF_JUMPER_DIFFICULTIES.length}
            hapticFeedback={hapticFeedback}
            onCycle={() => setDraftDifficulty(cycleNext(STAFF_JUMPER_DIFFICULTIES, draftDifficulty))}
          />
          <ArcadeCycleChip
            label="Range"
            value={RANGE_LABELS[draftRange]}
            step={Math.max(0, rangeIndex)}
            stepCount={STAFF_JUMPER_RANGES.length}
            hapticFeedback={hapticFeedback}
            onCycle={() => setDraftRange(cycleNext(STAFF_JUMPER_RANGES, draftRange))}
          />
          <ArcadeCycleChip
            label="Tempo"
            value={`${draftTempo}`}
            step={tempoPresetIndex(draftTempo)}
            stepCount={TEMPO_PRESETS.length}
            hapticFeedback={hapticFeedback}
            onCycle={() => setDraftTempo(cycleTempo(draftTempo))}
          />
        </div>
        <p className="balance-ready__hint">Tap a button to change it</p>

        <Pressable
          type="button"
          intensity="soft"
          hapticFeedback={hapticFeedback}
          className="balance-textlink"
          onClick={() => setShowOptions((open) => !open)}
          aria-expanded={showOptions}
        >
          <Settings aria-hidden /> {showOptions ? 'Hide options' : 'More options'}
        </Pressable>

        {showOptions ? (
          <>
        <OptionsPanel title="Exercise">
          <div className="sj-field">
            <p className="sj-field__label">Scale</p>
            <Options
              label="Scale"
              value={draftScaleMode}
              onChange={chooseScaleMode}
              options={[
                { id: 'major' as const, label: 'Major' },
                { id: 'minor' as const, label: 'Minor' },
              ]}
              hapticFeedback={hapticFeedback}
            />
          </div>

          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">Key</p>
            <div className="sj-keys" role="group" aria-label="Key">
              {availableKeys.map((key) => (
                <Pressable
                  key={key}
                  type="button"
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  onClick={() => setDraftKey(key)}
                  className={`sj-key ${draftKey === key ? 'sj-key--on' : ''}`}
                  aria-pressed={draftKey === key}
                >
                  {key}
                </Pressable>
              ))}
            </div>
          </div>

          <div className="sj-field">
            <p className="sj-field__label">Range</p>
            <Options
              label="Range"
              value={draftRange}
              onChange={setDraftRange}
              options={STAFF_JUMPER_RANGES.map((range) => ({ id: range, label: RANGE_LABELS[range] }))}
              hapticFeedback={hapticFeedback}
            />
          </div>

          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">
              Difficulty <span>{DIFFICULTY_TIMEOUT_SECONDS[draftDifficulty]}s per note</span>
            </p>
            <Options
              label="Difficulty"
              value={draftDifficulty}
              onChange={setDraftDifficulty}
              options={STAFF_JUMPER_DIFFICULTIES.map((level) => ({
                id: level,
                label: DIFFICULTY_LABELS[level],
              }))}
              hapticFeedback={hapticFeedback}
            />
            <p className="sj-field__note">{DIFFICULTY_DESCRIPTIONS[draftDifficulty]}</p>
          </div>
        </OptionsPanel>

        <OptionsPanel title="Instrument">
          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">
              I play
              <span>
                {selectedInstrument
                  ? `${CLEF_LABELS[selectedInstrument.clef]} clef · reads ${selectedInstrument.range.label} · starts in ${homeKeyForInstrument(selectedInstrument, draftScaleMode)}`
                  : 'Set the clef and written pitch yourself below.'}
              </span>
            </p>
            {/*
              * A plain <select>, like the onboarding picker: iOS draws it as
              * the system wheel, so a list this long scrolls the way every
              * other picker on the phone does.
              */}
            <div className="sj-select">
              <select
                className="sj-select__control"
                aria-label="Instrument"
                value={draftInstrumentId ?? ''}
                onChange={(event) => chooseInstrument(event.target.value)}
              >
                <option value="">Other / custom</option>
                {STAFF_JUMPER_INSTRUMENT_FAMILIES.map((family) => (
                  <optgroup key={family} label={family}>
                    {getStaffJumperInstrumentsByFamily(family).map((instrument) => (
                      <option key={instrument.id} value={instrument.id}>
                        {instrument.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="sj-select__chevron" aria-hidden />
            </div>
            <p className="sj-field__note">
              Picking an instrument sets the clef, the written pitch and the scale its
              method book starts on. Change either below to set your own.
            </p>
          </div>

          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">
              Written pitch <span>{writtenPitchChoice.instruments}</span>
            </p>
            <Options
              label="Written pitch"
              value={draftTransposition}
              onChange={chooseTransposition}
              options={WRITTEN_PITCH_CHOICES.map((item) => ({ id: item.id, label: item.name }))}
              hapticFeedback={hapticFeedback}
            />
          </div>

          <div className="sj-field">
            <p className="sj-field__label">Clef</p>
            <Options
              label="Clef"
              value={draftClef}
              onChange={chooseClef}
              options={STAFF_JUMPER_READING_CLEFS.map((clef) => ({ id: clef, label: CLEF_LABELS[clef] }))}
              hapticFeedback={hapticFeedback}
            />
          </div>

        </OptionsPanel>

        <OptionsPanel title="Tempo & sound">
          <div className="sj-field">
            <p className="sj-field__label">Tempo</p>
            <div className="sj-tempo" role="group" aria-label="Tempo">
              <Pressable
                type="button"
                intensity="soft"
                hapticFeedback={hapticFeedback}
                onClick={() => setDraftTempo((bpm) => Math.max(STAFF_JUMPER_TEMPO_MIN, bpm - 4))}
                className="sj-tempo__step"
                aria-label="Slower"
              >
                <Minus aria-hidden />
              </Pressable>
              <strong className="sj-tempo__value">{draftTempo}</strong>
              <Pressable
                type="button"
                intensity="soft"
                hapticFeedback={hapticFeedback}
                onClick={() => setDraftTempo((bpm) => Math.min(STAFF_JUMPER_TEMPO_MAX, bpm + 4))}
                className="sj-tempo__step"
                aria-label="Faster"
              >
                <Plus aria-hidden />
              </Pressable>
            </div>
          </div>

          <div className="sj-field sj-field--stack">
            <input
              type="range"
              className="sj-slider"
              min={STAFF_JUMPER_TEMPO_MIN}
              max={STAFF_JUMPER_TEMPO_MAX}
              step={1}
              value={draftTempo}
              onChange={(event) => setDraftTempo(Number(event.target.value))}
              aria-label="Tempo in beats per minute"
            />
          </div>

          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">
              Time signature <span>{meterSpec.description}</span>
            </p>
            <Options
              label="Time signature"
              value={draftMeter}
              onChange={setDraftMeter}
              options={STAFF_JUMPER_METERS.map((meter) => ({
                id: meter,
                label: `${METERS[meter].label}  ${METERS[meter].name}`,
              }))}
              hapticFeedback={hapticFeedback}
            />
          </div>

          <Pressable
            type="button"
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={() => setDraftMetronome((on) => !on)}
            className="sj-field sj-field--switch"
            aria-pressed={draftMetronome}
          >
            <span className="sj-field__label">
              Metronome <span>Counts you in, then keeps the pulse</span>
            </span>
            <span className={`sj-switch ${draftMetronome ? 'sj-switch--on' : ''}`} aria-hidden />
          </Pressable>

          <Pressable
            type="button"
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={() => setDraftDrone((on) => !on)}
            className="sj-field sj-field--switch"
            aria-pressed={draftDrone}
          >
            <span className="sj-field__label">
              Tonic drone <span>Holds {droneNoteLabel} underneath</span>
            </span>
            <span className={`sj-switch ${draftDrone ? 'sj-switch--on' : ''}`} aria-hidden />
          </Pressable>
        </OptionsPanel>
          </>
        ) : null}
      </BalanceArcadeShell>
    )
  }

  if (state.phase === 'paused') {
    return (
      <BalanceArcadeShell
        title="Staff Jumper"
        hapticFeedback={hapticFeedback}
        onBack={resume}
        backLabel="Resume"
        stat={{ label: 'Best', value: String(state.bestScore || '—') }}
      >
        <div className="balance-arcade__spacer" />
        <h1 className="balance-display balance-display--page">Paused</h1>
        <section className="balance-card balance-award">
          <dl className="balance-award__stats balance-award__stats--pair">
            <div><dt>Score</dt><dd>{state.score}</dd></div>
            <div><dt>Streak</dt><dd>{state.streak}</dd></div>
          </dl>
          <div className="balance-award__actions">
            <Pressable type="button" haptic="medium" hapticFeedback={hapticFeedback} onClick={resume} className="balance-cta">
              <Play aria-hidden /> Resume
            </Pressable>
            <div className="balance-award__next">
              <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={backToSetup} className="balance-cta balance-cta--blue balance-cta--small">
                Settings
              </Pressable>
              <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack} className="balance-cta balance-cta--small balance-cta--quiet">
                Exit
              </Pressable>
            </div>
          </div>
        </section>
        <div className="balance-arcade__spacer" />
      </BalanceArcadeShell>
    )
  }

  if (state.phase === 'gameover' && state.config) {
    const accuracy = computeAccuracy(state.correctCount, state.missCount)
    const scaleName = scaleDisplayName(state.config.key, state.config.scaleMode)
    const endTime = state.endedAtMs ?? Date.now()
    const durationSeconds = state.startedAtMs
      ? Math.max(0, endTime - state.startedAtMs - state.pausedDurationMs) / 1000
      : 0

    return (
      <BalanceArcadeShell
        title="Staff Jumper"
        hapticFeedback={hapticFeedback}
        onBack={onBack}
        backLabel="Back to Practice Games"
        stat={{ label: 'Best', value: String(state.bestScore || '—') }}
      >
        <div className="balance-arcade__spacer" />
        <h1 className="balance-display balance-display--page">Run Complete</h1>

        <section className="balance-card balance-award">
          <p className="balance-pill">{state.score} points</p>
          <p className="balance-card__line balance-card__line--tight">
            {scaleName} · {CLEF_LABELS[state.config.clef]} clef · {RANGE_LABELS[state.config.range]} · {DIFFICULTY_LABELS[state.config.difficulty]}
          </p>

          <dl className="balance-award__stats balance-award__stats--pair">
            <div><dt>Accuracy</dt><dd>{accuracy}%</dd></div>
            <div><dt>Best streak</dt><dd>{state.bestStreak}</dd></div>
            <div><dt>Correct</dt><dd>{state.correctCount}</dd></div>
            <div><dt>Time</dt><dd>{formatRunTime(durationSeconds)}</dd></div>
          </dl>

          <p className="balance-award__note">
            {state.missCount} {state.missCount === 1 ? 'miss' : 'misses'} · Best {state.bestScore}
          </p>

          <div className="balance-award__actions">
            <Pressable type="button" haptic="medium" hapticFeedback={hapticFeedback} onClick={restart} className="balance-cta">
              <RotateCcw aria-hidden /> Play Again
            </Pressable>
            <div className="balance-award__next">
              <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={backToSetup} className="balance-cta balance-cta--blue balance-cta--small">
                Settings
              </Pressable>
              <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack} className="balance-cta balance-cta--small balance-cta--quiet">
                Games
              </Pressable>
            </div>
          </div>
        </section>
        <div className="balance-arcade__spacer" />
      </BalanceArcadeShell>
    )
  }

  const game = (
    <StaffJumperGame
      state={state}
      readout={effectiveReadout}
      onPause={pause}
      hapticFeedback={hapticFeedback}
      onFallComplete={completeFall}
      turnRemainingMs={noteRemainingMs}
      turnDurationMs={noteTimeoutMs}
    />
  )

  if (!GAME_TEST_INPUT) return game

  return (
    <div
      className="sj-test-input"
      onPointerDown={(event) => {
        // Let the pause button and any other control keep its own press.
        if ((event.target as HTMLElement).closest('button')) return
        playTestNote()
      }}
    >
      {game}
      <span className="sj-test-input__badge" aria-hidden>tap = play note</span>
    </div>
  )
}
