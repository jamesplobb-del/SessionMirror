import SimpleSegmentedControl from './ui/SimpleSegmentedControl'
import type { SortMode } from '../types'

interface GallerySortStripProps {
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  takeCount: number
  compact?: boolean
}

export default function GallerySortStrip({
  sortMode,
  onSortChange,
  takeCount,
  compact = false,
}: GallerySortStripProps) {
  const sortControl = (
    <SimpleSegmentedControl
      size={compact ? 'xs' : 'sm'}
      ariaLabel="Sort takes"
      value={sortMode}
      onChange={onSortChange}
      segments={[
        { id: 'newest' as const, label: 'Newest' },
        { id: 'highest-rated' as const, label: 'Top rated' },
      ]}
    />
  )

  if (compact) {
    return sortControl
  }

  return (
    <div className="mb-4 flex items-center justify-between">
      <p className="text-xs text-stone-500">{takeCount} take{takeCount === 1 ? '' : 's'}</p>
      {sortControl}
    </div>
  )
}
