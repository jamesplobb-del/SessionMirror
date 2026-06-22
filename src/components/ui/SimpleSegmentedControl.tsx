import type { ReactNode } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'

export interface SimpleSegment<T extends string> {
  id: T
  label: ReactNode
}

interface SimpleSegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  segments: SimpleSegment<T>[]
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
  hapticFeedback?: boolean
}

/** Lightweight segmented control — CSS only, no layout animations. */
export default function SimpleSegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  className = '',
  size = 'md',
  ariaLabel,
  hapticFeedback = true,
}: SimpleSegmentedControlProps<T>) {
  const padding = size === 'sm' ? 'p-0.5' : 'p-1'
  const buttonClass =
    size === 'sm'
      ? 'rounded-md px-2.5 py-1 text-xs font-medium'
      : 'rounded-lg px-3 py-2 text-sm font-medium'

  return (
    <div
      className={`flex rounded-xl bg-stone-100 ${padding} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {segments.map((segment) => {
        const active = value === segment.id
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              triggerLightHaptic(hapticFeedback)
              onChange(segment.id)
            }}
            className={`interactive-native flex-1 ${buttonClass} transition-colors duration-150 ${
              active
                ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/80'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
