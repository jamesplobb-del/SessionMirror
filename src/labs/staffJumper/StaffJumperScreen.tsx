import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, Mic, Minus, Play, Plus } from 'lucide-react'
import './staff-jumper.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  DIFFICULTY_TIMEOUT_SECONDS,
  getConcertTonicPitchClass,
  getScaleRangePreview,
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
import { type ScaleRushTransposition } from '../scaleRush/scaleRushMusicLogic'
import {
  resolveRhythm,
  RHYTHM_DESCRIPTIONS,
  RHYTHM_LABELS,
  STAFF_JUMPER_RHYTHMS,
  STAFF_JUMPER_TEMPO_DEFAULT,
  STAFF_JUMPER_TEMPO_MAX,
  STAFF_JUMPER_TEMPO_MIN,
  type StaffJumperRhythm,
} from './staffJumperRhythm'
import {
  loadScaleRushPlayerModel,
  saveScaleRushPlayerModel,
  SCALE_RUSH_PLAYER_MODELS,
} from '../scaleRush/scaleRushPlayerModels'
import type { ScaleRushPlayerModelId } from '../scaleRush/scaleRushTypes'
import {
  CLEF_LABELS,
  STAFF_JUMPER_CLEFS,
  type StaffJumperClef,
} from './staffNotationMap'
import { useStaffJumperGame } from './useStaffJumperGame'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../../components/ui/Pressable'
import StaffJumperGame from './StaffJumperGame'

interface StaffJumperScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  hapticFeedback: boolean
  onRequestMicStream: () => void
  onBack: () => void
}

/**
 * The transposition picker reads as an instrument choice, because that is the
 * decision the player is actually making. A bare "Written pitch" dropdown of
 * key names made everyone guess.
 */
const WRITTEN_PITCH_CHOICES: {
  id: ScaleRushTransposition
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
  const [draftScaleMode, setDraftScaleMode] = useState<StaffJumperScaleMode>('major')
  const [draftKey, setDraftKey] = useState<StaffJumperKey>('C')
  const [draftRange, setDraftRange] = useState<StaffJumperRange>('1-octave')
  const [draftDifficulty, setDraftDifficulty] = useState<StaffJumperDifficulty>('easy')
  const [draftClef, setDraftClef] = useState<StaffJumperClef>('treble')
  const [draftTransposition, setDraftTransposition] = useState<ScaleRushTransposition>('concert')
  const [draftPlayerModel, setDraftPlayerModel] = useState<ScaleRushPlayerModelId>(
    loadScaleRushPlayerModel,
  )
  const [draftRhythm, setDraftRhythm] = useState<StaffJumperRhythm>('auto')
  const [draftTempo, setDraftTempo] = useState(STAFF_JUMPER_TEMPO_DEFAULT)
  const [draftMetronome, setDraftMetronome] = useState(true)
  const [draftDrone, setDraftDrone] = useState(false)

  const availableKeys = keysForScaleMode(draftScaleMode)

  useEffect(() => {
    if (!availableKeys.includes(draftKey)) {
      setDraftKey(availableKeys[0]!)
    }
  }, [availableKeys, draftKey])

  useEffect(() => {
    onRequestMicStream()
  }, [onRequestMicStream, streamGeneration])

  const pitchEnabled = true
  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `staff-jumper-${streamGeneration}`,
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
  } = useStaffJumperGame(readout, pitchEnabled, hapticFeedback)
  const draftConfig = useMemo(
    () => ({
      key: draftKey,
      scaleMode: draftScaleMode,
      range: draftRange,
      difficulty: draftDifficulty,
      clef: draftClef,
      tunerInstrument,
      transposition: draftTransposition,
      playerModel: draftPlayerModel,
      rhythm: draftRhythm,
      tempoBpm: draftTempo,
      metronome: draftMetronome,
      drone: draftDrone,
    }),
    [
      draftClef,
      draftDifficulty,
      draftDrone,
      draftKey,
      draftMetronome,
      draftPlayerModel,
      draftRange,
      draftRhythm,
      draftScaleMode,
      draftTempo,
      draftTransposition,
      tunerInstrument,
    ],
  )
  const rangePreview = useMemo(() => getScaleRangePreview(draftConfig), [draftConfig])
  const rhythmHint =
    draftRhythm === 'auto'
      ? `${RHYTHM_LABELS[resolveRhythm(draftRhythm, draftDifficulty)]} — from ${DIFFICULTY_LABELS[draftDifficulty]}`
      : RHYTHM_DESCRIPTIONS[draftRhythm]
  const droneNoteLabel = pitchClassLabel(getConcertTonicPitchClass(draftConfig), draftKey)

  const instrumentProfile = getTunerProfile(tunerInstrument)
  const hasPitchSignal =
    Number.isFinite(readout.frequencyHz) &&
    readout.frequencyHz > 0 &&
    Boolean(readout.noteName && readout.noteName !== '—')

  if (state.phase === 'setup') {
    const selectedInstrument =
      WRITTEN_PITCH_CHOICES.find((item) => item.id === draftTransposition) ??
      WRITTEN_PITCH_CHOICES[0]!

    /** Inline text options — no pills, no trays; the choice is just the word. */
    const Options = <T extends string>({
      value,
      options,
      onChange,
      label,
    }: {
      value: T
      options: { id: T; label: string }[]
      onChange: (next: T) => void
      label: string
    }) => (
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

    return (
      <div className="sj-screen sj-screen--setup">
        <header className="sj-head">
          <Pressable
            type="button"
            intensity="icon"
            hapticFeedback={hapticFeedback}
            onClick={onBack}
            className="sj-head__back"
            aria-label="Back to Practice Games"
          >
            <ArrowLeft aria-hidden />
          </Pressable>
          <div className="sj-head__title">
            <h1>Staff Jumper</h1>
            <p>Sight reading</p>
          </div>
          <p className="sj-head__best" aria-label={`Personal best ${state.bestScore}`}>
            <small>Best</small>
            <strong>{state.bestScore || '—'}</strong>
          </p>
        </header>

        {/* The brief: exactly what this run will put in front of you. */}
        <section className="sj-brief">
          <p className="sj-brief__kicker">You&rsquo;ll be reading</p>
          <h2 className="sj-brief__scale">{scaleDisplayName(draftKey, draftScaleMode)}</h2>
          <p className="sj-brief__range">
            <strong>{rangePreview.lowLabel}</strong>
            <span aria-hidden>to</span>
            <strong>{rangePreview.highLabel}</strong>
          </p>
          <p className="sj-brief__meta">
            {CLEF_LABELS[draftClef]} clef · {rangePreview.signatureLabel} · {rangePreview.noteCount}{' '}
            notes per lap · {draftTempo} BPM
          </p>

          <div className={`sj-mic ${hasPitchSignal ? 'sj-mic--live' : ''}`}>
            <Mic aria-hidden />
            <span>
              {hasPitchSignal
                ? `Hearing ${readout.noteName}`
                : 'Play a note to check your mic'}
            </span>
            <small>{instrumentProfile.label}</small>
          </div>
        </section>

        <section className="sj-sheet">
          <div className="sj-field sj-field--stack">
            <p className="sj-field__label">
              Instrument <span>{selectedInstrument.instruments}</span>
            </p>
            <Options
              label="Instrument"
              value={draftTransposition}
              onChange={setDraftTransposition}
              options={WRITTEN_PITCH_CHOICES.map((item) => ({ id: item.id, label: item.name }))}
            />
          </div>

          <div className="sj-field">
            <p className="sj-field__label">Clef</p>
            <Options
              label="Clef"
              value={draftClef}
              onChange={setDraftClef}
              options={STAFF_JUMPER_CLEFS.map((clef) => ({ id: clef, label: CLEF_LABELS[clef] }))}
            />
          </div>

          <div className="sj-field">
            <p className="sj-field__label">Scale</p>
            <Options
              label="Scale"
              value={draftScaleMode}
              onChange={setDraftScaleMode}
              options={[
                { id: 'major' as const, label: 'Major' },
                { id: 'minor' as const, label: 'Minor' },
              ]}
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
            />
          </div>
        </section>

        <section className="sj-sheet">
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
              Rhythm <span>{rhythmHint}</span>
            </p>
            <Options
              label="Rhythm"
              value={draftRhythm}
              onChange={setDraftRhythm}
              options={STAFF_JUMPER_RHYTHMS.map((rhythm) => ({
                id: rhythm,
                label: RHYTHM_LABELS[rhythm],
              }))}
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
              Metronome <span>One bar of count-in, then the pulse</span>
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
        </section>

        <section className="sj-sheet">
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
            />
            <p className="sj-field__note">{DIFFICULTY_DESCRIPTIONS[draftDifficulty]}</p>
          </div>

          <div className="sj-field sj-field--stack" role="group" aria-label="Character">
            <p className="sj-field__label">Character</p>
            <div className="sj-characters__grid">
              {SCALE_RUSH_PLAYER_MODELS.map((model) => (
                <Pressable
                  key={model.id}
                  type="button"
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  onClick={() => {
                    setDraftPlayerModel(model.id)
                    saveScaleRushPlayerModel(model.id)
                  }}
                  className={`sj-character ${draftPlayerModel === model.id ? 'sj-character--on' : ''}`}
                  aria-pressed={draftPlayerModel === model.id}
                  aria-label={`Choose ${model.name}`}
                >
                  <img src={model.asset} alt="" draggable={false} />
                </Pressable>
              ))}
            </div>
          </div>
        </section>

        <div className="sj-start">
          <Pressable
            type="button"
            haptic="medium"
            hapticFeedback={hapticFeedback}
            onClick={() => start(draftConfig)}
            className="sj-start__button"
          >
            <Play aria-hidden />
            Start
          </Pressable>
          <p>3 lives · every run is a new exercise</p>
        </div>
      </div>
    )
  }


  if (state.phase === 'paused') {
    return (
      <div className="sj-state-screen">
        <section className="sj-state-card">
          <p className="sj-state-label">Paused</p>
          <h1>Staff Jumper</h1>
          <dl className="sj-state-stats sj-state-stats--compact">
            <div><dt>Score</dt><dd>{state.score}</dd></div>
            <div><dt>Streak</dt><dd>{state.streak}</dd></div>
          </dl>
          <div className="sj-state-actions">
            <Pressable type="button" haptic="medium" hapticFeedback={hapticFeedback} onClick={resume} className="arcade-primary-button">
              Resume
            </Pressable>
            <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={backToSetup} className="arcade-secondary-button">
              Change settings
            </Pressable>
            <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack} className="arcade-text-button">
              Exit game
            </Pressable>
          </div>
        </section>
      </div>
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
      <div className="sj-state-screen">
        <section className="sj-state-card">
          <p className="sj-state-label">Run complete</p>
          <h1>{state.score}</h1>
          <p className="sj-state-run-label">
            {scaleName} · {CLEF_LABELS[state.config.clef]} clef · {RANGE_LABELS[state.config.range]} · {DIFFICULTY_LABELS[state.config.difficulty]}
          </p>
          <dl className="sj-state-stats">
            <div><dt>Accuracy</dt><dd>{accuracy}%</dd></div>
            <div><dt>Best streak</dt><dd>{state.bestStreak}</dd></div>
            <div><dt>Correct notes</dt><dd>{state.correctCount}</dd></div>
            <div><dt>Time</dt><dd>{formatRunTime(durationSeconds)}</dd></div>
          </dl>
          <p className="sj-state-summary">
            {state.missCount} {state.missCount === 1 ? 'miss' : 'misses'} · Best {state.bestScore}
          </p>
          <div className="sj-state-actions">
            <Pressable type="button" haptic="medium" hapticFeedback={hapticFeedback} onClick={restart} className="arcade-primary-button">
              Play again
            </Pressable>
            <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={backToSetup} className="arcade-secondary-button">
              Change settings
            </Pressable>
            <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack} className="arcade-text-button">
              Back to Practice Arcade
            </Pressable>
          </div>
        </section>
      </div>
    )
  }

  return (
    <StaffJumperGame
      state={state}
      readout={readout}
      onPause={pause}
      hapticFeedback={hapticFeedback}
      onFallComplete={completeFall}
      turnRemainingMs={noteRemainingMs}
      turnDurationMs={noteTimeoutMs}
    />
  )
}
