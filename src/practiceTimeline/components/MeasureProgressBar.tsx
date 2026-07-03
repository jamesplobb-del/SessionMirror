import type { PointerEvent } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

interface MeasureProgressBarProps {
  measure: number
  totalMeasures: number
  onSeekMeasure?: (measure: number) => void
}

export default function MeasureProgressBar({
  measure,
  totalMeasures,
  onSeekMeasure,
}: MeasureProgressBarProps) {
  if (totalMeasures <= 0) return null

  const activeMeasure = Math.max(1, Math.min(measure || 1, totalMeasures))
  const fillPercent = (activeMeasure / totalMeasures) * 100
  const seekable = Boolean(onSeekMeasure)

  const handleSeek = (event: PointerEvent<HTMLDivElement>) => {
    if (!onSeekMeasure) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
    const nextMeasure = Math.max(
      1,
      Math.min(totalMeasures, Math.floor(Math.max(0, Math.min(0.9999, ratio)) * totalMeasures) + 1),
    )
    triggerLightHaptic()
    onSeekMeasure(nextMeasure)
  }

  return (
    <div
      className="practice-timeline-session__measure-progress"
      role={seekable ? 'slider' : 'progressbar'}
      aria-valuenow={activeMeasure}
      aria-valuemin={1}
      aria-valuemax={totalMeasures}
      aria-label={`Measure ${activeMeasure} of ${totalMeasures}`}
    >
      <div
        className={`practice-timeline-session__measure-track ${seekable ? 'practice-timeline-session__measure-track--seekable' : ''}`}
        onPointerUp={handleSeek}
      >
        <div
          className="practice-timeline-session__measure-fill"
          style={{ width: `${fillPercent}%` }}
        />
        {Array.from({ length: totalMeasures }, (_, index) => {
          const measureNumber = index + 1
          const position = ((index + 0.5) / totalMeasures) * 100
          const isActive = measureNumber === activeMeasure
          const isPast = measureNumber < activeMeasure
          return (
            <span
              key={measureNumber}
              className={[
                'practice-timeline-session__measure-tick',
                isActive ? 'practice-timeline-session__measure-tick--active' : '',
                isPast ? 'practice-timeline-session__measure-tick--past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${position}%` }}
            />
          )
        })}
      </div>
      <div className="practice-timeline-session__measure-labels">
        <span>1</span>
        <span>{totalMeasures}</span>
      </div>
    </div>
  )
}
