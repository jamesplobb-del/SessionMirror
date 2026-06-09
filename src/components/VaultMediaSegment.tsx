import type { MediaType } from '../types'

interface VaultMediaSegmentProps {
  value: MediaType
  onChange: (value: MediaType) => void
  videoCount: number
  audioCount: number
}

export default function VaultMediaSegment({
  value,
  onChange,
  videoCount,
  audioCount,
}: VaultMediaSegmentProps) {
  const segments: { id: MediaType; label: string; count: number }[] = [
    { id: 'video', label: 'Video', count: videoCount },
    { id: 'audio', label: 'Audio', count: audioCount },
  ]

  return (
    <div
      className="mb-4 flex rounded-xl bg-stone-200/80 p-1"
      role="tablist"
      aria-label="Filter takes by media type"
    >
      {segments.map((segment) => {
        const active = value === segment.id
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {segment.label}
            {segment.count > 0 && (
              <span className="ml-1.5 text-xs text-stone-400">({segment.count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
