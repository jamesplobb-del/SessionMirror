import { FolderOpen, Settings } from 'lucide-react'
import type { RecordingMode } from '../types'
import RecordingModeCarousel from './RecordingModeCarousel'

interface ControlDeckProps {
  isRecording: boolean
  elapsed: number
  ready: boolean
  recordingMode: RecordingMode
  onRecordingModeChange: (mode: RecordingMode) => void
  onToggleRecord: () => void
  onOpenVault: () => void
  onOpenSettings: () => void
  takeCount: number
  autoSoundListening?: boolean
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
  recordingMode,
  onRecordingModeChange,
  onToggleRecord,
  onOpenVault,
  onOpenSettings,
  takeCount,
  autoSoundListening = false,
}: ControlDeckProps) {
  return (
    <div className="control-deck pointer-events-auto flex w-full flex-col items-center px-4">
      <div className="relative flex w-full max-w-xs items-center justify-center">
        <button
          type="button"
          onClick={onOpenVault}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md transition hover:bg-black/55"
          aria-label={`View takes${takeCount > 0 ? `, ${takeCount} saved` : ''}`}
        >
          <FolderOpen className="h-5 w-5" />
          {takeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/90 px-1 text-[9px] font-semibold text-stone-900">
              {takeCount > 99 ? '99+' : takeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md transition hover:bg-black/55"
          aria-label="Open settings"
        >
          <Settings className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1">
          <RecordingModeCarousel
            value={recordingMode}
            onChange={onRecordingModeChange}
            onToggleRecord={onToggleRecord}
            isRecording={isRecording}
            ready={ready}
          />

          {autoSoundListening && !isRecording && (
            <span className="text-[10px] font-medium tracking-wide text-sky-300/90">
              Listening…
            </span>
          )}

          {isRecording && (
            <span
              className="text-xs font-medium tabular-nums tracking-wide text-white/90"
              aria-live="polite"
            >
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
