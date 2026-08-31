import { memo } from 'react'
import { Ellipsis } from 'lucide-react'
import Pressable from './ui/Pressable'

interface HudHeaderProps {
  onOpenMenu: () => void
  className?: string
  showBrand?: boolean
}

function HudHeader({ onOpenMenu, className = '', showBrand = true }: HudHeaderProps) {
  return (
    <header
      className={`hud-header pointer-events-none relative flex w-full shrink-0 items-center justify-between px-4 transition-opacity duration-200 ${className}`}
    >
      {showBrand ? (
        <span className="hud-header__brand" aria-label="BestTake">
          BestTake
        </span>
      ) : (
        <span aria-hidden />
      )}
      <Pressable
        type="button"
        intensity="icon"
        squish={false}
        onClick={onOpenMenu}
        haptic="light"
        className="hud-header__menu ui-orient-spin pointer-events-auto"
        aria-label="Open settings"
      >
        <Ellipsis className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </Pressable>
    </header>
  )
}

export default memo(HudHeader)
