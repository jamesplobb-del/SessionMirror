import {
  Camera,
  ChevronDown,
  Layers3,
  ListMusic,
  Mic,
  Settings,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject, memo } from 'react'
import SettingsBranchWheel from './SettingsBranchWheel'
import RecordingModeCarousel, { type HandsFreePhase } from './RecordingModeCarousel'
import Pressable from './ui/Pressable'
import type { RecordingMode } from '../types'
import { triggerModeSwitchHaptic } from '../utils/haptics'
import { HUD_SOLID_BTN } from '../utils/interactiveUx'
import type { SettingsBranchLayoutMode } from '../utils/settingsBranchLayout'
import { useTutorialAction } from '../context/TutorialContext'

interface ControlDeckProps {
  isRecording: boolean
  isStopping?: boolean
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
  handsFreeRecording?: boolean
  handsFreeListeningReady?: boolean
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
  settingsLayoutMode?: SettingsBranchLayoutMode
  tunerTakePillsVisible?: boolean
  tunerTakePillsToggleVisible?: boolean
  onTunerTakePillsChange?: (show: boolean) => void
  settingsBranchDisabled?: boolean
  onBranchOpenChange?: (open: boolean) => void
  hapticFeedback?: boolean
  collapsible?: boolean
  collapseKey?: string
  onExpandedChange?: (expanded: boolean) => void
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function PracticeWaveformIcon() {
  return (
    <svg
      viewBox="0 0 32 24"
      className="camera-practice-button__waveform"
      fill="none"
      aria-hidden
    >
      <path d="M4 10v4M9 6v12M14 2v20M19 5v14M24 8v8M29 10v4" />
    </svg>
  )
}

function ControlDeck({
  isRecording,
  isStopping = false,
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
  handsFreeRecording = false,
  handsFreeListeningReady = false,
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
  settingsLayoutMode = 'camera',
  tunerTakePillsVisible = false,
  tunerTakePillsToggleVisible = false,
  onTunerTakePillsChange,
  settingsBranchDisabled = false,
  onBranchOpenChange,
  hapticFeedback = true,
  collapsible = false,
  collapseKey,
  onExpandedChange,
}: ControlDeckProps) {
  const showDeleteDrop = dragDeleteActive && !isRecording
  const showFinishingTake = isStopping && recordingMode === 'video' && !showDeleteDrop
  const handsFreePhase: HandsFreePhase | null =
    autoSoundRecording && !showDeleteDrop && !showFinishingTake
      ? handsFreePlaybackPending && !isRecording
        ? 'playback'
        : isRecording
        ? 'recording'
        : handsFreeListeningReady
        ? 'listening'
        : 'preparing'
      : null
  const overlaysButtonRef = useRef<HTMLButtonElement>(null)
  const notifyTutorial = useTutorialAction()
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchActive, setBranchActive] = useState(false)
  const [deckExpanded, setDeckExpanded] = useState(!collapsible)
  const isCameraPresentation = recordingMode === 'video'

  useEffect(() => {
    const expanded = !collapsible
    setDeckExpanded(expanded)
    onExpandedChange?.(expanded)
  }, [collapsible, collapseKey, onExpandedChange])

  const setExpanded = (expanded: boolean) => {
    setDeckExpanded(expanded)
    onExpandedChange?.(expanded)
  }

  const openBranch = () => {
    setBranchOpen(true)
    setBranchActive(true)
    onBranchOpenChange?.(true)
    notifyTutorial?.('overlays-opened')
  }

  const closeBranch = () => {
    setBranchOpen(false)
    notifyTutorial?.('overlays-closed')
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

  const settingsButton = (
    <button
      type="button"
      data-tutorial="settings-button"
      className={`control-deck__settings-btn ${
        isCameraPresentation
          ? 'camera-control-deck__settings-btn'
          : 'audio-control-deck__settings-btn'
      } flex h-11 w-11 items-center justify-center rounded-full ${HUD_SOLID_BTN} bg-black/40 text-white hover:bg-black/55`}
      aria-label="Open settings"
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (!settingsBranchDisabled) onOpenSettings()
      }}
    >
      <span className="ui-orient-spin flex items-center justify-center">
        <span className="flex items-center justify-center">
          <Settings className="h-5 w-5" strokeWidth={1.9} />
        </span>
      </span>
    </button>
  )

  const recordStage = (
    <div
      className={`ui-orient-spin control-deck__record-stack flex flex-col items-center gap-1 ${
        isCameraPresentation
          ? 'camera-control-deck__record-stack'
          : 'audio-control-deck__record-stack'
      }`}
    >
      <div
        ref={recordDropRef}
        className={`record-delete-drop ${
          isCameraPresentation ? 'record-delete-drop--camera' : ''
        } ${showDeleteDrop ? 'record-delete-drop--active' : ''} ${
          dragOverDelete ? 'record-delete-drop--hover' : ''
        }`}
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
        ) : showFinishingTake ? (
          <div
            className="record-carousel-viewport flex items-center justify-center pointer-events-none"
            role="status"
            aria-live="polite"
            aria-label="Finishing take"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/16 bg-black/45 shadow-[0_0_24px_rgba(255,255,255,0.16)] backdrop-blur-xl">
              <span
                className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white"
                aria-hidden
              />
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
            handsFreePhase={handsFreePhase ?? undefined}
            hapticFeedback={hapticFeedback}
            onAutoSoundRecordingChange={onAutoSoundRecordingChange}
            presentation={isCameraPresentation ? 'camera' : 'audio'}
          />
        )}
      </div>

      {showFinishingTake && (
        <p className="auto-sound-hint auto-sound-hint--finishing max-w-[14rem] text-center text-[11px] font-medium leading-snug tracking-wide text-white/90">
          Finishing your take… longer videos can take a moment
        </p>
      )}

      <div
        className={`hands-free-status ${
          handsFreePhase ? `hands-free-status--${handsFreePhase}` : ''
        }`}
        role="status"
        aria-live="polite"
        aria-atomic
        aria-hidden={!handsFreePhase}
      >
        <span className="hands-free-status__dot" aria-hidden />
        <span className="hands-free-status__copy">
          <strong>
            {handsFreePhase === 'recording'
              ? 'Recording'
              : handsFreePhase === 'playback'
              ? 'Playing back'
              : handsFreePhase === 'preparing'
              ? 'Getting ready'
              : 'Listening'}
          </strong>
          <small>
            {handsFreePhase === 'recording'
              ? 'Take in progress'
              : handsFreePhase === 'playback'
              ? 'Listen, then play again'
              : handsFreePhase === 'preparing'
              ? 'Connecting microphone'
              : 'Play when you’re ready'}
          </small>
        </span>
      </div>

      {isRecording && !handsFreeRecording && (
        <span
          className="recording-elapsed text-xs font-medium tabular-nums tracking-wide text-white/90"
          aria-live="polite"
        >
          {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  )

  return (
    <div
      className={`control-deck pointer-events-auto flex w-full flex-col items-center px-4 ${
        collapsible ? 'control-deck--collapsible' : ''
      } ${isCameraPresentation ? 'control-deck--camera' : ''}`}
    >
      <SettingsBranchWheel
        open={branchOpen}
        onClose={closeBranch}
        onExitComplete={handleBranchExitComplete}
        anchorRef={overlaysButtonRef}
        pitchTrackerEnabled={pitchTrackerEnabled}
        showTakeCards={showTakeCards}
        showMetronome={showMetronome}
        audioEnhancerEnabled={audioEnhancerEnabled}
        layoutMode={settingsLayoutMode}
        tunerTakePillsVisible={tunerTakePillsVisible}
        tunerTakePillsToggleVisible={tunerTakePillsToggleVisible}
        pitchToggleVisible={pitchToggleVisible}
        takeCardsToggleVisible={recordingMode !== 'audio'}
        onPitchTrackerChange={(enabled) => onPitchTrackerChange?.(enabled)}
        onShowTakeCardsChange={(show) => onShowTakeCardsChange?.(show)}
        onShowMetronomeChange={(show) => onShowMetronomeChange?.(show)}
        onAudioEnhancerChange={(enabled) => onAudioEnhancerChange?.(enabled)}
        onTunerTakePillsChange={(show) => onTunerTakePillsChange?.(show)}
      />

      {isCameraPresentation ? (
        <div className="camera-control-deck__main-row">
          <div className="camera-control-pill">
            <Pressable
              type="button"
              intensity="icon"
              squish={false}
              onClick={onOpenVault}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="vault-button"
              className="control-deck__vault-btn camera-vault-button pointer-events-auto"
              aria-label={`Open Take Vault${takeCount > 0 ? `, ${takeCount} saved` : ''}`}
            >
              <span className="ui-orient-spin camera-vault-button__icon-wrap">
                <ListMusic aria-hidden strokeWidth={1.85} />
                {takeCount > 0 && (
                  <span className="camera-vault-button__badge">
                    {takeCount > 99 ? '99+' : takeCount}
                  </span>
                )}
              </span>
            </Pressable>

            <Pressable
              ref={overlaysButtonRef}
              type="button"
              intensity="soft"
              squish={false}
              onClick={() => {
                if (branchActive) {
                  closeBranch()
                  return
                }
                openBranch()
              }}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="overlays-button"
              className="camera-pill-action camera-overlays-button pointer-events-auto"
              disabled={settingsBranchDisabled}
              aria-label={branchActive ? 'Close overlays' : 'Open overlays'}
              aria-expanded={branchActive}
              aria-haspopup="menu"
            >
              <span className="ui-orient-spin camera-pill-action__content">
                <Layers3 aria-hidden className="camera-overlays-button__icon" />
                <span>Overlays</span>
              </span>
            </Pressable>

            {recordStage}

            <Pressable
              type="button"
              intensity="soft"
              squish={false}
              haptic={false}
              hapticFeedback={hapticFeedback}
              data-tutorial="practice-button"
              className="camera-pill-action camera-practice-button pointer-events-auto"
              disabled={isRecording || isStopping}
              onClick={() => {
                triggerModeSwitchHaptic(hapticFeedback)
                onRecordingModeChange('audio')
              }}
              aria-label="Open Practice"
            >
              <span className="ui-orient-spin camera-pill-action__content">
                <PracticeWaveformIcon />
                <span>Practice</span>
              </span>
            </Pressable>

            {settingsButton}
          </div>
        </div>
      ) : collapsible && !deckExpanded ? (
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          haptic="light"
          hapticFeedback={hapticFeedback}
          className="control-deck__expand-trigger"
          onClick={() => setExpanded(true)}
          aria-label="Show recording controls"
          aria-expanded={false}
        >
          <Mic aria-hidden strokeWidth={2.15} />
        </Pressable>
      ) : (
        <div
          className={`audio-control-deck__main-row ${
            collapsible ? 'audio-control-deck__main-row--collapsible' : ''
          }`}
        >
          {collapsible ? (
            <Pressable
              type="button"
              intensity="icon"
              squish={false}
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="control-deck__collapse-trigger"
              onClick={() => setExpanded(false)}
              aria-label="Hide recording controls"
              aria-expanded
            >
              <ChevronDown aria-hidden />
            </Pressable>
          ) : null}
          <div className="audio-control-pill">
            <Pressable
              type="button"
              intensity="icon"
              squish={false}
              onClick={onOpenVault}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="vault-button"
              className="control-deck__vault-btn audio-vault-button pointer-events-auto"
              aria-label={
                vaultToggleEnabled && isVaultOpen
                  ? 'Close take vault'
                  : `View takes${takeCount > 0 ? `, ${takeCount} saved` : ''}`
              }
            >
              <span className="ui-orient-spin audio-vault-button__icon-wrap">
                <ListMusic aria-hidden strokeWidth={1.85} />
                {takeCount > 0 && (
                  <span className="audio-vault-button__badge">
                    {takeCount > 99 ? '99+' : takeCount}
                  </span>
                )}
              </span>
            </Pressable>

            <Pressable
              ref={overlaysButtonRef}
              type="button"
              intensity="soft"
              squish={false}
              onClick={() => {
                if (branchActive) {
                  closeBranch()
                  return
                }
                openBranch()
              }}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="overlays-button"
              className="audio-pill-action audio-overlays-button pointer-events-auto"
              disabled={settingsBranchDisabled}
              aria-label={branchActive ? 'Close overlays' : 'Open overlays'}
              aria-expanded={branchActive}
              aria-haspopup="menu"
            >
              <span className="ui-orient-spin audio-pill-action__content">
                <Layers3 aria-hidden className="audio-overlays-button__icon" />
                <span>Overlays</span>
              </span>
            </Pressable>

            {recordStage}

            <Pressable
              type="button"
              intensity="soft"
              squish={false}
              haptic={false}
              hapticFeedback={hapticFeedback}
              className="audio-camera-button pointer-events-auto"
              disabled={isRecording || isStopping}
              onClick={() => {
                triggerModeSwitchHaptic(hapticFeedback)
                onRecordingModeChange('video')
              }}
              aria-label="Open Camera"
            >
              <span className="ui-orient-spin audio-camera-button__content">
                <Camera aria-hidden strokeWidth={1.75} />
                <span>Camera</span>
              </span>
            </Pressable>

            {settingsButton}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ControlDeck)
