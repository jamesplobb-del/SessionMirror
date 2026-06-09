import { FolderOpen, Mic, Square } from 'lucide-react'
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
  recordingMode,
  onRecordingModeChange,
  onToggleRecord,
  onOpenVault,
  takeCount,
}: ControlDeckProps) {
  const isAudioMode = recordingMode === 'audio'

  return (
    <div className="pointer-events-auto flex w-full flex-col items-center px-4 pt-2">
      <RecordingModeCarousel
        value={recordingMode}
        onChange={onRecordingModeChange}
        disabled={isRecording}
      />

      <div className="relative mt-3 flex w-full max-w-xs items-center justify-center">
        <button
          type="button"
          onClick={onOpenVault}
          className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md transition hover:bg-black/55"
          aria-label={`View takes${takeCount > 0 ? `, ${takeCount} saved` : ''}`}
        >
          <FolderOpen className="h-5 w-5" />
          {takeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/90 px-1 text-[9px] font-semibold text-stone-900">
              {takeCount > 99 ? '99+' : takeCount}
            </span>
          )}
        </button>

        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onToggleRecord}
            disabled={!ready}
            aria-label={
              isRecording
                ? 'Stop recording'
                : isAudioMode
                  ? 'Start audio recording'
                  : 'Start video recording'
            }
            className={`record-shutter flex shrink-0 items-center justify-center rounded-full border-[3px] transition disabled:opacity-40 ${
              isRecording
                ? 'border-white/90 bg-transparent'
                : isAudioMode
                  ? 'border-white/90 bg-white/10 backdrop-blur-sm hover:bg-white/15'
                  : 'border-white/90 bg-red-500 hover:bg-red-500'
            }`}
          >
            {isRecording ? (
              <Square className="h-5 w-5 fill-red-500 text-red-500" />
            ) : isAudioMode ? (
              <Mic className="h-5 w-5 text-white" strokeWidth={2.25} />
            ) : null}
          </button>

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
