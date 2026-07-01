import type { RefObject } from 'react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { formatDisplayCents, formatFrequencyHz } from '../../utils/pitchUtils'
import {
  getDetectedWrittenPitchClass,
  pitchClassLabel,
  readoutToConcertPitchClass,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushConfig } from '../../labs/scaleRush/types'

interface ScaleRushLiveTunerProps {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  config: ScaleRushConfig
}

export default function ScaleRushLiveTuner({ readout, canvasRef, config }: ScaleRushLiveTunerProps) {
  const writtenPc = getDetectedWrittenPitchClass(readout, config)
  const detectedLabel = writtenPc != null ? pitchClassLabel(writtenPc, config.key) : '—'
  const concertPc = readoutToConcertPitchClass(readout)
  const concertLabel = concertPc != null ? pitchClassLabel(concertPc, 'C') : '—'

  return (
    <div className="scale-rush-tuner-panel">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
        Live tuner
        {config.pitchAccuracyStrict ? ' · ±15¢' : ' · note match'}
      </p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">{detectedLabel}</p>
          <p className="text-xs opacity-80">
            {writtenPc != null ? formatDisplayCents(readout.cents) : '—'} ·{' '}
            {writtenPc != null ? formatFrequencyHz(readout.frequencyHz) : '—'}
          </p>
          <p className="mt-0.5 text-[10px] opacity-60">
            Concert: {concertLabel} · Raw: {readout.noteName || '—'}
          </p>
        </div>
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-stone-800/40">
          <canvas ref={canvasRef} className="h-full w-full" aria-hidden />
        </div>
      </div>
    </div>
  )
}
