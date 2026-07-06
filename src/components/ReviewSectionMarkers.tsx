import Pressable from './ui/Pressable'
import type { PracticeTimelineMarker } from '../practiceTimeline/types'

interface ReviewSectionMarkersProps {
  markers: PracticeTimelineMarker[]
  duration: number
  currentTime: number
  onSeek: (timeSeconds: number) => void
}

export default function ReviewSectionMarkers({
  markers,
  duration,
  currentTime,
  onSeek,
}: ReviewSectionMarkersProps) {
  if (markers.length === 0) return null

  return (
    <div className="review-section-markers pointer-events-auto mt-3 px-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
        Practice sections
      </p>
      <div className="flex flex-wrap gap-2">
        {markers.map((marker, index) => {
          const nextTime = markers[index + 1]?.timeSeconds ?? duration
          const active = currentTime >= marker.timeSeconds && currentTime < nextTime
          return (
            <Pressable
              key={`${marker.sectionId}-${marker.timeSeconds}`}
              type="button"
              intensity="soft"
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                active ? 'bg-[var(--sm-gold)] text-black' : 'bg-white/10 text-white/85'
              }`}
              onClick={() => onSeek(marker.timeSeconds)}
            >
              {marker.title}
            </Pressable>
          )
        })}
      </div>
    </div>
  )
}
