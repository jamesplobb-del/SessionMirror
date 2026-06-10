import { FolderOpen, Settings, Trash2 } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { useLongPress } from '../hooks/useLongPress'
import SettingsBranchWheel from './SettingsBranchWheel'
import RecordingModeCarousel from './RecordingModeCarousel'
import type { RecordingMode } from '../types'

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
  recordDropRef?: RefObject<HTMLDivElement | null>
  dragDeleteActive?: boolean
  dragOverDelete?: boolean
  pitchToggleVisible?: boolean
  pitchToggleActive?: boolean
  onPitchToggle?: () => void
  showTakeCards?: boolean
  onShowTakeCardsChange?: (show: boolean) => void
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
  recordDropRef,
  dragDeleteActive = false,
  dragOverDelete = false,
  pitchToggleVisible = false,
  pitchToggleActive = false,
  onPitchToggle,
  showTakeCards = true,
  onShowTakeCardsChange,
}: ControlDeckProps) {
  const showDeleteDrop = dragDeleteActive && !isRecording
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const [branchOpen, setBranchOpen] = useState(false)

  const settingsPress = useLongPress({
    onClick: onOpenSettings,
    onLongPress: () => setBranchOpen(true),
    disabled: branchOpen,
  })

  return (
    <div className="control-deck pointer-events-auto flex w-full flex-col items-center px-4">
      <SettingsBranchWheel
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        anchorRef={settingsButtonRef}
        pitchToggleVisible={pitchToggleVisible}
        pitchToggleActive={pitchToggleActive}
        onPitchToggle={() => onPitchToggle?.()}
        showTakeCards={showTakeCards}
        onShowTakeCardsChange={(show) => onShowTakeCardsChange?.(show)}
      />

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
          ref={settingsButtonRef}
          className={`absolute right-0 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition ${
            branchOpen
              ? 'bg-white/20 text-white ring-1 ring-white/30'
              : 'bg-black/40 text-white/90 hover:bg-black/55'
          }`}
          aria-label="Open settings. Long press for quick settings."
          aria-expanded={branchOpen}
          aria-haspopup="menu"
          onContextMenu={(event) => event.preventDefault()}
          {...settingsPress}
        >
          <Settings className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-1">
          <div
            ref={recordDropRef}
            className={`record-delete-drop ${showDeleteDrop ? 'record-delete-drop--active' : ''} ${
              dragOverDelete ? 'record-delete-drop--hover' : ''
            }`}
            aria-hidden={!showDeleteDrop}
          >
            {showDeleteDrop ? (
              <div
                className="record-carousel-viewport flex items-center justify-center pointer-events-none"
                aria-label="Drop to delete take"
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform duration-150 ${
                    dragOverDelete
                      ? 'scale-110 border-white/80 bg-red-600 shadow-[0_0_24px_rgba(239,68,68,0.55)]'
                      : 'border-red-300/50 bg-red-500/85 shadow-lg'
                  }`}
                >
                  <Trash2 className="h-6 w-6 text-white" strokeWidth={2.25} />
                </div>
              </div>
            ) : (
              <RecordingModeCarousel
                value={recordingMode}
                onChange={onRecordingModeChange}
                onToggleRecord={onToggleRecord}
                isRecording={isRecording}
                ready={ready}
              />
            )}
          </div>

          {autoSoundListening && !isRecording && !showDeleteDrop && (
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
