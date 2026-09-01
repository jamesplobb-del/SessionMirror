import { ChevronDown } from 'lucide-react'
import Pressable from '../ui/Pressable'

export function cycleNext<T>(list: readonly T[], current: T): T {
  const index = list.indexOf(current)
  return list[(index + 1) % list.length] ?? list[0]!
}

interface ArcadeCycleChipProps {
  label: string
  value: string
  step: number
  stepCount: number
  hapticFeedback: boolean
  onCycle: () => void
}

/**
 * A setting that lives on the ready screen: tap cycles to the next value.
 *
 * The chevron and the step dots are the whole point — without them a chip
 * reads as a label, and the player never finds out it does anything.
 */
export default function ArcadeCycleChip({
  label,
  value,
  step,
  stepCount,
  hapticFeedback,
  onCycle,
}: ArcadeCycleChipProps) {
  const nextHint = `Tap to change ${label.toLowerCase()}, currently ${value}`

  return (
    <Pressable
      type="button"
      intensity="soft"
      hapticFeedback={hapticFeedback}
      className="balance-cycle"
      onClick={onCycle}
      aria-label={nextHint}
    >
      <small>{label}</small>
      <strong>
        <span>{value}</span>
        <ChevronDown aria-hidden />
      </strong>
      <span className="balance-cycle__dots" aria-hidden>
        {Array.from({ length: stepCount }, (_, index) => (
          <i key={index} className={index === step ? 'is-on' : undefined} />
        ))}
      </span>
    </Pressable>
  )
}
