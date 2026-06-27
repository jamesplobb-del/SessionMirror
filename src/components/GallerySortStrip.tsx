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
    <div className="gallery-sort-strip flex flex-1 items-center justify-between gap-3">
      <p className="text-xs font-semibold text-stone-500">{takeCount} take{takeCount === 1 ? '' : 's'}</p>
      <SimpleSegmentedControl
        size="sm"
        className="bg-white/65 ring-1 ring-stone-200/70"
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
