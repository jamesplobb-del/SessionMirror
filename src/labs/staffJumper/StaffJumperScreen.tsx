import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { ArrowLeft } from 'lucide-react'
import './staff-jumper.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  DIFFICULTY_TIMEOUT_SECONDS,
  keysForScaleMode,
  RANGE_LABELS,
  SCALE_MODE_LABELS,
  STAFF_JUMPER_DIFFICULTIES,
  STAFF_JUMPER_RANGES,
  scaleDisplayName,
  type StaffJumperDifficulty,
  type StaffJumperKey,
  type StaffJumperRange,
  type StaffJumperScaleMode,
} from './staffJumperMusicLogic'
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
  const instrumentProfile = getTunerProfile(tunerInstrument)
  const hasPitchSignal =
    Number.isFinite(readout.frequencyHz) &&
    readout.frequencyHz > 0 &&
    Boolean(readout.noteName && readout.noteName !== '—')

  if (state.phase === 'setup') {
    return (
      <div className="sj-screen sj-screen--setup">
        <header className="sj-setup-header">
          <Pressable
            type="button"
            intensity="icon"
            hapticFeedback={hapticFeedback}
            onClick={onBack}
            className="arcade-icon-button"
            aria-label="Back to Practice Arcade"
          >
            <ArrowLeft aria-hidden />
          </Pressable>
          <div className="sj-setup-header__title">
            <h1>Staff Jumper</h1>
            <p>Sight reading</p>
          </div>
          <p className="sj-setup-best" aria-label={`Personal best ${state.bestScore}`}>
            <span>Best</span>
            <strong>{state.bestScore || '—'}</strong>
          </p>
        </header>

        <section className="sj-setup-intro">
          <h2>Play the note under the player.</h2>
          <p>The player jumps when the pitch is correct. Three misses end the run.</p>
        </section>

        <section className={`sj-mic-status ${hasPitchSignal ? 'sj-mic-status--live' : ''}`}>
          <span className="sj-mic-status__dot" aria-hidden />
          <div>
            <strong>{hasPitchSignal ? 'Microphone ready' : 'Play a note to check your microphone'}</strong>
            <small>{instrumentProfile.label} profile, concert pitch</small>
          </div>
          <p aria-live="polite">
            <strong>{hasPitchSignal ? readout.noteName : '—'}</strong>
            <small>
              {hasPitchSignal
                ? Math.round(readout.cents) === 0
                  ? 'Centered'
                  : `${Math.round(readout.cents) > 0 ? '+' : ''}${Math.round(readout.cents)}¢`
                : 'Listening'}
            </small>
          </p>
        </section>

        <section className="arcade-config-card">
          <div className="arcade-config-card__heading">
            <h2>Setup</h2>
            <span>{DIFFICULTY_TIMEOUT_SECONDS[draftDifficulty]} sec per note</span>
          </div>

          <div className="arcade-fields">
            <div>
              <p className="arcade-field-label">Difficulty</p>
              <div className="arcade-segment-grid" style={{ '--arcade-segments': 3 } as CSSProperties}>
                {STAFF_JUMPER_DIFFICULTIES.map((level) => (
                  <Pressable
                    key={level}
                    type="button"
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    onClick={() => setDraftDifficulty(level)}
                    className={`arcade-segment ${draftDifficulty === level ? 'arcade-segment--selected' : ''}`}
                    data-accent="staff"
                    aria-pressed={draftDifficulty === level}
                  >
                    {DIFFICULTY_LABELS[level]}
                  </Pressable>
                ))}
              </div>
              <p className="sj-difficulty-detail">{DIFFICULTY_DESCRIPTIONS[draftDifficulty]}</p>
            </div>

            <div>
              <p className="arcade-field-label">Scale</p>
              <div className="arcade-segment-grid" style={{ '--arcade-segments': 2 } as CSSProperties}>
                {(['major', 'minor'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    type="button"
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    onClick={() => setDraftScaleMode(mode)}
                    className={`arcade-segment ${draftScaleMode === mode ? 'arcade-segment--selected' : ''}`}
                    data-accent="staff"
                    aria-pressed={draftScaleMode === mode}
                  >
                    {SCALE_MODE_LABELS[mode]}
                  </Pressable>
                ))}
              </div>
            </div>

            <div>
              <p className="arcade-field-label">Key</p>
              <div className="arcade-key-grid">
                {availableKeys.map((key) => (
                  <Pressable
                    key={key}
                    type="button"
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    onClick={() => setDraftKey(key)}
                    className={`arcade-key-button ${draftKey === key ? 'arcade-key-button--selected' : ''}`}
                    data-accent="staff"
                    aria-pressed={draftKey === key}
                  >
                    {key}
                  </Pressable>
                ))}
              </div>
            </div>

            <div>
              <p className="arcade-field-label">Range</p>
              <div className="arcade-segment-grid" style={{ '--arcade-segments': 2 } as CSSProperties}>
                {STAFF_JUMPER_RANGES.map((range) => (
                  <Pressable
                    key={range}
                    type="button"
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    onClick={() => setDraftRange(range)}
                    className={`arcade-segment ${draftRange === range ? 'arcade-segment--selected' : ''}`}
                    data-accent="staff"
                    aria-pressed={draftRange === range}
                  >
                    {RANGE_LABELS[range]}
                  </Pressable>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="arcade-setup-footer">
          <Pressable
            type="button"
            haptic="medium"
            hapticFeedback={hapticFeedback}
            onClick={() =>
              start({
                key: draftKey,
                scaleMode: draftScaleMode,
                range: draftRange,
                difficulty: draftDifficulty,
                tunerInstrument,
              })
            }
            className="arcade-primary-button"
          >
            Start {scaleDisplayName(draftKey, draftScaleMode)}
          </Pressable>
          <p className="arcade-setup-footer__detail">
            3 lives <span aria-hidden>·</span> {DIFFICULTY_TIMEOUT_SECONDS[draftDifficulty]} seconds per note
          </p>
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
            {scaleName} · {RANGE_LABELS[state.config.range]} · {DIFFICULTY_LABELS[state.config.difficulty]}
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
