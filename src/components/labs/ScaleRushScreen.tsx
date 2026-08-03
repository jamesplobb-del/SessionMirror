import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import '../../styles/scale-rush.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  keysForScaleMode,
  RANGE_LABELS,
  SCALE_MODE_LABELS,
  SCALE_RUSH_RANGES,
  SCALE_RUSH_TRANSPOSITIONS,
  scaleDisplayName,
  type ScaleRushKey,
  type ScaleRushRange,
  type ScaleRushScaleMode,
  type ScaleRushTransposition,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import { useScaleRushGame } from '../../labs/scaleRush/useScaleRushGame'
import {
  loadScaleRushPlayerModel,
  saveScaleRushPlayerModel,
  SCALE_RUSH_PLAYER_MODELS,
} from '../../labs/scaleRush/scaleRushPlayerModels'
import type { ScaleRushPlayerModelId } from '../../labs/scaleRush/scaleRushTypes'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import IOSSwitch from '../ui/IOSSwitch'
import Pressable from '../ui/Pressable'
import {
  ArcadeGameHeader,
  ArcadeMicCheck,
  ArcadePauseScreen,
  ArcadeResults,
} from './ArcadeChrome'
import ScaleRushGame from './ScaleRushGame'

interface ScaleRushScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  hapticFeedback: boolean
  onRequestMicStream: () => void
  onBack: () => void
}

export default function ScaleRushScreen({
  streamRef,
  streamGeneration,
  tunerInstrument,
  hapticFeedback,
  onRequestMicStream,
  onBack,
}: ScaleRushScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [draftScaleMode, setDraftScaleMode] = useState<ScaleRushScaleMode>('major')
  const [draftKey, setDraftKey] = useState<ScaleRushKey>('C')
  const [draftRange, setDraftRange] = useState<ScaleRushRange>('1-octave')
  const [draftEndless, setDraftEndless] = useState(false)
  const [draftTransposition, setDraftTransposition] = useState<ScaleRushTransposition>('concert')
  const [draftPlayerModel, setDraftPlayerModel] = useState<ScaleRushPlayerModelId>(
    loadScaleRushPlayerModel,
  )
  const [pitchAccuracyStrict, setPitchAccuracyStrict] = useState(false)

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
    `scale-rush-${streamGeneration}`,
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
    pause,
    resume,
    noteRemainingMs,
    noteTimeoutMs,
  } = useScaleRushGame(readout, pitchEnabled, hapticFeedback)
  const instrumentProfile = getTunerProfile(tunerInstrument)

  if (state.phase === 'setup') {
    return (
      <div className="scale-rush-screen scale-rush-screen--setup">
        <ArcadeGameHeader
          accent="rush"
          title="Scale Rush"
          subtitle="Play the next note"
          bestScore={state.bestScore}
          icon={null}
          hapticFeedback={hapticFeedback}
          onBack={onBack}
        />

        <p className="sr-setup-summary">
          Play each target note to move. Three misses ends the run.
        </p>

        <ArcadeMicCheck
          readout={readout}
          profileLabel={instrumentProfile.label}
          detail={`${instrumentProfile.label} microphone profile`}
        />

        <section className="arcade-config-card">
          <div className="arcade-config-card__heading">
            <h2>Game settings</h2>
          </div>

          <div className="arcade-fields">
            <div>
              <label htmlFor="scale-rush-transposition" className="arcade-field-label">
                Written pitch
              </label>
              <select
                id="scale-rush-transposition"
                value={draftTransposition}
                onChange={(event) =>
                  setDraftTransposition(event.target.value as ScaleRushTransposition)
                }
                className="arcade-select"
              >
                {SCALE_RUSH_TRANSPOSITIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="sr-player-picker">
              <legend className="arcade-field-label">Player</legend>
              <div className="sr-player-picker__grid">
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
                    className={`sr-player-option ${draftPlayerModel === model.id ? 'sr-player-option--selected' : ''}`}
                    aria-pressed={draftPlayerModel === model.id}
                    aria-label={`Choose ${model.name}`}
                  >
                    <span className="sr-player-option__preview" aria-hidden>
                      <img src={model.asset} alt="" draggable={false} />
                    </span>
                    <span>{model.name}</span>
                  </Pressable>
                ))}
              </div>
            </fieldset>

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
                    data-accent="rush"
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
                    aria-pressed={draftKey === key}
                  >
                    {key}
                  </Pressable>
                ))}
              </div>
            </div>

            {!draftEndless && (
              <div>
                <p className="arcade-field-label">Range</p>
                <div className="arcade-segment-grid" style={{ '--arcade-segments': 2 } as CSSProperties}>
                  {SCALE_RUSH_RANGES.map((range) => (
                    <Pressable
                      key={range}
                      type="button"
                      intensity="soft"
                      hapticFeedback={hapticFeedback}
                      onClick={() => setDraftRange(range)}
                      className={`arcade-segment ${draftRange === range ? 'arcade-segment--selected' : ''}`}
                      data-accent="rush"
                      aria-pressed={draftRange === range}
                    >
                      {RANGE_LABELS[range]}
                    </Pressable>
                  ))}
                </div>
              </div>
            )}

            <div className="arcade-option-row">
              <div>
                <strong>Repeat the scale</strong>
              </div>
              <IOSSwitch
                checked={draftEndless}
                onChange={setDraftEndless}
                ariaLabel="Enable scale-only mode"
                hapticFeedback={hapticFeedback}
              />
            </div>

            <div className="arcade-option-row">
              <div>
                <strong>Require pitch within ±15¢</strong>
              </div>
              <IOSSwitch
                checked={pitchAccuracyStrict}
                onChange={setPitchAccuracyStrict}
                ariaLabel="Require pitch accuracy within 15 cents"
                hapticFeedback={hapticFeedback}
              />
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
                endless: draftEndless,
                tunerInstrument,
                transposition: draftTransposition,
                playerModel: draftPlayerModel,
                pitchAccuracyStrict,
              })
            }
            className="arcade-primary-button"
          >
            Start {scaleDisplayName(draftKey, draftScaleMode)}
          </Pressable>
          <p className="arcade-setup-footer__detail">3 lives · 12 seconds per note</p>
        </div>
      </div>
    )
  }

  if (state.phase === 'paused') {
    return (
      <ArcadePauseScreen
        accent="rush"
        title="Scale Rush"
        score={state.score}
        streak={state.streak}
        icon={null}
        hapticFeedback={hapticFeedback}
        onResume={resume}
        onSetup={backToSetup}
        onLabs={onBack}
      />
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
      <ArcadeResults
        accent="rush"
        gameTitle="Scale Rush"
        runLabel={`${scaleName} · ${state.config.endless ? 'Scale only' : RANGE_LABELS[state.config.range]}`}
        score={state.score}
        bestScore={state.bestScore}
        bestStreak={state.bestStreak}
        accuracy={accuracy}
        correctCount={state.correctCount}
        missCount={state.missCount}
        durationSeconds={durationSeconds}
        hapticFeedback={hapticFeedback}
        onReplay={restart}
        onSetup={backToSetup}
        onLabs={onBack}
      />
    )
  }

  return (
    <ScaleRushGame
      state={state}
      readout={readout}
      canvasRef={canvasRef}
      onPause={pause}
      hapticFeedback={hapticFeedback}
      turnRemainingMs={noteRemainingMs}
      turnDurationMs={noteTimeoutMs}
    />
  )
}
