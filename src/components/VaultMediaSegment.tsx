export type VaultMediaFilter = 'all' | 'video' | 'audio' | 'best'

interface VaultMediaSegmentProps {
  value: VaultMediaFilter
  onChange: (value: VaultMediaFilter) => void
  allCount: number
  videoCount: number
  audioCount: number
  bestCount: number
}

function Pill({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean
  label: string
  count?: number
  onPress: () => void
}) {
  return (
    <button
      type="button"
      className={`vault-filter-pill interactive-native ${active ? 'vault-filter-pill--active' : ''}`}
      aria-pressed={active}
      onClick={onPress}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="vault-filter-pill__count">({count})</span>
      )}
    </button>
  )
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
    <div
      className="vault-filter-pills no-scrollbar"
      role="tablist"
      aria-label="Filter takes by media type"
    >
      <Pill active={value === 'all'} label="All" count={allCount} onPress={() => onChange('all')} />
      <Pill active={value === 'video'} label="Video" count={videoCount} onPress={() => onChange('video')} />
      <Pill active={value === 'audio'} label="Audio" count={audioCount} onPress={() => onChange('audio')} />
      <Pill active={value === 'best'} label="Best" count={bestCount} onPress={() => onChange('best')} />
    </div>
  )
}
