import { Circle, FolderOpen, Mic } from 'lucide-react'
import type { RecordingMode } from '../types'

interface ControlDeckProps {
  isRecording: boolean
  elapsed: number
  ready: boolean
  recordingMode: RecordingMode
  onToggleRecordingMode: () => void
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
  onToggleRecordingMode,
  onToggleRecord,
  onOpenVault,
  takeCount,
}: ControlDeckProps) {
  const isAudioMode = recordingMode === 'audio'

  return (
    <div className="pointer-events-auto flex justify-center px-4 pb-2 pt-3">
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-2.5 shadow-xl backdrop-blur-md sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onToggleRecordingMode}
          disabled={isRecording}
          aria-pressed={isAudioMode}
          aria-label={
            isAudioMode ? 'Switch to video recording mode' : 'Switch to audio recording mode'
          }
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
            isAudioMode
              ? 'bg-sky-500/90 text-white shadow-[0_0_12px_rgba(56,189,248,0.45)]'
              : 'bg-white/10 text-white/80 hover:bg-white/20 disabled:opacity-40'
          }`}
        >
          <Mic className="h-4 w-4" />
        </button>

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
          {isRecording ? formatElapsed(elapsed) : isAudioMode ? 'Record Audio' : 'Record'}
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
