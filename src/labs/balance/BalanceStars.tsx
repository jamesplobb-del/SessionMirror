import { Star } from 'lucide-react'

interface BalanceStarsProps {
  earned: number
  total?: number
  className?: string
}

/**
 * The three-star row. Filled stars are drawn with `fill` and no stroke so they
 * read as solid game stars rather than outlined icons; empty ones keep the
 * same silhouette in grey so the row never changes width.
 */
export default function BalanceStars({ earned, total = 3, className = '' }: BalanceStarsProps) {
  return (
    <span className={className} aria-label={`${earned} of ${total} stars`}>
      {Array.from({ length: total }, (_, index) => (
        <Star key={index} className={index < earned ? 'is-on' : 'is-off'} aria-hidden />
      ))}
    </span>
  )
}
