import { Circle, FolderOpen } from 'lucide-react'

interface ControlDeckProps {
  isRecording: boolean
  elapsed: number
  ready: boolean
  onToggleRecord: () => void
  onOpenVault: () => void
  takeCount: number
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ControlDeck({
  isRecording,
  elapsed,
  ready,
  onToggleRecord,
  onOpenVault,
  takeCount,
}: ControlDeckProps) {
  return (
    <div
      className="pointer-events-auto flex justify-center px-4 pb-6 pt-2"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3 rounded-full border border-white/15 bg-black/45 px-4 py-2.5 shadow-xl backdrop-blur-md">
        <button
          type="button"
          onClick={onToggleRecord}
          disabled={!ready}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
            isRecording
              ? 'bg-red-500/90 text-white'
              : 'bg-white/15 text-white hover:bg-white/25 disabled:opacity-40'
          }`}
        >
          <Circle
            className={`h-3 w-3 ${isRecording ? 'fill-white animate-pulse' : 'fill-red-400'}`}
          />
          {isRecording ? formatElapsed(elapsed) : 'Record'}
        </button>

        <button
          type="button"
          onClick={onOpenVault}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          <FolderOpen className="h-4 w-4" />
          View Takes
          {takeCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {takeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
