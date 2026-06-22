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
          className="pointer-events-auto absolute right-4 top-2 z-10 rounded-md border-2 border-red-500 bg-black/75 px-2.5 py-1 text-[10px] font-semibold text-white shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_2px_12px_rgba(0,0,0,0.45)] ring-1 ring-red-400/60 backdrop-blur-md hover:border-red-400 hover:bg-black/90"
          aria-label="Return to normal view"
        >
          Normal View
        </Pressable>
      )}

      <Pressable
        type="button"
        intensity="soft"
        onClick={onOpenVault}
        className="pointer-events-auto flex max-w-[min(100%,16rem)] items-center justify-center rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 shadow-lg backdrop-blur-md hover:border-white/25 hover:bg-black/55"
        aria-label={`Open vault — current session: ${sessionName}`}
      >
        <span className="ui-orient-spin flex max-w-full items-center gap-1.5">
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
