import SimpleSegmentedControl from './ui/SimpleSegmentedControl'

export type VaultMediaFilter = 'all' | 'video' | 'audio' | 'best'

interface VaultMediaSegmentProps {
  value: VaultMediaFilter
  onChange: (value: VaultMediaFilter) => void
  allCount: number
  videoCount: number
  audioCount: number
  bestCount: number
}

export default function VaultMediaSegment({
  value,
  onChange,
  allCount,
  videoCount,
  audioCount,
  bestCount,
}: VaultMediaSegmentProps) {
  return (
    <SimpleSegmentedControl
      className="vault-media-segment mb-4 bg-stone-200/80"
      ariaLabel="Filter takes by media type"
      value={value}
      onChange={onChange}
      segments={[
        {
          id: 'all' as const,
          label: (
            <>
              All
              {allCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({allCount})</span>
              )}
            </>
          ),
        },
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
        {
          id: 'best' as const,
          label: (
            <>
              Best
              {bestCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({bestCount})</span>
              )}
            </>
          ),
        },
      ]}
    />
  )
}
