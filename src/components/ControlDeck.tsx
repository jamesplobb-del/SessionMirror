import {
  Camera,
  Check,
  ChevronDown,
  House,
  Layers3,
  MessageSquareText,
  Mic,
  RotateCcw,
  ScanSearch,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject, memo } from 'react'
import SettingsBranchWheel from './SettingsBranchWheel'
import RecordingModeCarousel from './RecordingModeCarousel'
import Pressable from './ui/Pressable'
import StarRating from './StarRating'
import type { RecordingMode } from '../types'
import { resolveHandsFreePhase } from '../utils/handsFreePhase'
import { triggerModeSwitchHaptic } from '../utils/haptics'
import { HUD_SOLID_BTN } from '../utils/interactiveUx'
import type { SettingsBranchLayoutMode } from '../utils/settingsBranchLayout'
import type { WorkspaceDesk } from '../utils/workspaceDesks'
import { useTutorialAction } from '../context/TutorialContext'

interface ControlDeckProps {
  isRecording: boolean
  isStopping?: boolean
  elapsed: number
  ready: boolean
  recordingMode: RecordingMode
  onRecordingModeChange: (mode: RecordingMode) => void
  onToggleRecord: () => void
  onOpenHome: () => void
  onOpenSettings: () => void
  expandViewActive?: boolean
  onToggleExpandView?: () => void
  onOpenMultitrack?: () => void
  focusedPostTakeActive?: boolean
  focusedPostTakeReviewed?: boolean
  focusedPostTakeHasNote?: boolean
  focusedPostTakeRating?: number
  focusedRecordingGoal?: string
  onFocusedPostTakeReview?: () => void
  onFocusedPostTakeNote?: () => void
  onFocusedPostTakeRate?: (rating: number) => void
  onFocusedPostTakeRetry?: () => void
  onFocusedPostTakeDismiss?: () => void
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
  metronomeToggleVisible?: boolean
  showDrone?: boolean
  droneToggleVisible?: boolean
  onShowDroneChange?: (show: boolean) => void
  /** Saved desks shown as chips at the top of the Workspace tray. */
  desks?: WorkspaceDesk[]
  activeDeskId?: string | null
  liveDeskSummary?: string
  onApplyDesk?: (deskId: string) => void
  onSaveDesk?: (name: string) => void
  onDeleteDesk?: (deskId: string) => void
  /** One breath of the record button after Current finishes playing back. */
  againPulse?: boolean
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
  onOpenHome,
  onOpenSettings,
  expandViewActive = false,
  onToggleExpandView,
  onOpenMultitrack,
  focusedPostTakeActive = false,
  focusedPostTakeReviewed = false,
  focusedPostTakeHasNote = false,
  focusedPostTakeRating = 0,
  focusedRecordingGoal = '',
  onFocusedPostTakeReview,
  onFocusedPostTakeNote,
  onFocusedPostTakeRate,
  onFocusedPostTakeRetry,
  onFocusedPostTakeDismiss,
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
  metronomeToggleVisible = true,
  showDrone = false,
  droneToggleVisible = true,
  onShowDroneChange,
  desks,
  activeDeskId = null,
  liveDeskSummary = '',
  onApplyDesk,
  onSaveDesk,
  onDeleteDesk,
  againPulse = false,
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
  const handsFreePhase = resolveHandsFreePhase({
    autoSoundRecording,
    isRecording,
    handsFreePlaybackPending,
    handsFreeListeningReady,
    dragDeleteActive: showDeleteDrop,
    finishingTake: showFinishingTake,
  })
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
            againPulse={againPulse}
          />
        )}
      </div>

      {showFinishingTake && (
        <p className="auto-sound-hint auto-sound-hint--finishing max-w-[14rem] text-center text-[11px] font-medium leading-snug tracking-wide text-white/90">
          Finishing your take… longer videos can take a moment
        </p>
      )}

      {/* Status copy now lives in the full-screen HandsFreeStage overlay, so the
          deck keeps only the record control itself. */}

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
      } ${isCameraPresentation ? 'control-deck--camera' : ''} ${
        // Reserves the strip the elapsed timer now sits in, below the record
        // button. Only while recording, so the deck is not permanently short.
        isRecording && !handsFreeRecording ? 'control-deck--timer-below' : ''
      }`}
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
        handsFreeEnabled={autoSoundRecording}
        handsFreeToggleVisible={Boolean(onAutoSoundRecordingChange) && !isRecording}
        onHandsFreeChange={onAutoSoundRecordingChange}
        layoutMode={settingsLayoutMode}
        metronomeToggleVisible={metronomeToggleVisible}
        showDrone={showDrone}
        droneToggleVisible={droneToggleVisible}
        onShowDroneChange={(show) => onShowDroneChange?.(show)}
        desks={desks}
        activeDeskId={activeDeskId}
        liveDeskSummary={liveDeskSummary}
        onApplyDesk={onApplyDesk}
        onSaveDesk={onSaveDesk}
        onDeleteDesk={onDeleteDesk}
        hapticFeedback={hapticFeedback}
        tunerTakePillsVisible={tunerTakePillsVisible}
        tunerTakePillsToggleVisible={tunerTakePillsToggleVisible}
        pitchToggleVisible={pitchToggleVisible}
        takeCardsToggleVisible={recordingMode !== 'audio'}
        expandViewActive={expandViewActive}
        workspaceActionsVisible={isCameraPresentation && !isRecording && !isStopping}
        onToggleExpandView={onToggleExpandView}
        onOpenMultitrack={onOpenMultitrack}
        onPitchTrackerChange={(enabled) => onPitchTrackerChange?.(enabled)}
        onShowTakeCardsChange={(show) => onShowTakeCardsChange?.(show)}
        onShowMetronomeChange={(show) => onShowMetronomeChange?.(show)}
        onAudioEnhancerChange={(enabled) => onAudioEnhancerChange?.(enabled)}
        onTunerTakePillsChange={(show) => onTunerTakePillsChange?.(show)}
      />

      {isRecording && focusedRecordingGoal.trim() && (
        <div className="focused-recording-goal" role="status">
          <MessageSquareText aria-hidden />
          <span>Goal</span>
          <strong>{focusedRecordingGoal.trim()}</strong>
        </div>
      )}

      {focusedPostTakeActive && !isRecording && !isStopping ? (
        <section className="focused-post-take-dock" aria-label="Focused practice next steps">
          <header>
            <div>
              <span>Focused Practice</span>
              <strong>Take saved</strong>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              hapticFeedback={hapticFeedback}
              onClick={onFocusedPostTakeDismiss}
              aria-label="Done for now"
            >
              <X aria-hidden />
            </Pressable>
          </header>
          <div className="focused-post-take-rating">
            <StarRating
              rating={focusedPostTakeRating}
              onChange={(value) => onFocusedPostTakeRate?.(value)}
              size="md"
            />
          </div>
          <div className="focused-post-take-actions">
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className={focusedPostTakeReviewed ? 'is-complete' : 'is-recommended'}
              onClick={onFocusedPostTakeReview}
            >
              {focusedPostTakeReviewed ? <Check aria-hidden /> : <ScanSearch aria-hidden />}
              <span>Compare</span>
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className={focusedPostTakeHasNote ? 'is-complete' : ''}
              onClick={onFocusedPostTakeNote}
            >
              {focusedPostTakeHasNote ? <Check aria-hidden /> : <MessageSquareText aria-hidden />}
              <span>Note</span>
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              className="is-primary"
              onClick={onFocusedPostTakeRetry}
            >
              <RotateCcw aria-hidden />
              <span>Try again</span>
            </Pressable>
          </div>
        </section>
      ) : isCameraPresentation ? (
        <div className="camera-control-deck__main-row">
          <div className="camera-control-pill">
            <Pressable
              type="button"
              intensity="icon"
              squish={false}
              onClick={onOpenHome}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="home-button"
              className="control-deck__vault-btn camera-vault-button pointer-events-auto"
              aria-label="Open Practice Home"
            >
              <span className="ui-orient-spin camera-vault-button__icon-wrap">
                <House aria-hidden strokeWidth={1.85} />
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
              aria-label={branchActive ? 'Close workspace' : 'Open workspace'}
              aria-expanded={branchActive}
              aria-haspopup="menu"
            >
              <span className="ui-orient-spin camera-pill-action__content">
                <Layers3 aria-hidden className="camera-overlays-button__icon" />
                <span>Workspace</span>
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
              aria-label="Open Tools"
            >
              <span className="ui-orient-spin camera-pill-action__content">
                <PracticeWaveformIcon />
                <span>Tools</span>
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
              onClick={onOpenHome}
              haptic="light"
              hapticFeedback={hapticFeedback}
              data-tutorial="home-button"
              className="control-deck__vault-btn audio-vault-button pointer-events-auto"
              aria-label="Open Practice Home"
            >
              <span className="ui-orient-spin audio-vault-button__icon-wrap">
                <House aria-hidden strokeWidth={1.85} />
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
              aria-label={branchActive ? 'Close workspace' : 'Open workspace'}
              aria-expanded={branchActive}
              aria-haspopup="menu"
            >
              <span className="ui-orient-spin audio-pill-action__content">
                <Layers3 aria-hidden className="audio-overlays-button__icon" />
                <span>Workspace</span>
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
