import { ChevronDown, FolderOpen } from 'lucide-react'
import Pressable from './ui/Pressable'

interface HudHeaderProps {
  sessionName: string
  onOpenVault: () => void
  className?: string
  splitViewActive?: boolean
  onExitSplitView?: () => void
}

export default function HudHeader({
  sessionName,
  onOpenVault,
  className = '',
  splitViewActive = false,
  onExitSplitView,
}: HudHeaderProps) {
  return (
    <header
      className={`pointer-events-none relative flex shrink-0 items-center justify-center px-4 pt-2 transition-opacity duration-200 ${className}`}
    >
      {splitViewActive && onExitSplitView && (
        <Pressable
          type="button"
          intensity="soft"
          onClick={onExitSplitView}
          className="pointer-events-auto absolute right-4 top-2 z-10 rounded-full border border-red-500/50 bg-black/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-100 backdrop-blur-xl transition hover:border-red-400/60 hover:bg-black/55"
          aria-label="Return to normal view"
        >
          Normal View
        </Pressable>
      )}

      <Pressable
        type="button"
        intensity="soft"
        onClick={onOpenVault}
        className="pointer-events-auto flex max-w-[min(100%,16rem)] items-center justify-center rounded-full border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-xl transition hover:border-amber-500/30 hover:bg-black/50"
        aria-label={`Open vault — current session: ${sessionName}`}
      >
        <span className="ui-orient-spin flex max-w-full items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span
            className="truncate text-xs font-semibold tracking-tight text-gray-100"
            title={sessionName}
          >
            {sessionName}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-gray-500" aria-hidden />
        </span>
      </Pressable>
    </header>
  )
}
