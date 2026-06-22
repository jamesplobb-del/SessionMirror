import SimpleSegmentedControl from './ui/SimpleSegmentedControl'
import type { SortMode } from '../types'

interface GallerySortStripProps {
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  takeCount: number
}

export default function GallerySortStrip({
  sortMode,
  onSortChange,
  takeCount,
}: GallerySortStripProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <p className="text-xs text-stone-500">{takeCount} take{takeCount === 1 ? '' : 's'}</p>
      <SimpleSegmentedControl
        size="sm"
        ariaLabel="Sort takes"
        value={sortMode}
        onChange={onSortChange}
        segments={[
          { id: 'newest' as const, label: 'Newest' },
          { id: 'highest-rated' as const, label: 'Top rated' },
        ]}
      />
    </div>
  )
}
