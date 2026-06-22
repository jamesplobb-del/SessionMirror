import { ChevronDown, FolderOpen, Layout } from 'lucide-react'
import Pressable from './ui/Pressable'

const HUD_GLASS_BTN =
  'flex h-10 w-10 items-center justify-center rounded-full border border-sky-200/10 bg-slate-950/40 text-slate-50 shadow-lg backdrop-blur-2xl transition-all duration-200 ease-out hover:bg-slate-900/55'

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
          haptic="light"
          className={`pointer-events-auto absolute right-4 top-2 z-10 ${HUD_GLASS_BTN}`}
          aria-label="Return to normal view"
        >
          <Layout className="h-[18px] w-[18px] stroke-[1.5]" aria-hidden />
        </Pressable>
      )}

      <Pressable
        type="button"
        intensity="soft"
        onClick={onOpenVault}
        haptic="light"
        className="pointer-events-auto flex max-w-[min(100%,16rem)] items-center justify-center rounded-full border border-sky-200/10 bg-slate-950/40 px-3.5 py-1.5 shadow-lg backdrop-blur-2xl hover:border-sky-200/20 hover:bg-slate-900/55"
        aria-label={`Open vault — current session: ${sessionName}`}
      >
        <span className="ui-orient-spin flex max-w-full items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span
            className="truncate text-xs font-semibold tracking-tight text-slate-50 drop-shadow-sm"
            title={sessionName}
          >
            {sessionName}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        </span>
      </Pressable>
    </header>
  )
}
