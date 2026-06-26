import { memo } from 'react'
import { ChevronDown, FolderOpen } from 'lucide-react'
import Pressable from './ui/Pressable'

interface HudHeaderProps {
  sessionName: string
  onOpenVault: () => void
  className?: string
}

function HudHeader({ sessionName, onOpenVault, className = '' }: HudHeaderProps) {
  return (
    <header
      className={`hud-header pointer-events-none relative flex w-full shrink-0 items-center justify-center px-4 pt-2 transition-opacity duration-200 ${className}`}
    >
      <Pressable
        type="button"
        intensity="soft"
        squish={false}
        onClick={onOpenVault}
        haptic="light"
        className="hud-header__vault ui-orient-spin pointer-events-auto flex max-w-[min(100%,16rem)] items-center justify-center rounded-full border border-white/15 bg-black/55 px-3.5 py-1.5 shadow-lg transition-opacity duration-200 ease-out hover:border-white/25 hover:bg-black/70"
        aria-label={`Open vault — current session: ${sessionName}`}
      >
        <span className="flex max-w-full items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span
            className="truncate text-xs font-semibold tracking-tight text-white drop-shadow-sm"
            title={sessionName}
          >
            {sessionName}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-white/55" aria-hidden />
        </span>
      </Pressable>
    </header>
  )
}

export default memo(HudHeader)
