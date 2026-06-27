import { memo } from 'react'
import { Ellipsis } from 'lucide-react'
import Pressable from '../ui/Pressable'

interface AudioModeHeaderProps {
  onOpenMenu: () => void
  className?: string
}

function AudioModeHeader({ onOpenMenu, className = '' }: AudioModeHeaderProps) {
  return (
    <header
      className={`audio-mode-header pointer-events-none relative flex w-full shrink-0 items-center justify-end px-4 pt-1 ${className}`}
    >
      <Pressable
        type="button"
        intensity="icon"
        squish={false}
        onClick={onOpenMenu}
        haptic="light"
        className="audio-mode-header__menu pointer-events-auto"
        aria-label="Open menu"
      >
        <Ellipsis className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </Pressable>
    </header>
  )
}

export default memo(AudioModeHeader)
