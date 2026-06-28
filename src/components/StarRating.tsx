import { Star } from 'lucide-react'
import Pressable from './ui/Pressable'

interface StarRatingProps {
  rating: number
  onChange: (rating: number) => void
  size?: 'sm' | 'md'
}

export default function StarRating({
  rating,
  onChange,
  size = 'sm',
}: StarRatingProps) {
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Rate this take">
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = value <= rating
        return (
          <Pressable
            key={value}
            type="button"
            intensity="icon"
            onClick={() => onChange(value === rating ? 0 : value)}
            haptic="light"
            className="rounded p-0.5 text-[var(--sm-gold)] hover:opacity-90"
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            aria-pressed={filled}
          >
            <Star
              className={`${iconClass} ${filled ? 'fill-[var(--sm-gold)]' : 'fill-transparent opacity-30'}`}
              strokeWidth={filled ? 0 : 1.5}
            />
          </Pressable>
        )
      })}
    </div>
  )
}
