import type { ReactNode } from 'react'

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
}

/** Lightweight segmented control — CSS only, no layout animations. */
export default function SimpleSegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  className = '',
  size = 'md',
  ariaLabel,
}: SimpleSegmentedControlProps<T>) {
  const padding = size === 'sm' ? 'p-0.5' : 'p-1'
  const buttonClass =
    size === 'sm'
      ? 'rounded-full px-2.5 py-1 text-xs font-medium'
      : 'rounded-full px-3 py-2 text-sm font-medium'

  return (
    <div
      className={`flex rounded-full bg-[#1a1a1a] ${padding} ${className}`}
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
            onClick={() => onChange(segment.id)}
            className={`flex-1 ${buttonClass} transition-colors duration-150 active:scale-[0.98] ${
              active
                ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {segment.label}
          </button>
        )
      })}
    </div>
  )
}
