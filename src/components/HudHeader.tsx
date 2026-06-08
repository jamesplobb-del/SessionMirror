import { Mic2 } from 'lucide-react'

export default function HudHeader() {
  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 shadow-lg backdrop-blur-md">
        <Mic2 className="h-3.5 w-3.5 text-amber-300" />
        <h1 className="text-xs font-semibold tracking-tight text-white drop-shadow-sm">
          BestTake
        </h1>
      </div>
    </header>
  )
}
