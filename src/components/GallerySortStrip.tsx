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
      <div className="flex gap-1 rounded-lg bg-stone-100 p-0.5">
        <button
          type="button"
          onClick={() => onSortChange('newest')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            sortMode === 'newest'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          Newest
        </button>
        <button
          type="button"
          onClick={() => onSortChange('highest-rated')}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            sortMode === 'highest-rated'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          Top rated
        </button>
      </div>
    </div>
  )
}
