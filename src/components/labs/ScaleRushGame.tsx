import type { RefObject } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  computeAccuracy,
  getDetectedWrittenPitchClass,
  getTargetNoteAtStep,
  pitchClassLabel,
  pitchClassesMatch,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushState } from '../../labs/scaleRush/scaleRushTypes'
import Pressable from '../ui/Pressable'
import ScaleRushCourse from './ScaleRushCourse'

interface ScaleRushGameProps {
  state: ScaleRushState
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  onPause: () => void
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

export default function ScaleRushGame({ state, readout, onPause }: ScaleRushGameProps) {
  const config = state.config!
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedPc = getDetectedWrittenPitchClass(readout, config)
  const detectedNote =
    detectedPc != null ? pitchClassLabel(detectedPc, config.key) : '—'
  const detectedOctave =
    detectedPc != null && Number.isFinite(readout.midi)
      ? Math.floor(readout.midi / 12) - 1
      : null
  const isMatch =
    detectedPc != null && pitchClassesMatch(detectedPc, target.pitchClass)
  const accuracy = computeAccuracy(state.correctCount, state.missCount)

  return (
    <div className="scale-rush-screen scale-rush-screen--playing">
      <div className="sr-playfield">
        <ScaleRushCourse
          config={config}
          sequenceStep={state.sequenceStep}
          advanceToken={state.advanceToken}
          missToken={state.missToken}
          feedback={state.feedback}
          feedbackToken={state.feedbackToken}
        />

        <div className="sr-hud-overlay">
          <div className="sr-hud-top">
            <Hearts count={state.hearts} />
            <Pressable
              type="button"
              intensity="soft"
              onClick={onPause}
              className="sr-hud-pause"
              aria-label="Pause"
            >
              <Pause className="h-4 w-4" strokeWidth={3} />
            </Pressable>
          </div>

          <div className="sr-hud-side sr-hud-side--left">
            <div className="sr-hud-panel">
              <p className="sr-hud-panel__label">Score</p>
              <p className="sr-hud-panel__value sr-hud-panel__value--score tabular-nums">
                {state.score}
              </p>
            </div>
            <div className="sr-hud-panel">
              <p className="sr-hud-panel__label">Streak</p>
              <p className="sr-hud-panel__value sr-hud-panel__value--streak tabular-nums">
                {state.streak}
              </p>
            </div>
          </div>

          <div className="sr-hud-side sr-hud-side--right">
            <div className="sr-hud-panel sr-hud-panel--target">
              <p className="sr-hud-panel__label">Target Note</p>
              <p className="sr-hud-panel__value sr-hud-panel__value--target">
                {target.noteLabel}
              </p>
            </div>
            <div className="sr-hud-panel sr-hud-panel--detected">
              <p className="sr-hud-panel__label">Detected</p>
              <p className="sr-hud-panel__value sr-hud-panel__value--detected">
                <span className={isMatch ? 'sr-hud-detected--match' : ''}>{detectedNote}</span>
                {detectedOctave != null && (
                  <span className="sr-hud-detected-octave">{detectedOctave}</span>
                )}
              </p>
            </div>
            <div className="sr-hud-panel">
              <p className="sr-hud-panel__label">Accuracy</p>
              <p className="sr-hud-panel__value sr-hud-panel__value--accuracy tabular-nums">
                {accuracy}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
