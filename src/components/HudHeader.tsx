import { FolderOpen } from 'lucide-react'

interface HudHeaderProps {
  sessionName: string
}

export default function HudHeader({ sessionName }: HudHeaderProps) {
  return (
    <header className="pointer-events-none flex shrink-0 justify-center px-4 pt-2">
      <div className="pointer-events-auto flex max-w-[min(100%,16rem)] items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 shadow-lg backdrop-blur-md">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        <h1
          className="truncate text-xs font-semibold tracking-tight text-white drop-shadow-sm"
          title={sessionName}
        >
          {sessionName}
        </h1>
      </div>
    </header>
  )
}
