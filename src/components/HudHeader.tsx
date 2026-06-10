import { ChevronDown, FolderOpen } from 'lucide-react'
import Pressable from './ui/Pressable'

interface HudHeaderProps {
  sessionName: string
  onOpenVault: () => void
  className?: string
}

export default function HudHeader({ sessionName, onOpenVault, className = '' }: HudHeaderProps) {
  return (
    <header
      className={`pointer-events-none flex shrink-0 justify-center px-4 pt-2 transition-opacity duration-200 ${className}`}
    >
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
