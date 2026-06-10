import IOSSegmentedControl from './ui/IOSSegmentedControl'
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
  return (
    <IOSSegmentedControl
      className="mb-4 bg-stone-200/80"
      layoutId="vault-media-segment"
      ariaLabel="Filter takes by media type"
      value={value}
      onChange={onChange}
      segments={[
        {
          id: 'video' as const,
          label: (
            <>
              Video
              {videoCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({videoCount})</span>
              )}
            </>
          ),
        },
        {
          id: 'audio' as const,
          label: (
            <>
              Audio
              {audioCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({audioCount})</span>
              )}
            </>
          ),
        },
      ]}
    />
  )
}
