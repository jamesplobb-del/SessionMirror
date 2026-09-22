import { reportFeatureAction } from '../utils/featureGuidance'
import VaultCount from './VaultCount'
import {
  Camera,
  ChevronDown,
  House,
  Layers3,
  Mic,
  Settings,
  Trash2,
  Grid2X2,
  Library,
  Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject, type ReactNode, memo } from 'react'
import SettingsBranchWheel from './SettingsBranchWheel'
import RecordingModeCarousel from './RecordingModeCarousel'
import Pressable from './ui/Pressable'
import type { RecordingMode } from '../types'
import { resolveHandsFreePhase } from '../utils/handsFreePhase'
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
  openLens?: boolean
  /** Show the return to recording action while viewing full-size tools. */
  toolsActive?: boolean
  /** Alternate reviewed dock: Library above Record, Settings in the last slot. */
  workspaceSections?: boolean
  libraryAboveRecord?: boolean
  onOpenTools?: () => void
  onOpenAudioRecorder?: () => void
  /** The recorder the Tools return button goes back to — Tools itself is always audio. */
  toolsReturnMode?: RecordingMode
  onOpenReferences?: () => void
  vaultRevision?: number
  onOpenVault?: () => void
  onOpenSettings: () => void
  expandViewActive?: boolean
  onToggleExpandView?: () => void
  onOpenMultitrack?: () => void
  referenceControls?: ReactNode
  handsFreeRecording?: boolean
  handsFreeListeningReady?: boolean
  handsFreePlaybackPending?: boolean
  handsFreePlaybackPlaying?: boolean
  handsFreeReplayCountdown?: number | null
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
  showMusic?: boolean
  musicToggleVisible?: boolean
  onShowMusicChange?: (show: boolean) => void
  /** Saved desks shown as chips at the top of the Workspace tray. */
  desks?: WorkspaceDesk[]
  activeDeskId?: string | null
  liveDeskSummary?: string
  onApplyDesk?: (deskId: string) => void
  onSaveDesk?: (name: string) => void
  onDeleteDesk?: (deskId: string) => void
  /** One breath of the record button after Current finishes playing back. */
  againPulse?: boolean
  audioEnhancerToggleVisible?: boolean
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
  openLens = false,
  toolsActive = false,
  libraryAboveRecord = false,
  workspaceSections = false,
  onOpenTools,
  onOpenAudioRecorder,
  toolsReturnMode = 'audio',
  onOpenReferences,
  onOpenVault,
  vaultRevision,
  onOpenSettings,
  expandViewActive = false,
  onToggleExpandView,
  onOpenMultitrack,
  referenceControls,
  handsFreeRecording = false,
  handsFreeListeningReady = false,
  handsFreePlaybackPending = false,
  handsFreePlaybackPlaying,
  handsFreeReplayCountdown,
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
  showMusic = false,
  musicToggleVisible = false,
  onShowMusicChange,
  desks,
  activeDeskId = null,
  liveDeskSummary = '',
  onApplyDesk,
  onSaveDesk,
  onDeleteDesk,
  againPulse = false,
  audioEnhancerToggleVisible = true,
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
    playbackPlaying: handsFreePlaybackPlaying,
    replayCountdown: handsFreeReplayCountdown,
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
    <Pressable
      type="button"
      intensity="icon"
      data-tutorial="settings-button"
      className={`control-deck__settings-btn ${
        isCameraPresentation
          ? 'camera-control-deck__settings-btn'
          : 'audio-control-deck__settings-btn'
      } flex h-11 w-11 items-center justify-center rounded-full ${HUD_SOLID_BTN} bg-black/40 text-white hover:bg-black/55`}
      aria-label="Open settings"
      haptic="light"
      hapticFeedback={hapticFeedback}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (!settingsBranchDisabled) onOpenSettings()
      }}
    >
      <span className="ui-orient-spin flex items-center justify-center">
        <span className="flex items-center justify-center">
          <span className="electric-original-icon"><Settings className="h-5 w-5" strokeWidth={1.9} /></span><ElectricControlIcon kind="settings" />
        </span>
      </span>
    </Pressable>
  )

  const recordStage = (
    <div
      className={`ui-orient-spin control-deck__record-stack flex flex-col items-center gap-1 ${
        isCameraPresentation
          ? 'camera-control-deck__record-stack'
          : 'audio-control-deck__record-stack'
      }`}
    >
      {openLens && libraryAboveRecord && onOpenVault && !isRecording && !isStopping && (
        <Pressable className="open-lens-library-shortcut" onClick={() => { reportFeatureAction('take-library-opened'); onOpenVault() }} hapticFeedback={hapticFeedback} aria-label="Open Take library" title="Library"><Library aria-hidden /></Pressable>
      )}
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
            minimalRecord={openLens}
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
      className={`control-deck ${openLens ? 'open-lens-deck' : ''} pointer-events-auto flex w-full flex-col items-center px-4 ${
        collapsible ? 'control-deck--collapsible' : ''
      } ${isCameraPresentation ? 'control-deck--camera' : ''} ${
        // Reserves the strip the elapsed timer now sits in, below the record
        // button. Only while recording, so the deck is not permanently short.
        isRecording && !handsFreeRecording ? 'control-deck--timer-below' : ''
      }`}
    >
      {onOpenVault && !openLens && !isRecording && !isStopping && (
        <VaultHandle onOpen={onOpenVault} revision={vaultRevision} concealed={branchActive} />
      )}
      <SettingsBranchWheel
        open={branchOpen}
        onClose={closeBranch}
        onExitComplete={handleBranchExitComplete}
        anchorRef={overlaysButtonRef}
        pitchTrackerEnabled={pitchTrackerEnabled}
        showTakeCards={showTakeCards}
        showMetronome={showMetronome}
        audioEnhancerToggleVisible={audioEnhancerToggleVisible}
        audioEnhancerEnabled={audioEnhancerEnabled}
        handsFreeEnabled={autoSoundRecording}
        handsFreeToggleVisible={Boolean(onAutoSoundRecordingChange)}
        handsFreeToggleDisabled={isRecording || isStopping}
        onHandsFreeChange={onAutoSoundRecordingChange}
        layoutMode={settingsLayoutMode}
        metronomeToggleVisible={metronomeToggleVisible}
        showDrone={showDrone}
        droneToggleVisible={droneToggleVisible}
        onShowDroneChange={(show) => onShowDroneChange?.(show)}
        showMusic={showMusic}
        musicToggleVisible={musicToggleVisible}
        onShowMusicChange={onShowMusicChange}
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
        workspaceSections={workspaceSections}
        workspaceActionsVisible={(workspaceSections || isCameraPresentation) && !isRecording && !isStopping}
        onToggleExpandView={onToggleExpandView}
        onOpenMultitrack={onOpenMultitrack}
        onOpenReferences={onOpenReferences}
        onPitchTrackerChange={(enabled) => onPitchTrackerChange?.(enabled)}
        onShowTakeCardsChange={(show) => onShowTakeCardsChange?.(show)}
        onShowMetronomeChange={(show) => onShowMetronomeChange?.(show)}
        onAudioEnhancerChange={(enabled) => onAudioEnhancerChange?.(enabled)}
        onTunerTakePillsChange={(show) => onTunerTakePillsChange?.(show)}
      />

      {referenceControls}
      {openLens ? (
        <div className="open-lens-dock">
          <Pressable className="open-lens-dock-action" onClick={onOpenHome} disabled={isRecording || isStopping} hapticFeedback={hapticFeedback} data-tutorial="home-button" aria-label="Open Practice Home"><House aria-hidden /><span>Home</span></Pressable>
          <Pressable ref={overlaysButtonRef} className="open-lens-dock-action" onClick={() => branchActive ? closeBranch() : openBranch()} disabled={settingsBranchDisabled || isRecording || isStopping} hapticFeedback={hapticFeedback} data-tutorial="overlays-button" aria-label={branchActive ? 'Close workspace' : 'Open workspace'} aria-expanded={branchActive}><Grid2X2 aria-hidden /><span>Workspace</span></Pressable>
          {recordStage}
          <Pressable className="open-lens-dock-action" onClick={toolsActive ? onOpenAudioRecorder : onOpenTools} disabled={isRecording || isStopping} hapticFeedback={hapticFeedback} data-tutorial="practice-button" aria-label={toolsActive ? 'Back to record and compare' : 'Open Tools'}>{toolsActive ? (toolsReturnMode === 'video' ? <Camera aria-hidden /> : <Mic aria-hidden />) : <Wrench aria-hidden />}<span>{toolsActive ? 'Compare' : 'Tools'}</span></Pressable>
          {libraryAboveRecord ? <Pressable className="open-lens-dock-action" onClick={onOpenSettings} disabled={isRecording || isStopping} hapticFeedback={hapticFeedback} aria-label="Open settings"><Settings aria-hidden /><span>Settings</span></Pressable> : <Pressable className="open-lens-dock-action" onClick={() => { reportFeatureAction('take-library-opened'); onOpenVault?.() }} disabled={isRecording || isStopping} hapticFeedback={hapticFeedback} data-guidance="take-library" aria-label="Open Take library"><Library aria-hidden /><span>Library</span></Pressable>}
        </div>
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
                <span className="electric-original-icon"><House aria-hidden strokeWidth={1.85} /></span><ElectricControlIcon kind="home" />
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
                <span className="electric-original-icon"><Layers3 aria-hidden className="camera-overlays-button__icon" /></span><ElectricControlIcon kind="workspace" />
                <span>Workspace</span>
              </span>
            </Pressable>

            {recordStage}

            <Pressable
              type="button"
              intensity="soft"
              squish={false}
              haptic="rigid"
              hapticFeedback={hapticFeedback}
              data-tutorial="practice-button"
              className="camera-pill-action camera-practice-button pointer-events-auto"
              disabled={isRecording || isStopping}
              onClick={() => {
                onRecordingModeChange('audio')
              }}
              aria-label="Open Tools"
            >
              <span className="ui-orient-spin camera-pill-action__content">
                <span className="electric-original-icon"><PracticeWaveformIcon /></span><ElectricControlIcon kind="tools" />
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
                <span className="electric-original-icon"><House aria-hidden strokeWidth={1.85} /></span><ElectricControlIcon kind="home" />
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
                <span className="electric-original-icon"><Layers3 aria-hidden className="audio-overlays-button__icon" /></span><ElectricControlIcon kind="workspace" />
                <span>Workspace</span>
              </span>
            </Pressable>

            {recordStage}

            <Pressable
              type="button"
              intensity="soft"
              squish={false}
              haptic="rigid"
              hapticFeedback={hapticFeedback}
              className="audio-camera-button pointer-events-auto"
              disabled={isRecording || isStopping}
              onClick={() => {
                if (onOpenAudioRecorder) onOpenAudioRecorder()
                else onRecordingModeChange('video')
              }}
              aria-label={onOpenAudioRecorder ? 'Open audio recorder' : 'Open Camera'}
            >
              <span className="ui-orient-spin audio-camera-button__content">
                {onOpenAudioRecorder ? <Mic aria-hidden strokeWidth={1.75} /> : <><span className="electric-original-icon"><Camera aria-hidden strokeWidth={1.75} /></span><ElectricControlIcon kind="camera" /></>}
                <span>{onOpenAudioRecorder ? 'Compare' : 'Camera'}</span>
              </span>
            </Pressable>

            {settingsButton}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The takes grabber.
 *
 * Just the bar now — no label, no "swipe up". The strip of text was the tallest
 * thing between the record button and the bottom of the screen, and it was
 * explaining a gesture that the tap underneath it already covers. A grabber is
 * the shape iOS uses for "there is a sheet under here", so it needs no words,
 * and losing them lets the whole deck sit lower and gives the pitch graph
 * above it the room back.
 */
function VaultHandle({ onOpen, revision, concealed = false }: { onOpen: () => void; revision?: number; concealed?: boolean }) {
  return (
    <button
      type="button"
      data-guidance="take-library" className="take-vault-handle"
      style={{ visibility: concealed ? 'hidden' : undefined }}
      aria-hidden={concealed || undefined}
      tabIndex={concealed ? -1 : undefined}
      aria-label="Open Take library"
      onClick={() => { reportFeatureAction('take-library-opened'); onOpen() }}
    >
      <i aria-hidden />
      <span className="electric-vault-label"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="5" rx="2"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4"/></svg>Take library<VaultCount revision={revision} /><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg></span>
    </button>
  )
}

export default memo(ControlDeck)

// Alternative icon artwork for the Electric review copy only.
function ElectricControlIcon({ kind }: { kind: 'home' | 'workspace' | 'tools' | 'camera' | 'settings' }) {
  return <svg className="electric-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'home' && <><path d="M3 10.5 10.6 4a2.1 2.1 0 0 1 2.8 0l7.6 6.5M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" fill="currentColor" fillOpacity=".10"/><path d="M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"/></>}
    {kind === 'workspace' && <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 10v10"/></>}
    {kind === 'camera' && <><path d="M8 6 9.5 3.5h5L16 6h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" fill="currentColor" fillOpacity=".10"/><circle cx="12" cy="13" r="4"/><path d="M17.5 9h.01" strokeWidth="2.5"/></>}
    {kind === 'tools' && <><path d="M14 4a6 6 0 0 0-7 7L3.5 16.5a2.8 2.8 0 0 0 4 4L13 15a6 6 0 0 0 7-7l-4 4-4-4 4-4Z" fill="currentColor" fillOpacity=".12"/><path d="m6 18 .01-.01" strokeWidth="2.5"/></>}
    {kind === 'settings' && <><path d="m9.5 3-.6 2.2-1.5.9-2.2-.5L2.7 10l1.6 1.6v1.8L2.7 15l2.5 4.4 2.2-.5 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.5 2.5-4.4-1.6-1.6v-1.8l1.6-1.6-2.5-4.4-2.2.5-1.5-.9-.6-2.2Z" fill="currentColor" fillOpacity=".10" transform="translate(0 -0.5)"/><circle cx="12" cy="12" r="3.3"/></>}

  </svg>
}
