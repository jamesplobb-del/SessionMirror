import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import Pressable from './Pressable'
import { iosSpringSnappy } from '../../utils/motionPresets'

export interface IOSSegment<T extends string> {
  id: T
  label: ReactNode
}

interface IOSSegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  segments: IOSSegment<T>[]
  layoutId: string
  className?: string
  size?: 'sm' | 'md'
  ariaLabel?: string
}

export default function IOSSegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  layoutId,
  className = '',
  size = 'md',
  ariaLabel,
}: IOSSegmentedControlProps<T>) {
  const padding = size === 'sm' ? 'p-0.5' : 'p-1'
  const buttonClass =
    size === 'sm'
      ? 'rounded-md px-2.5 py-1 text-xs font-medium'
      : 'rounded-lg px-3 py-2 text-sm font-medium'

  return (
    <div
      className={`relative flex rounded-xl bg-stone-100 ${padding} ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {segments.map((segment) => {
        const active = value === segment.id
        return (
          <Pressable
            key={segment.id}
            type="button"
            role="tab"
            aria-selected={active}
            intensity="soft"
            onClick={() => onChange(segment.id)}
            haptic="light"
            className={`relative z-10 flex-1 ${buttonClass} ${
              active ? 'text-stone-900' : 'text-stone-500'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[inherit] bg-white shadow-sm ring-1 ring-stone-200/80"
                transition={iosSpringSnappy}
              />
            )}
            <span className="relative z-10">{segment.label}</span>
          </Pressable>
        )
      })}
    </div>
  )
}
