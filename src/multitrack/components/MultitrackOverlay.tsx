import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, FileMusic, FolderOpen, Music4, Share2, Trash2, Video, VolumeX, Volume2 } from 'lucide-react'
import type { Take } from '../../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import { triggerLightHaptic } from '../../utils/haptics'
import { playTakeMediaAudible, primeTakePlaybackAudioSync } from '../../utils/takePlaybackAudio'
import { routeTakePlaybackToSpeaker } from '../../utils/takePlaybackSpeaker'
import {
  pauseYoutubeProxy,
  seekYoutubeProxy,
  setYoutubeProxyVolumeFromUi,
  startYoutubeProxyPlayback,
  wakeYoutubeReference,
} from '../../utils/playalong/youtubeBridge'
import Pressable from '../../components/ui/Pressable'
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet'
import { useActionSheet } from '../../context/ActionSheetContext'
import { useMultitrackSession } from '../state/useMultitrackSession'
import { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMultitrackRecording } from '../recording/useMultitrackRecording'
import { exportMultitrackSession, type MultitrackExportFailureReason } from '../export/multitrackExport'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from '../sheetMusic/sheetMusicUtils'
import MultitrackPanelGrid from './MultitrackPanelGrid'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackBackingTrackPanel, { MultitrackBackingMediaHost } from '../backing/MultitrackBackingTrackPanel'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import MultitrackRecordingStage from './MultitrackRecordingStage'

/** Sheets portal to document.body; the overlay itself sits at z-135. */
const MULTITRACK_SHEET_Z = { backdrop: 'z-[140]', sheet: 'z-[145]' }

interface MultitrackOverlayProps {
  isOpen: boolean
  takes: Take[]
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  hapticFeedback: boolean
  isRecording: boolean
  /** True while a native recording stop is still settling — a new recording must not start yet. */
  isStopping: boolean
  /** Recording elapsed seconds from the camera session (stage top-bar timer). */
  elapsed: number
  /** Native iOS camera bridge is delivering live frames — feeds the recording stage's own preview canvas. */
  nativeLivePreviewActive?: boolean
  /** Keep the bridge canvas mounted so record-start handoff can paint instantly. */
  nativeCameraBridgeEnabled?: boolean
  onClose: () => void
  /** Starts the camera; resolves true only once recording is confirmed. */
  onStartRecording: () => Promise<boolean>
  onStopRecording: () => void
  onRecordingComplete: () => void
  /** Fully discards a take (state, DB row, file, thumbnail) — used to throw away a retried recording. */
  onDeleteTakes: (ids: string[]) => void
  pendingRecordingTakeId: string | null
  onClearPendingRecording: () => void
  onOpenRecordingStage?: () => void
}

function describeMultitrackExportFailure(reason: MultitrackExportFailureReason): string {
  switch (reason) {
    case 'missing_takes':
      return 'Record at least one panel before exporting.'
    case 'missing_file':
      return 'One of your panel videos could not be found on your device.'
    case 'share_failed':
      return 'The system share sheet could not be opened.'
    case 'unsupported':
      return 'Multitrack export is only available on iPhone/iPad.'
    default:
      return 'Could not render the multitrack video. Please try again.'
  }
}

export default function MultitrackOverlay(props: MultitrackOverlayProps) {
  const {
    isOpen,
    takes,
    streamRef,
    streamGeneration,
    tunerInstrument,
    hapticFeedback,
    isRecording,
    isStopping,
    elapsed,
    nativeLivePreviewActive,
    nativeCameraBridgeEnabled,
    onClose,
    onStartRecording,
    onStopRecording,
    onRecordingComplete,
    onDeleteTakes,
    pendingRecordingTakeId,
    onClearPendingRecording,
    onOpenRecordingStage,
  } = props
  const shellRef = useRef<HTMLDivElement>(null)
  const masterMediaRef = useRef<HTMLMediaElement | null>(null)
  const backingAudioRef = useRef<HTMLAudioElement>(null)
  const backingYoutubeIframeRef = useRef<HTMLIFrameElement>(null)
  const [takePickerPanelId, setTakePickerPanelId] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [backingPlaying, setBackingPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [pendingReview, setPendingReview] = useState<{ panelId: string; take: Take } | null>(null)
  /** Bottom sheets: backing source, mixer, or a tile's action sheet. */
  const [activeSourceSheet, setActiveSourceSheet] = useState<'backing' | 'mixer' | null>(null)
  const [tileSheetPanelId, setTileSheetPanelId] = useState<string | null>(null)
  const sheetMusicInputRef = useRef<HTMLInputElement>(null)
  const {
    session,
    layout,
    setLayout,
    assignTakeToPanel,
    setPanelVolume,
    setPanelMuted,
    assignSheetMusic,
    updatePractice,
    updateBacking,
  } = useMultitrackSession({ takes, isOpen })
  const sync = useMultitrackSync()
  const { showAlert, showConfirm } = useActionSheet()

  const pauseBacking = useCallback(() => {
    const backing = session.backing
    if (backing.kind === 'audio') {
      backingAudioRef.current?.pause()
    } else if (backing.kind === 'youtube') {
      pauseYoutubeProxy(backingYoutubeIframeRef.current)
    }
    setBackingPlaying(false)
  }, [session.backing])

  const prepareBackingForRecord = useCallback(() => {
    const backing = session.backing
    if (backing.kind === 'audio') {
      const audio = backingAudioRef.current
      if (!audio) return
      audio.volume = backing.volume
      audio.muted = false
      audio.preload = 'auto'
      routeTakePlaybackToSpeaker(audio, backing.volume, false)
      primeTakePlaybackAudioSync(audio)
    } else if (backing.kind === 'youtube') {
      const iframe = backingYoutubeIframeRef.current
      setYoutubeProxyVolumeFromUi(iframe, backing.volume)
      wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume: backing.volume })
    }
  }, [session.backing])

  const prepareBackingAtStart = useCallback(async () => {
    const backing = session.backing
    if (backing.kind === 'audio') {
      const audio = backingAudioRef.current
      if (!audio) return
      audio.volume = backing.volume
      audio.muted = false
      audio.preload = 'auto'
      routeTakePlaybackToSpeaker(audio, backing.volume, false)
      try {
        audio.currentTime = 0
      } catch {
        /* media may still be loading */
      }
      audio.pause()
      primeTakePlaybackAudioSync(audio)
      return
    }

    if (backing.kind === 'youtube') {
      const iframe = backingYoutubeIframeRef.current
      setYoutubeProxyVolumeFromUi(iframe, backing.volume)
      wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume: backing.volume })
      seekYoutubeProxy(iframe, 0)
    }
  }, [session.backing])

  const startBackingPlayback = useCallback(async () => {
    const backing = session.backing
    if (backing.kind === 'none') return false

    if (backing.kind === 'audio') {
      const audio = backingAudioRef.current
      if (!audio) return false
      const started = await playTakeMediaAudible(audio, { skipRoutePrep: true })
      setBackingPlaying(started)
      return started
    }

    const iframe = backingYoutubeIframeRef.current
    startYoutubeProxyPlayback(iframe, backing.volume)
    setBackingPlaying(true)
    return true
  }, [session.backing])

  const playBackingFromStart = useCallback(async () => {
    await prepareBackingAtStart()
    return startBackingPlayback()
  }, [prepareBackingAtStart, startBackingPlayback])

  const toggleBackingPlayback = useCallback(() => {
    if (backingPlaying) {
      pauseBacking()
      return
    }
    void playBackingFromStart()
  }, [backingPlaying, pauseBacking, playBackingFromStart])

  const handleExport = useCallback(() => {
    if (isExporting) return

    void (async () => {
      if (session.backing.kind === 'youtube') {
        const proceed = await showConfirm({
          title: 'Backing track not included',
          message: "YouTube audio can't be captured for export. Continue without the backing track?",
          confirmLabel: 'Export anyway',
        })
        if (!proceed) return
      }

      sync.pause()
      pauseBacking()
      setIsExporting(true)
      try {
        const result = await exportMultitrackSession(session, layout, sync.state.duration)
        if (!result.ok) {
          await showAlert({ message: describeMultitrackExportFailure(result.reason), tone: 'error' })
        }
      } finally {
        setIsExporting(false)
      }
    })()
  }, [isExporting, layout, pauseBacking, session, showAlert, showConfirm, sync])

  const registerPanelMedia = useCallback((id: string, el: HTMLMediaElement | null) => {
    sync.registerMedia(id, el)
    if (el) {
      masterMediaRef.current = masterMediaRef.current ?? el
    } else if (masterMediaRef.current && !document.body.contains(masterMediaRef.current)) {
      masterMediaRef.current = null
    }
  }, [sync.registerMedia])

  const recordingTargetPanelIdRef = useRef<string | null>(null)

  const recording = useMultitrackRecording({
    onCountInStart: (panelId) => {
      recordingTargetPanelIdRef.current = panelId
      sync.setExcludePanelId(panelId)
      // Machine aborts the count-in with an error toast if this resolves false.
      return onStartRecording()
    },
    onPreparePlaybackDuringCountIn: async () => {
      sync.setExcludePanelId(recordingTargetPanelIdRef.current)
      await sync.prepareAtStart(0)
      await prepareBackingAtStart()
    },
    onPerformanceStart: async () => {
      await sync.startPrepared()
      // Backing muted from the monitor chips = silent for this take only.
      if (!monitorMutesRef.current.has('backing')) {
        await startBackingPlayback()
      }
    },
    onError: (message) => {
      setPendingReview(null)
      pauseBacking()
      sync.setExcludePanelId(null)
      void showAlert({ message, tone: 'error' })
    },
  })

  // Watchdog: phase says 'recording' but the camera never confirmed — abort
  // loudly instead of leaving a dead-end stage (no take will ever arrive).
  useEffect(() => {
    if (recording.phase !== 'recording' || isRecording) return
    const timer = window.setTimeout(() => {
      onStopRecording()
      recording.fail('The camera never started recording. Please try again.')
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [isRecording, onStopRecording, recording])

  // Watchdog: stopped into review but the take never arrived from the save
  // pipeline — reset with an error instead of freezing on a blank review.
  useEffect(() => {
    if (recording.phase !== 'review' || pendingReview) return
    const timer = window.setTimeout(() => {
      recording.fail('The recording could not be saved. Please try again.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [pendingReview, recording])

  useEffect(() => {
    recordingTargetPanelIdRef.current = recording.targetPanelId
    sync.setExcludePanelId(recording.targetPanelId)
  }, [recording.targetPanelId, sync])

  useEffect(() => {
    if (!isOpen) pauseBacking()
  }, [isOpen, pauseBacking])

  useEffect(() => {
    if (session.backing.kind === 'none') pauseBacking()
  }, [pauseBacking, session.backing.kind])

  useEffect(() => {
    const targetPanelId = recording.targetPanelId ?? activePanelId
    if (!pendingRecordingTakeId || !targetPanelId) return
    const take = takes.find((t) => t.id === pendingRecordingTakeId)
    if (!take) return
    setPendingReview({ panelId: targetPanelId, take })
    onRecordingComplete()
    onClearPendingRecording()
  }, [activePanelId, onClearPendingRecording, onRecordingComplete, pendingRecordingTakeId, recording.targetPanelId, takes])

  const handleConfirmTake = useCallback(() => {
    if (!pendingReview) return
    assignTakeToPanel(pendingReview.panelId, pendingReview.take)
    setPendingReview(null)
    recording.cancel()
    // One-time discoverability nudge: recordings auto-save to the vault.
    try {
      if (!window.localStorage.getItem('sm.multitrack.vaultTipShown')) {
        window.localStorage.setItem('sm.multitrack.vaultTipShown', '1')
        void showAlert({
          message: 'Saved! Every multitrack recording also lands in your Take Vault automatically.',
        })
      }
    } catch {
      /* storage unavailable */
    }
  }, [assignTakeToPanel, pendingReview, recording, showAlert])

  const handleRetryTake = useCallback(() => {
    if (!pendingReview) return
    onDeleteTakes([pendingReview.take.id])
    setPendingReview(null)
    recording.cancel()
  }, [onDeleteTakes, pendingReview, recording])

  const activePanel = session.panels.find((panel) => panel.id === activePanelId)

  const hasAnyTake = session.panels.some(
    (panel) => panel.kind === 'performance' && panel.take !== null,
  )
  const shareDisabled = !hasAnyTake || isExporting || recording.phase !== 'idle'

  // Mixer bridge: session mixer state drives the live sync-engine elements.
  useEffect(() => {
    for (const panel of session.panels) {
      if (panel.kind !== 'performance') continue
      sync.setPanelVolume(panel.id, panel.volume ?? 1)
      sync.setPanelMuted(panel.id, panel.muted === true)
    }
  }, [session.panels, sync])

  const tileSheetPanel = session.panels.find(
    (panel) => panel.id === tileSheetPanelId && panel.kind === 'performance',
  )
  const tileSheetTake = tileSheetPanel?.kind === 'performance' ? tileSheetPanel.take : null

  const openRecordingForPanel = useCallback(
    (panelId: string) => {
      triggerLightHaptic(hapticFeedback)
      setTileSheetPanelId(null)
      onOpenRecordingStage?.()
      setActivePanelId(panelId)
    },
    [hapticFeedback, onOpenRecordingStage],
  )

  const mixerPanels = session.panels.filter(
    (panel) => panel.kind === 'performance' && panel.take !== null,
  )

  const backingChipLabel =
    session.backing.kind === 'none'
      ? 'Add backing'
      : session.backing.kind === 'audio'
        ? session.backing.fileName
        : session.backing.label || 'YouTube'

  // ── Monitor mix ("You'll hear" chips) ────────────────────────────────────
  // Per-take mute set: panel ids plus the 'backing'/'click' sentinels. All-on
  // by default; reset whenever the stage opens for a different tile.
  const [monitorMutes, setMonitorMutes] = useState<Set<string>>(() => new Set())
  const monitorMutesRef = useRef(monitorMutes)
  monitorMutesRef.current = monitorMutes

  useEffect(() => {
    setMonitorMutes(new Set())
  }, [activePanelId])

  // Apply panel monitor mutes to the live sync elements while the stage is open.
  useEffect(() => {
    if (!activePanelId) {
      sync.setMonitorMutedPanelIds([])
      return
    }
    sync.setMonitorMutedPanelIds(
      [...monitorMutes].filter((id) => id !== 'backing' && id !== 'click'),
    )
  }, [activePanelId, monitorMutes, sync])

  const toggleMonitorSource = useCallback((id: string) => {
    setMonitorMutes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const monitorSources = useMemo(() => {
    const sources: Array<{ id: string; label: string; muted: boolean }> = []
    session.panels.forEach((panel, index) => {
      if (panel.kind !== 'performance' || !panel.take) return
      if (panel.id === activePanelId) return
      sources.push({
        id: panel.id,
        label: panel.take.name || `Box ${index + 1}`,
        muted: monitorMutes.has(panel.id),
      })
    })
    if (session.backing.kind !== 'none') {
      sources.push({ id: 'backing', label: backingChipLabel, muted: monitorMutes.has('backing') })
    }
    if (session.practice.clickEnabled) {
      sources.push({ id: 'click', label: 'Click', muted: monitorMutes.has('click') })
    }
    return sources
  }, [activePanelId, backingChipLabel, monitorMutes, session.backing.kind, session.panels, session.practice.clickEnabled])

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div ref={shellRef} key="mt-overlay" className="multitrack-overlay" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={iosSpringSnappy} style={motionGpuLayer} role="dialog" aria-modal="true">
            <header className="multitrack-overlay__header">
              <Pressable type="button" intensity="soft" onClick={onClose} aria-label="Close multitrack">
                <ChevronLeft className="h-6 w-6" />
              </Pressable>
              <h1 className="text-lg font-semibold">Multitrack</h1>
              <Pressable
                type="button"
                intensity="normal"
                onClick={handleExport}
                disabled={shareDisabled}
                className="multitrack-share-btn"
              >
                <Share2 className="h-4 w-4" />
                {isExporting ? 'Rendering…' : 'Share'}
              </Pressable>
            </header>
            <div className="multitrack-overlay__body">
              <div className="multitrack-mix-strip" aria-label="Project audio sources">
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => setActiveSourceSheet('backing')}
                  className={`multitrack-source-chip ${session.backing.kind !== 'none' ? 'multitrack-source-chip--active' : ''}`}
                >
                  <Music4 className="h-3.5 w-3.5" />
                  <span className="multitrack-source-chip__label">{backingChipLabel}</span>
                  {session.backing.kind !== 'none' ? <span className="multitrack-source-chip__dot" /> : null}
                </Pressable>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => updatePractice({ clickEnabled: !session.practice.clickEnabled })}
                  className={`multitrack-source-chip ${session.practice.clickEnabled ? 'multitrack-source-chip--active' : ''}`}
                >
                  <span className="multitrack-source-chip__label">Click</span>
                  <span className="multitrack-source-chip__state">
                    {session.practice.clickEnabled ? 'on' : 'off'}
                  </span>
                </Pressable>
              </div>
              <MultitrackPanelGrid layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={recording.targetPanelId} recordingPhase={recording.phase}
                onTapPerformance={(id) => { triggerLightHaptic(hapticFeedback); setTileSheetPanelId(id) }}
                onRemoveTake={(id) => assignTakeToPanel(id, null)} onSheetMusicChange={assignSheetMusic}
                onRegisterMedia={registerPanelMedia} />
            </div>
            <MultitrackToolbar isPlaying={sync.state.isPlaying || backingPlaying} currentTime={sync.state.currentTime} duration={sync.state.duration}
              activeLayoutId={session.layoutId}
              onSelectLayout={setLayout}
              onOpenMixer={() => setActiveSourceSheet('mixer')}
              onTogglePlay={() => void (async () => {
                if (sync.state.isPlaying || backingPlaying) {
                  sync.pause()
                  pauseBacking()
                  return
                }
                sync.setExcludePanelId(null)
                sync.playAllFromUserGesture()
                await playBackingFromStart()
              })()} onRestart={() => void (async () => { sync.pause(); pauseBacking(); sync.setExcludePanelId(null); await sync.restart(); await playBackingFromStart() })()} onSeek={sync.seek} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activePanel && isOpen && (
          <motion.div key="mt-recording-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MultitrackRecordingStage
              panelLabel={`Box ${session.panels.findIndex((panel) => panel.id === activePanel.id) + 1}`}
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              nativeLivePreviewActive={nativeLivePreviewActive}
              nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
              tunerInstrument={tunerInstrument}
              practice={session.practice}
              phase={recording.phase}
              countInRemaining={recording.countInRemaining}
              isRecording={isRecording}
              isStopping={isStopping}
              elapsed={elapsed}
              reviewTake={
                pendingReview && pendingReview.panelId === activePanel.id
                  ? pendingReview.take
                  : activePanel.kind === 'performance' ? activePanel.take : null
              }
              monitorSources={monitorSources}
              onToggleMonitorSource={toggleMonitorSource}
              onPracticeChange={updatePractice}
              onRecord={() => {
                if (isRecording || isStopping) return
                recordingTargetPanelIdRef.current = activePanel.id
                sync.setExcludePanelId(activePanel.id)
                if (!monitorMutesRef.current.has('backing')) {
                  prepareBackingForRecord()
                }
                recording.beginCountIn(activePanel.id, {
                  ...session.practice,
                  clickEnabled:
                    session.practice.clickEnabled && !monitorMutesRef.current.has('click'),
                })
              }}
              onStop={() => {
                sync.setExcludePanelId(null)
                sync.pause()
                pauseBacking()
                onStopRecording()
                recording.enterReview()
              }}
              onUseExisting={() => setTakePickerPanelId(activePanel.id)}
              onConfirmTake={handleConfirmTake}
              onRetryTake={handleRetryTake}
              onClose={() => {
                if (isRecording) onStopRecording()
                if (pendingReview) {
                  onDeleteTakes([pendingReview.take.id])
                  setPendingReview(null)
                }
                sync.setExcludePanelId(null)
                sync.setMonitorMutedPanelIds([])
                sync.pause()
                pauseBacking()
                recording.cancel()
                setActivePanelId(null)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <MultitrackTakePicker isOpen={takePickerPanelId !== null} takes={takes} onClose={() => setTakePickerPanelId(null)} onSelectTake={(take) => { if (takePickerPanelId) assignTakeToPanel(takePickerPanelId, take); setTakePickerPanelId(null); setActivePanelId(null) }} />

      {/* Backing audio/iframe must outlive the on-demand sheet UI. */}
      {isOpen ? (
        <MultitrackBackingMediaHost
          backing={session.backing}
          audioRef={backingAudioRef}
          youtubeIframeRef={backingYoutubeIframeRef}
        />
      ) : null}

      {/* Sheet music / image picker (triggered from the tile sheet). */}
      <input
        ref={sheetMusicInputRef}
        type="file"
        accept={sheetMusicAcceptAttribute()}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void loadSheetMusicFile(file).then((asset) => {
            assignSheetMusic(session.sheetMusic.id, asset)
          })
          event.currentTarget.value = ''
        }}
      />

      {/* Tile action sheet: "What do you want here?" */}
      <AnimatedBottomSheet
        isOpen={tileSheetPanelId !== null && isOpen}
        onClose={() => setTileSheetPanelId(null)}
        ariaLabel="Tile options"
        elevated
        elevatedLight
        zClass={MULTITRACK_SHEET_Z}
        maxHeightClass="max-h-[70vh]"
      >
        <div className="multitrack-sheet">
          <p className="multitrack-sheet__title">
            {tileSheetTake ? tileSheetTake.name || 'This tile' : 'What goes here?'}
          </p>
          <div className="multitrack-sheet__primary-row">
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className="multitrack-sheet__primary multitrack-sheet__primary--record"
              onClick={() => {
                if (tileSheetPanelId) openRecordingForPanel(tileSheetPanelId)
              }}
            >
              <Video className="h-6 w-6" />
              {tileSheetTake ? 'Record again' : 'Record'}
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="multitrack-sheet__primary"
              onClick={() => {
                if (tileSheetPanelId) setTakePickerPanelId(tileSheetPanelId)
                setTileSheetPanelId(null)
              }}
            >
              <FolderOpen className="h-6 w-6" />
              Take Vault
            </Pressable>
          </div>
          {!tileSheetTake ? (
            <div className="multitrack-sheet__more-row">
              <Pressable
                type="button"
                intensity="soft"
                className="multitrack-sheet__more"
                onClick={() => {
                  sheetMusicInputRef.current?.click()
                  setTileSheetPanelId(null)
                }}
              >
                <FileMusic className="h-4 w-4" />
                Sheet music / image
              </Pressable>
            </div>
          ) : (
            <div className="multitrack-sheet__more-row">
              <Pressable
                type="button"
                intensity="soft"
                className="multitrack-sheet__more"
                onClick={() => {
                  if (tileSheetPanelId) assignTakeToPanel(tileSheetPanelId, null)
                  setTileSheetPanelId(null)
                }}
              >
                <VolumeX className="h-4 w-4" />
                Remove from tile
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                className="multitrack-sheet__more multitrack-sheet__more--danger"
                onClick={() => {
                  const takeId = tileSheetTake?.id
                  const panelId = tileSheetPanelId
                  setTileSheetPanelId(null)
                  if (!takeId || !panelId) return
                  void showConfirm({
                    title: 'Delete take?',
                    message: 'This removes the recording from your Take Vault too.',
                    confirmLabel: 'Delete',
                  }).then((confirmed) => {
                    if (!confirmed) return
                    assignTakeToPanel(panelId, null)
                    onDeleteTakes([takeId])
                  })
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete take
              </Pressable>
            </div>
          )}
        </div>
      </AnimatedBottomSheet>

      {/* Backing source sheet. */}
      <AnimatedBottomSheet
        isOpen={activeSourceSheet === 'backing' && isOpen}
        onClose={() => setActiveSourceSheet(null)}
        ariaLabel="Backing track"
        elevated
        elevatedLight
        zClass={MULTITRACK_SHEET_Z}
        maxHeightClass="max-h-[70vh]"
      >
        <div className="multitrack-sheet">
          <p className="multitrack-sheet__title">Backing track</p>
          <MultitrackBackingTrackPanel
            backing={session.backing}
            audioRef={backingAudioRef}
            youtubeIframeRef={backingYoutubeIframeRef}
            isPlaying={backingPlaying}
            placement="setup"
            renderMedia={false}
            onBackingChange={(backing) => {
              pauseBacking()
              updateBacking(backing)
            }}
            onTogglePlayback={toggleBackingPlayback}
          />
        </div>
      </AnimatedBottomSheet>

      {/* Mixer sheet: playback balance per tile + backing volume. */}
      <AnimatedBottomSheet
        isOpen={activeSourceSheet === 'mixer' && isOpen}
        onClose={() => setActiveSourceSheet(null)}
        ariaLabel="Mixer"
        elevated
        elevatedLight
        zClass={MULTITRACK_SHEET_Z}
        maxHeightClass="max-h-[70vh]"
      >
        <div className="multitrack-sheet">
          <p className="multitrack-sheet__title">Mixer</p>
          {mixerPanels.length === 0 && session.backing.kind === 'none' ? (
            <p className="multitrack-sheet__empty">Record or add a take to mix.</p>
          ) : null}
          {mixerPanels.map((panel, index) =>
            panel.kind === 'performance' && panel.take ? (
              <div key={panel.id} className="multitrack-mixer-row">
                <Pressable
                  type="button"
                  intensity="icon"
                  aria-label={panel.muted ? 'Unmute tile' : 'Mute tile'}
                  className={`multitrack-mixer-row__mute ${panel.muted ? 'is-muted' : ''}`}
                  onClick={() => setPanelMuted(panel.id, !panel.muted)}
                >
                  {panel.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Pressable>
                <span className="multitrack-mixer-row__name">
                  {panel.take.name || `Box ${index + 1}`}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={panel.volume ?? 1}
                  onChange={(event) => setPanelVolume(panel.id, Number(event.target.value))}
                  className="multitrack-mixer-row__slider"
                />
              </div>
            ) : null,
          )}
          {session.backing.kind !== 'none' ? (
            <div className="multitrack-mixer-row">
              <Music4 className="h-4 w-4 text-stone-400" />
              <span className="multitrack-mixer-row__name">{backingChipLabel}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={session.backing.volume}
                onChange={(event) =>
                  updateBacking({ ...session.backing, volume: Number(event.target.value) })
                }
                className="multitrack-mixer-row__slider"
              />
            </div>
          ) : null}
        </div>
      </AnimatedBottomSheet>
    </>, document.body)
}
