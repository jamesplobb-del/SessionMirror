import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import Pressable from './ui/Pressable'
import { triggerLightHaptic } from '../utils/haptics'
import type { SortMode } from '../types'

interface GallerySortStripProps {
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  takeCount: number
}

export default function GallerySortStrip({
  sortMode,
  onSortChange,
  takeCount: _takeCount,
}: GallerySortStripProps) {
  const toggleSort = () => {
    triggerLightHaptic()
    onSortChange(sortMode === 'newest' ? 'highest-rated' : 'newest')
  }

  return (
    <div className="vault-sort-row">
      <Pressable
        type="button"
        intensity="soft"
        haptic="light"
        onClick={toggleSort}
        className="vault-sort-trigger"
        aria-label={`Sort by ${sortMode === 'newest' ? 'newest' : 'top rated'}. Tap to change.`}
      >
        {sortMode === 'newest' ? 'Newest' : 'Top rated'}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Pressable>
      <div className="vault-sort-icons">
        <span className="vault-sort-icon-btn vault-sort-icon-btn--active" aria-hidden>
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}
