interface MeasureProgressBarProps {
  measure: number
  totalMeasures: number
}

export default function MeasureProgressBar({ measure, totalMeasures }: MeasureProgressBarProps) {
  if (totalMeasures <= 0) return null

  const activeMeasure = Math.max(1, Math.min(measure || 1, totalMeasures))
  const fillPercent = (activeMeasure / totalMeasures) * 100

  return (
    <div
      className="practice-timeline-session__measure-progress"
      role="progressbar"
      aria-valuenow={activeMeasure}
      aria-valuemin={1}
      aria-valuemax={totalMeasures}
      aria-label={`Measure ${activeMeasure} of ${totalMeasures}`}
    >
      <div className="practice-timeline-session__measure-track">
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
