import Pressable from '../../components/ui/Pressable'
import type { TimelineSection } from '../types'

interface TimelinePlaybackViewProps {
  section?: TimelineSection
  nextSection?: TimelineSection
  measure: number
  totalMeasures: number
  onStop: () => void
}

export default function TimelinePlaybackView({
  section,
  nextSection,
  measure,
  totalMeasures,
  onStop,
}: TimelinePlaybackViewProps) {
  const progress =
    totalMeasures > 0 ? Math.min(100, (Math.max(0, measure - 1) / totalMeasures) * 100) : 0
  const remaining = Math.max(0, totalMeasures - measure + 1)

  return (
    <div className="practice-timeline-playback pointer-events-auto" role="status" aria-live="polite">
      <h2 className="practice-timeline-playback__title">{section?.title ?? 'Practice'}</h2>
      <p className="practice-timeline-playback__measure">
        Measure {measure} of {totalMeasures}
        {remaining > 0 ? ` · ${remaining} left` : ''}
      </p>

      <div className="practice-timeline-playback__stats">
        <div>
          <div className="practice-timeline-playback__stat-value">{section?.bpm ?? '—'}</div>
          <div className="practice-timeline-playback__stat-label">BPM</div>
        </div>
        <div>
          <div className="practice-timeline-playback__stat-value">{section?.meter ?? '—'}</div>
          <div className="practice-timeline-playback__stat-label">Time</div>
        </div>
      </div>

      <p className="practice-timeline-playback__next">
        {nextSection ? (
          <>
            Next: <strong>{nextSection.title}</strong>
          </>
        ) : (
          'Last section'
        )}
      </p>

      <div className="practice-timeline-playback__progress" aria-hidden>
        <div
          className="practice-timeline-playback__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <Pressable
        type="button"
        intensity="normal"
        haptic="medium"
        className="practice-timeline-playback__stop"
        onClick={onStop}
      >
        Stop
      </Pressable>
    </div>
  )
}
