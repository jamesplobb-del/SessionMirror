import type { RefObject } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  computeAccuracy,
  getTargetNoteAtStep,
  pitchClassLabel,
  readoutToPitchClass,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushState } from '../../labs/scaleRush/types'
import Pressable from '../ui/Pressable'
import ScaleRushCourse from './ScaleRushCourse'
import ScaleRushLiveTuner from './ScaleRushLiveTuner'

interface ScaleRushGameProps {
  state: ScaleRushState
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  onPause: () => void
}

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`scale-rush-heart ${index < count ? '' : 'scale-rush-heart--empty'}`}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </span>
  )
}

export default function ScaleRushGame({ state, readout, canvasRef, onPause }: ScaleRushGameProps) {
  const config = state.config!
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedPc = readoutToPitchClass(readout)
  const detectedLabel =
    detectedPc != null ? pitchClassLabel(detectedPc, config.key) : '—'
  const accuracy = computeAccuracy(state.correctCount, state.missCount)

  return (
    <div className="scale-rush-screen scale-rush-screen--playing">
      <header className="scale-rush-play-header flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Hearts count={state.hearts} />
          <span className="text-stone-500">
            {config.key} {config.scale === 'major' ? 'Major' : config.scale}
          </span>
        </div>
        <Pressable type="button" intensity="soft" onClick={onPause} className="text-stone-500">
          Pause
        </Pressable>
      </header>

      <div className="sr-hud-stats">
        <span>
          Score <strong className="tabular-nums">{state.score}</strong>
        </span>
        <span>
          Streak <strong className="tabular-nums">×{state.streak}</strong>
        </span>
        <span>
          Acc <strong className="tabular-nums">{accuracy}%</strong>
        </span>
      </div>

      <div className="sr-target-hud">
        <p className="sr-target-hud__eyebrow">Play this note</p>
        <p className="sr-target-hud__note">{target.noteLabel}</p>
        <p className="sr-target-hud__detected">
          Heard: <strong>{detectedLabel}</strong>
        </p>
      </div>

      <ScaleRushCourse
        config={config}
        sequenceStep={state.sequenceStep}
        advanceToken={state.advanceToken}
        missToken={state.missToken}
      />

      <div className="mt-2 min-h-0 shrink-0">
        <ScaleRushLiveTuner readout={readout} canvasRef={canvasRef} keyRoot={config.key} />
      </div>
    </div>
  )
}
