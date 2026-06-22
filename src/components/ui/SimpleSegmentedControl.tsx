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
  size?: 'xs' | 'sm' | 'md'
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
  const padding =
    size === 'xs' ? 'p-0.5' : size === 'sm' ? 'p-0.5' : 'p-1'
  const buttonClass =
    size === 'xs'
      ? 'rounded-md px-2 py-0.5 text-xs font-medium'
      : size === 'sm'
        ? 'rounded-md px-2.5 py-1 text-xs font-medium'
        : 'rounded-lg px-3 py-2 text-sm font-medium'
  const shellRadius = size === 'xs' ? 'rounded-lg' : 'rounded-xl'

  return (
    <div
      className={`flex ${shellRadius} bg-stone-100 ${padding} ${className}`}
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
