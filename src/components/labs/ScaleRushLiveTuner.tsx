import type { RefObject } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { formatDisplayCents, formatFrequencyHz } from '../../utils/pitchUtils'
import { pitchClassLabel, readoutToPitchClass } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushKey } from '../../labs/scaleRush/scaleRushMusicLogic'

interface ScaleRushLiveTunerProps {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  keyRoot: ScaleRushKey
}

/** Compact live pitch readout for Scale Rush — uses the same readout as gameplay (no second mic engine). */
export default function ScaleRushLiveTuner({ readout, canvasRef, keyRoot }: ScaleRushLiveTunerProps) {
  const active = readoutToPitchClass(readout) != null
  const detectedLabel = active
    ? pitchClassLabel(readoutToPitchClass(readout)!, keyRoot)
    : '—'

  return (
    <div className="scale-rush-tuner-panel">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        Live tuner
      </p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-stone-900">{detectedLabel}</p>
          <p className="text-xs text-stone-500">
            {active ? formatDisplayCents(readout.cents) : '—'} ·{' '}
            {active ? formatFrequencyHz(readout.frequencyHz) : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-stone-400">Raw: {readout.noteName || '—'}</p>
        </div>
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-stone-100">
          <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
        </div>
      </div>
    </div>
  )
}
