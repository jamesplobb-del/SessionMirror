import { AnimatePresence, motion } from 'framer-motion'
import { ListMusic, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type RefObject, memo } from 'react'
import { useLongPress } from '../hooks/useLongPress'
import SettingsBranchWheel from './SettingsBranchWheel'
import RecordingModeCarousel from './RecordingModeCarousel'
import Pressable from './ui/Pressable'
import type { RecordingMode } from '../types'
import { HUD_SOLID_BTN } from '../utils/interactiveUx'

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
  isVaultOpen?: boolean
  vaultToggleEnabled?: boolean
  autoSoundListening?: boolean
  handsFreeRecording?: boolean
  handsFreePlaybackPending?: boolean
  autoSoundRecording?: boolean
  onAutoSoundRecordingChange?: (enabled: boolean) => void
  recordDropRef?: RefObject<HTMLDivElement | null>
  dragDeleteActive?: boolean
  dragOverDelete?: boolean
  pitchTrackerEnabled?: boolean
  showTakeCards?: boolean
  showMetronome?: boolean
  audioEnhancerEnabled?: boolean
  pitchToggleVisible?: boolean
  onPitchTrackerChange?: (enabled: boolean) => void
  onShowTakeCardsChange?: (show: boolean) => void
  onShowMetronomeChange?: (show: boolean) => void
  onAudioEnhancerChange?: (enabled: boolean) => void
  settingsBranchDisabled?: boolean
  onBranchOpenChange?: (open: boolean) => void
  hapticFeedback?: boolean
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function ControlDeck({
  isRecording,
  elapsed,
  ready,
  recordingMode,
  onRecordingModeChange,
  onToggleRecord,
  onOpenVault,
  onOpenSettings,
  takeCount,
  isVaultOpen = false,
  vaultToggleEnabled = false,
  autoSoundListening = false,
  handsFreeRecording = false,
  handsFreePlaybackPending = false,
  autoSoundRecording = false,
  onAutoSoundRecordingChange,
  recordDropRef,
  dragDeleteActive = false,
  dragOverDelete = false,
  pitchTrackerEnabled = false,
  showTakeCards = true,
  showMetronome = false,
  audioEnhancerEnabled = false,
  pitchToggleVisible = true,
  onPitchTrackerChange,
  onShowTakeCardsChange,
  onShowMetronomeChange,
  onAudioEnhancerChange,
  settingsBranchDisabled = false,
  onBranchOpenChange,
  hapticFeedback = true,
}: ControlDeckProps) {
  const showDeleteDrop = dragDeleteActive && !isRecording
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchActive, setBranchActive] = useState(false)

  const openBranch = () => {
    setBranchOpen(true)
    setBranchActive(true)
    onBranchOpenChange?.(true)
  }

  const closeBranch = () => {
    setBranchOpen(false)
  }

  const handleBranchExitComplete = () => {
    setBranchActive(false)
    onBranchOpenChange?.(false)
  }

  useEffect(() => {
    if (settingsBranchDisabled && branchOpen) {
      setBranchOpen(false)
    }
  }, [branchOpen, settingsBranchDisabled])

  const settingsPress = useLongPress({
    onClick: () => {
      if (branchActive) {
        closeBranch()
        return
      }
      onOpenSettings()
    },
    onLongPress: () => openBranch(),
    disabled: settingsBranchDisabled,
    hapticFeedback,
    targetRef: settingsButtonRef,
  })

  const { onClickCapture, ...settingsPressHandlers } = settingsPress

  return (
    <div className="control-deck pointer-events-auto flex w-full flex-col items-center px-4">
      <SettingsBranchWheel
        open={branchOpen}
        onClose={closeBranch}
        onExitComplete={handleBranchExitComplete}
        anchorRef={settingsButtonRef}
        pitchTrackerEnabled={pitchTrackerEnabled}
        showTakeCards={showTakeCards}
        showMetronome={showMetronome}
        audioEnhancerEnabled={audioEnhancerEnabled}
        pitchToggleVisible={pitchToggleVisible}
        takeCardsToggleVisible={recordingMode !== 'audio'}
        onPitchTrackerChange={(enabled) => onPitchTrackerChange?.(enabled)}
        onShowTakeCardsChange={(show) => onShowTakeCardsChange?.(show)}
        onShowMetronomeChange={(show) => onShowMetronomeChange?.(show)}
        onAudioEnhancerChange={(enabled) => onAudioEnhancerChange?.(enabled)}
      />

      <div className="control-deck__main-row relative flex w-full max-w-xs items-center justify-center">
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          onClick={onOpenVault}
          haptic="light"
          hapticFeedback={hapticFeedback}
          data-tutorial="vault-button"
          className={`control-deck__vault-btn pointer-events-auto absolute left-0 flex h-11 w-11 items-center justify-center rounded-full ${HUD_SOLID_BTN}`}
          aria-label={
            vaultToggleEnabled && isVaultOpen
              ? 'Close take vault'
              : `View takes${takeCount > 0 ? `, ${takeCount} saved` : ''}`
          }
        >
          <span className="relative flex h-full w-full items-center justify-center">
            <ListMusic className="h-[1.18rem] w-[1.18rem]" strokeWidth={2.25} />
            {takeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/90 px-1 text-[9px] font-semibold text-stone-900">
                {takeCount > 99 ? '99+' : takeCount}
              </span>
            )}
          </span>
        </Pressable>

        <button
          type="button"
          ref={settingsButtonRef}
          data-tutorial="settings-button"
          className={`control-deck__settings-btn absolute right-0 flex h-11 w-11 items-center justify-center rounded-full ${HUD_SOLID_BTN} ${
            branchActive
              ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.3)]'
              : 'bg-black/40 text-white hover:bg-black/55'
          }`}
          aria-label={
            branchActive ? 'Close quick settings' : 'Open settings. Long press for quick settings.'
          }
          aria-expanded={branchActive}
          aria-haspopup="menu"
          onContextMenu={(event) => event.preventDefault()}
          onClickCapture={onClickCapture}
          {...settingsPressHandlers}
        >
          <span className="ui-orient-spin flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {branchActive ? (
                <motion.span
                  key="close"
                  initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="flex items-center justify-center"
                >
                  <X className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="settings"
                  initial={{ opacity: 0, rotate: 45, scale: 0.8 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: -45, scale: 0.8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className="flex items-center justify-center"
                >
                  <SlidersHorizontal className="h-5 w-5" strokeWidth={2.15} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </button>

        <div className="ui-orient-spin flex flex-col items-center gap-1">
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
                autoSoundRecording={autoSoundRecording}
                hapticFeedback={hapticFeedback}
                onAutoSoundRecordingChange={onAutoSoundRecordingChange}
              />
            )}
          </div>

          {autoSoundListening && !isRecording && !showDeleteDrop && (
            <p className="auto-sound-hint auto-sound-hint--listening max-w-[14rem] text-center text-[11px] font-medium leading-snug tracking-wide text-white/90">
              Listening for your playing — a take starts automatically when you begin
            </p>
          )}

          {handsFreeRecording && isRecording && !showDeleteDrop && (
            <p className="auto-sound-hint auto-sound-hint--recording max-w-[14rem] text-center text-[11px] font-medium leading-snug tracking-wide text-white/88">
              Recording hands-free — playback starts when you stop playing
            </p>
          )}

          {handsFreePlaybackPending && !isRecording && !showDeleteDrop && (
            <p className="auto-sound-hint auto-sound-hint--playback max-w-[14rem] text-center text-[11px] font-medium leading-snug tracking-wide text-emerald-200/90">
              Playing your take back…
            </p>
          )}

          {isRecording && !handsFreeRecording && (
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

export default memo(ControlDeck)
