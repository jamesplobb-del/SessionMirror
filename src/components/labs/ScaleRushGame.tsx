import type { CSSProperties, RefObject } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  computeAccuracy,
  getDetectedWrittenMidi,
  getDetectedWrittenPitchClass,
  getTargetNoteAtStep,
  getTranspositionLabel,
  pitchClassLabel,
  pitchClassesMatch,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushState } from '../../labs/scaleRush/scaleRushTypes'
import Pressable from '../ui/Pressable'
import ScaleRushPhaserView from './ScaleRushPhaserView'

interface ScaleRushGameProps {
  state: ScaleRushState
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  onPause: () => void
  hapticFeedback: boolean
  turnRemainingMs: number
  turnDurationMs: number
}

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="sr-hud-hearts" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`sr-hud-heart ${index < count ? 'sr-hud-heart--full' : 'sr-hud-heart--empty'}`}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </div>
  )
}

export default function ScaleRushGame({
  state,
  readout,
  onPause,
  hapticFeedback,
  turnRemainingMs,
  turnDurationMs,
}: ScaleRushGameProps) {
  const config = state.config!
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedWrittenMidi = getDetectedWrittenMidi(readout, config)
  const detectedPc = getDetectedWrittenPitchClass(readout, config)
  const detectedNote = detectedPc != null ? pitchClassLabel(detectedPc, config.key) : '—'
  const detectedOctave =
    detectedWrittenMidi != null ? Math.floor(detectedWrittenMidi / 12) - 1 : null
  const isMatch = detectedPc != null && pitchClassesMatch(detectedPc, target.pitchClass)
  const accuracy = computeAccuracy(state.correctCount, state.missCount)
  const cents = Math.round(readout.cents)
  const hasSignal = detectedPc != null
  const precisionReady = !config.pitchAccuracyStrict || Math.abs(cents) <= 15
  const matchLabel = !hasSignal
    ? 'Play the target note'
    : isMatch && precisionReady
      ? 'Hold it steady…'
      : isMatch
        ? `${cents > 0 ? '+' : ''}${cents}¢ · center the pitch`
        : 'Listen, then try the target'
  const feedbackAnnouncement =
    state.feedback === 'perfect'
      ? 'Perfect.'
      : state.feedback === 'good'
        ? 'Good.'
        : state.feedback === 'timeout'
          ? `Time is up. ${state.hearts} hearts left.`
          : state.feedback === 'wrong'
            ? `Wrong note. ${state.hearts} hearts left.`
            : ''
  const turnFraction = Math.max(0, Math.min(1, turnRemainingMs / Math.max(1, turnDurationMs)))

  return (
    <div className="scale-rush-screen scale-rush-screen--playing">
      <div className="sr-playfield">
        <ScaleRushPhaserView
          config={config}
          sequenceStep={state.sequenceStep}
          advanceToken={state.advanceToken}
          missToken={state.missToken}
          feedback={state.feedback}
          feedbackToken={state.feedbackToken}
        />

        <div className="sr-hud-overlay">
          <div className="sr-hud-top">
            <div className="sr-hud-statusbar">
              <Hearts count={state.hearts} />
              <span className="sr-hud-statusbar__rule" aria-hidden />
              <span className="sr-hud-mini-stat">
                <small>Score</small>
                <strong>{state.score}</strong>
              </span>
              <span className="sr-hud-mini-stat">
                <small>Accuracy</small>
                <strong>{accuracy}%</strong>
              </span>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              hapticFeedback={hapticFeedback}
              onClick={onPause}
              className="sr-hud-pause"
              aria-label="Pause Scale Rush"
            >
              <Pause aria-hidden />
            </Pressable>
          </div>

          {state.streak >= 3 && (
            <div className="sr-combo-chip">
              {state.streak} streak
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {feedbackAnnouncement} Target {target.noteLabel}.
          </p>

          <div className="sr-target-dock">
            <div className="sr-target-dock__meta">
              <span>{getTranspositionLabel(config.transposition).split(' — ')[0]}</span>
              <span>{config.pitchAccuracyStrict ? 'Precision ±15¢' : 'Note match'}</span>
            </div>
            <div className="sr-target-dock__notes">
              <div className="sr-target-note">
                <small>Target</small>
                <strong>{target.noteLabel}</strong>
              </div>
              <div className={`sr-detected-note ${isMatch ? 'sr-detected-note--match' : ''}`}>
                <small>Heard</small>
                <strong>
                  {detectedNote}
                  {detectedOctave != null && <sup>{detectedOctave}</sup>}
                </strong>
              </div>
            </div>
            <p className={`sr-target-dock__hint ${isMatch && precisionReady ? 'sr-target-dock__hint--match' : ''}`}>
              {matchLabel}
            </p>
            <div
              className="sr-turn-timer"
              key={`sr-turn-${state.sequenceStep}-${state.missToken}`}
              style={
                {
                  '--sr-turn-remaining': `${turnRemainingMs}ms`,
                  '--sr-turn-fraction': turnFraction,
                } as CSSProperties
              }
              aria-hidden
            >
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
