import { useCallback, useRef, useState, type PointerEvent } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

interface MeasureProgressBarProps {
  measure: number
  totalMeasures: number
  onSeekMeasure?: (measure: number) => void
  disabled?: boolean
  className?: string
}

function measureFromClientX(
  clientX: number,
  rect: DOMRect,
  totalMeasures: number,
): number {
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
  const clamped = Math.max(0, Math.min(0.999999, ratio))
  return Math.max(1, Math.min(totalMeasures, Math.floor(clamped * totalMeasures) + 1))
}

export default function MeasureProgressBar({
  measure,
  totalMeasures,
  onSeekMeasure,
  disabled = false,
  className = '',
}: MeasureProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [previewMeasure, setPreviewMeasure] = useState<number | null>(null)
  const [scrubbing, setScrubbing] = useState(false)

  const activeMeasure = Math.max(1, Math.min(measure || 1, Math.max(totalMeasures, 1)))

  const updatePreview = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || totalMeasures <= 0) return activeMeasure
      return measureFromClientX(clientX, rect, totalMeasures)
    },
    [activeMeasure, totalMeasures],
  )

  if (totalMeasures <= 0) return null

  const displayMeasure = previewMeasure ?? activeMeasure
  const fillPercent = (activeMeasure / totalMeasures) * 100
  const seekable = Boolean(onSeekMeasure) && !disabled
  const showMeasureNumbers = totalMeasures <= 16

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!seekable || !onSeekMeasure) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubbing(true)
    const nextMeasure = updatePreview(event.clientX)
    setPreviewMeasure(nextMeasure)
    triggerLightHaptic()
    onSeekMeasure(nextMeasure)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!seekable || !scrubbing) return
    setPreviewMeasure(updatePreview(event.clientX))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!seekable || !onSeekMeasure) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const nextMeasure = updatePreview(event.clientX)
    if (nextMeasure !== activeMeasure) {
      triggerLightHaptic()
      onSeekMeasure(nextMeasure)
    }
    setScrubbing(false)
    setPreviewMeasure(null)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setScrubbing(false)
    setPreviewMeasure(null)
  }

  const previewLeft = ((displayMeasure - 0.5) / totalMeasures) * 100

  return (
    <div
      className={`practice-timeline-session__measure-progress ${seekable ? 'practice-timeline-session__measure-progress--seekable' : ''} ${className}`.trim()}
      role={seekable ? 'slider' : 'progressbar'}
      aria-valuenow={activeMeasure}
      aria-valuemin={1}
      aria-valuemax={totalMeasures}
      aria-label={`Measure ${activeMeasure} of ${totalMeasures}`}
      aria-disabled={disabled || undefined}
    >
      <div className="practice-timeline-session__measure-progress-head">
        <span className="practice-timeline-session__measure-progress-label">
          {scrubbing || previewMeasure ? 'Jump to' : 'Bar'}
        </span>
        <span className="practice-timeline-session__measure-progress-value">
          {displayMeasure}
          <span className="practice-timeline-session__measure-progress-total">
            {' '}
            / {totalMeasures}
          </span>
        </span>
      </div>

      <div
        ref={trackRef}
        className={`practice-timeline-session__measure-track ${seekable ? 'practice-timeline-session__measure-track--seekable' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <div
          className="practice-timeline-session__measure-fill"
          style={{ width: `${fillPercent}%` }}
        />
        {scrubbing ? (
          <div
            className="practice-timeline-session__measure-preview"
            style={{ left: `${previewLeft}%` }}
            aria-hidden
          >
            <span className="practice-timeline-session__measure-preview-badge">
              {displayMeasure}
            </span>
          </div>
        ) : null}
        {Array.from({ length: totalMeasures }, (_, index) => {
          const measureNumber = index + 1
          const position = ((index + 0.5) / totalMeasures) * 100
          const isActive = measureNumber === displayMeasure
          const isPast = measureNumber < activeMeasure
          const isPreviewed = scrubbing && measureNumber === displayMeasure
          return (
            <span
              key={measureNumber}
              className={[
                'practice-timeline-session__measure-tick',
                isActive ? 'practice-timeline-session__measure-tick--active' : '',
                isPast ? 'practice-timeline-session__measure-tick--past' : '',
                isPreviewed ? 'practice-timeline-session__measure-tick--preview' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${position}%` }}
            />
          )
        })}
      </div>

      {showMeasureNumbers ? (
        <div className="practice-timeline-session__measure-numbers" aria-hidden>
          {Array.from({ length: totalMeasures }, (_, index) => {
            const measureNumber = index + 1
            const position = ((index + 0.5) / totalMeasures) * 100
            const isActive = measureNumber === displayMeasure
            return (
              <span
                key={measureNumber}
                className={[
                  'practice-timeline-session__measure-number',
                  isActive ? 'practice-timeline-session__measure-number--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${position}%` }}
              >
                {measureNumber}
              </span>
            )
          })}
        </div>
      ) : (
        <div className="practice-timeline-session__measure-labels">
          <span>1</span>
          <span>{totalMeasures}</span>
        </div>
      )}
    </div>
  )
}
