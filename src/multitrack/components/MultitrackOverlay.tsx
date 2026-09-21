import { nativeTakePlaybackEnhancerParams } from '../../utils/takePlaybackSpeaker'
import { readMultitrackAsset } from '../state/readMultitrackAsset'
import { hasSectionWindow } from '../layout/sectionVisibility'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Activity, Timer, ChevronLeft, ChevronRight, Crosshair, FileMusic, FolderOpen, Music4, RefreshCw, RotateCcw, Save, Share2, SlidersHorizontal, Sparkles, Trash2, Video, VolumeX } from 'lucide-react'
import type { Take } from '../../types'
import type { PerformancePanelState } from '../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import { triggerLightHaptic } from '../../utils/haptics'
import { playTakeMediaAudible, primeTakePlaybackAudioSync } from '../../utils/takePlaybackAudio'
import { waitForMediaProgressing } from '../../utils/mediaPlayback'
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
import { ensureNativeCameraSessionHealthy } from '../../utils/nativeCameraTest'
import { completePlaybackRouteRestore } from '../../utils/playbackRouteCoordinator'
import { resumePlaybackAudioContext } from '../../utils/playbackAudioContext'
import {
  APP_BACKGROUND_SUSPEND_EVENT,
  APP_FOREGROUND_RECOVERY_EVENT,
  requestInteractiveMediaRecovery,
} from '../../utils/appForeground'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { getCameraFacingFront } from '../../utils/videoCapture'
import { isHeadphoneOutputActive } from '../../utils/headphoneOutput'
import { useHeadphoneOutput } from '../../hooks/useHeadphoneOutput'
import { useActionSheet } from '../../context/ActionSheetContext'
import { useMultitrackSession } from '../state/useMultitrackSession'
import { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMultitrackRecording } from '../recording/useMultitrackRecording'
import BestTakeAudioPlugin from '../../utils/audioSessionRoute'
import { Capacitor } from '@capacitor/core'
import { panelOffsetMs, panelEndSec, sourceWindow, playbackCountOffSec, playbackStartPosition, withOverlayLeadIn, overlayLeadInSec } from '../synchronization/projectTiming'
import { multitrackTransport } from '../synchronization/multitrackTransport'
import MultitrackProjectPanel from './MultitrackProjectPanel'
import { readMultitrackFile, shareMultitrackFile } from '../state/multitrackFile'
import { consumeMultitrackFile, getPendingMultitrackFile, subscribeMultitrackFile } from '../state/multitrackFileOpen'
import { timelineOffsetMsForTake } from '../synchronization/multitrackBeatSchedule'
import type { MultitrackRecordingStopOptions } from '../../utils/takeStorage'
import { resolveNativeFileUri } from '../../utils/shareTakeVideo'
import { extensionForBlob, writeBlobToNativeCache } from '../../utils/nativeAssetCache'
import {
  isNativeMultitrackTransportAvailable,
  prepareNativeMultitrackMonitor,
  startNativeMultitrackTransport,
  stopNativeMultitrackTransport,
  type MultitrackMonitorSource,
} from '../synchronization/nativeMultitrackTransport'
import { getWebKitBackingStartLeadSec } from '../synchronization/metronomePlaybackCompensation'
import { exportMultitrackSession, type MultitrackExportFailureReason } from '../export/multitrackExport'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from '../sheetMusic/sheetMusicUtils'
import MultitrackPanelGrid from './MultitrackPanelGrid'
import SheetPlacementDiagram from './SheetPlacementDiagram'
import { SHEET_BASE_CUE_ID, sheetCueWindows, sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackBackingTrackPanel, { MultitrackBackingMediaHost } from '../backing/MultitrackBackingTrackPanel'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import MultitrackRecordingStage from './MultitrackRecordingStage'
import MultitrackAlignStage from './MultitrackAlignStage'
import ProjectFileActions from './ProjectFileActions'
import MultitrackWorkspaceTools, { type MultitrackRoutine } from './MultitrackWorkspaceTools'
import MultitrackLayoutSheet from './MultitrackLayoutSheet'
import MultitrackCountInControls from './MultitrackCountInControls'

/** Sheets portal to document.body; the overlay itself sits at z-135. */
const MULTITRACK_SHEET_Z = { backdrop: 'z-[140]', sheet: 'z-[145]' }
const MULTITRACK_MONITOR_CACHE_DIR = 'multitrack-monitor-assets'

const SHEET_FRAME_OPTIONS = [
  { value: 'top', label: 'Above', detail: 'Full-width row above the videos' },
  { value: 'bottom', label: 'Below', detail: 'Full-width row below the videos' },
  { value: 'left', label: 'Left side', detail: 'Vertical panel beside the videos' },
  { value: 'right', label: 'Right side', detail: 'Vertical panel beside the videos' },
] as const

interface MultitrackOverlayProps {
  routine?: MultitrackRoutine
  onOpenRoutine?: () => void
  takesLoaded?: boolean
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
  onStopRecording: (options?: MultitrackRecordingStopOptions) => void
  onRecordingComplete: () => void
  /** Fully discards a take (state, DB row, file, thumbnail) — used to throw away a retried recording. */
  onDeleteTakes: (ids: string[]) => void
  pendingRecordingTakeId: string | null
  onClearPendingRecording: () => void
  onOpenRecordingStage?: () => void
  /** Re-acquires the camera/preview after an idle or interrupted session. */
  onWakeCamera?: () => Promise<void> | void
  onSaveRenderedTakeToVault: (rendered: {
    path: string
    durationSeconds: number
  }) => Promise<void>
  audioEnhancerEnabled: boolean
  onAudioEnhancerChange: (enabled: boolean) => void
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
    onWakeCamera,
    onSaveRenderedTakeToVault,
  } = props
  const shellRef = useRef<HTMLDivElement>(null)
  const masterMediaRef = useRef<HTMLMediaElement | null>(null)
  const inGridReviewMediaRef = useRef<HTMLMediaElement | null>(null)
  const backingAudioRef = useRef<HTMLAudioElement>(null)
  const backingYoutubeIframeRef = useRef<HTMLIFrameElement>(null)
  const youtubeStartTimerRef = useRef<number | null>(null)
  const youtubeStartGenerationRef = useRef(0)
  const youtubeScheduledPerformanceRef = useRef<number | null>(null)
  const ownedBackingBlobUrlsRef = useRef<Set<string>>(new Set())
  const nativeBackingCacheRef = useRef<{ src: string; path: string } | null>(null)
  const [takePickerPanelId, setTakePickerPanelId] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [backingPlaying, setBackingPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const exportLock = useRef(false)
  const exportAbort = useRef<AbortController | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [renderedVideo, setRenderedVideo] = useState<{ path: string; durationSeconds: number; key: string } | null>(null)
  const [pendingReview, setPendingReview] = useState<{ panelId: string; take: Take; mirrored: boolean } | null>(null)
  const discardNextRecordingRef = useRef(false)
  /** Bottom sheets: backing source, export, visual or a tile's action sheet. */
  const [activeSourceSheet, setActiveSourceSheet] = useState<'backing' | 'export' | 'visual' | 'project' | 'tools' | 'layout' | 'click' | null>(null)
  const [tileSheetPanelId, setTileSheetPanelId] = useState<string | null>(null)
  const [alignStageOpen, setAlignStageOpen] = useState(false)
  const [layoutEditing, setLayoutEditing] = useState(false)
  /** Last-resort recovery: the camera/audio never came back on its own. */
  const [needsWake, setNeedsWake] = useState(false)
  const [isWaking, setIsWaking] = useState(false)
  const wakeDismissedRef = useRef(false)
  const sheetMusicInputRef = useRef<HTMLInputElement>(null)
  /**
   * Timeline second a picked image should cut in at. Null means "this is the
   * panel's first image" — it takes over from the downbeat.
   */
  const pendingImageAtSecRef = useRef<number | null>(null)
  /** Timeline second the next recording starts at (the align stage's "+" flow). */
  const recordStartSecRef = useRef(0)
  const {
    session, projects, openProject, importProject, updateProject, updatePanel, reorderPanel, undo, canUndo,
    layout,
    setLayout,
    addPerformanceBox,
    assignTakeToPanel,
    setPanelVolume,
    setPanelMuted,
    setPanelTrim,
    setPanelSection,
    assignSheetMusic,
    addSheetCue,
    moveSheetCue,
    updateSheetCueAsset,
    removeSheetCue,
    updatePractice,
    updateBacking,
    persistenceNotice,
    isRestoring,
  } = useMultitrackSession({ takes, isOpen, takesLoaded: props.takesLoaded })
  useEffect(() => { setRenderedVideo(null) }, [session])
  const sync = useMultitrackSync()
  const { showAlert, showConfirm } = useActionSheet()
  const [projectFileBusy, setProjectFileBusy] = useState(false)
  const projectFileBusyRef = useRef(false)
  const handleProjectFile = async (file?: File | string) => {
    if (projectFileBusyRef.current || isRestoring || recording.phase !== 'idle' || isExporting) return
    projectFileBusyRef.current = true; setProjectFileBusy(true)
    pauseAllPlayback()
    let imported: Awaited<ReturnType<typeof readMultitrackFile>> | undefined
    try {
      if (file) {
        let source: Blob
        if (typeof file === 'string') {
          source = await readMultitrackAsset(Capacitor.convertFileSrc(file), 'The received project', file)
        } else source = file
        imported = await readMultitrackFile(source)
        await importProject(imported.session)
        setRenderedVideo(null); setAlignStageOpen(false); setActiveSourceSheet(null)
        void showAlert({ title: 'Project opened', message: 'Your friend’s parts are ready. Record in an empty box, then share the project file back.', tone: 'success' })
      } else await shareMultitrackFile(session)
    } catch (error) {
      imported?.dispose()
      const message = error instanceof Error ? error.message : 'Could not open or share this project.'
      if (!/cancel|dismiss|abort/i.test(message)) void showAlert({ title: 'Project file', message, tone: 'error' })
    } finally { projectFileBusyRef.current = false; setProjectFileBusy(false) }
  }
  const nativeGridPlaybackActiveRef = useRef(false)
  const nativeGridPlaybackPreparingRef = useRef(false)
  const nativeGridPlaybackGenerationRef = useRef(0)
  const playAllFromBeginningAfterRecordRef = useRef(false)
  const [isNativeGridPlaybackPreparing, setIsNativeGridPlaybackPreparing] = useState(false)

  const stopNativeGridPlayback = useCallback(async () => {
    nativeGridPlaybackGenerationRef.current += 1
    const shouldStop =
      nativeGridPlaybackActiveRef.current ||
      nativeGridPlaybackPreparingRef.current
    nativeGridPlaybackActiveRef.current = false
    nativeGridPlaybackPreparingRef.current = false
    setIsNativeGridPlaybackPreparing(false)
    if (shouldStop) await stopNativeMultitrackTransport()
  }, [])

  const handlePracticeChange = useCallback((patch: Partial<typeof session.practice>) => {
    if (patch.bpm !== undefined) {
      sharedMetronomeEngine.setBpm(patch.bpm)
    } else if (patch.showMetronome === true) {
      sharedMetronomeEngine.setBpm(session.practice.bpm)
    }
    updatePractice(patch)
  }, [session.practice.bpm, updatePractice])

  /**
   * The image that owns the music panel's placement — the base image, or the
   * opening cue when the panel was built entirely from timeline screenshots.
   * Panel placement is shared by every cue, so it always lives on this one.
   */
  const layoutSheetAsset = sheetLayoutAsset(session.sheetMusic)

  const updateSheetMusicAsset = useCallback((patch: Partial<NonNullable<typeof session.sheetMusic.asset>>) => {
    const base = session.sheetMusic.asset
    if (base) {
      assignSheetMusic(session.sheetMusic.id, { ...base, ...patch })
      return
    }
    const firstCue = [...(session.sheetMusic.cues ?? [])].sort((a, b) => a.startSec - b.startSec)[0]
    if (!firstCue) return
    updateSheetCueAsset(firstCue.id, { ...firstCue.asset, ...patch })
  }, [assignSheetMusic, session.sheetMusic, updateSheetCueAsset])

  const handleSheetMusicAssetChange = useCallback((panelId: string, asset: typeof session.sheetMusic.asset) => {
    assignSheetMusic(panelId, asset)
    if (!asset) setActiveSourceSheet(null)
  }, [assignSheetMusic])

  const clearYoutubeStartSchedule = useCallback(() => {
    youtubeStartGenerationRef.current += 1
    youtubeScheduledPerformanceRef.current = null
    if (youtubeStartTimerRef.current !== null) {
      window.clearTimeout(youtubeStartTimerRef.current)
      youtubeStartTimerRef.current = null
    }
  }, [])

  const pauseBacking = useCallback(() => {
    clearYoutubeStartSchedule()
    const backing = session.backing
    if (backing.kind === 'audio') {
      backingAudioRef.current?.pause()
    } else if (backing.kind === 'youtube') {
      pauseYoutubeProxy(backingYoutubeIframeRef.current)
    }
    setBackingPlaying(false)
  }, [clearYoutubeStartSchedule, session.backing])

  const handleBackingChange = useCallback((nextBacking: typeof session.backing) => {
    const currentBacking = session.backing
    if (
      currentBacking.kind !== 'audio' ||
      nextBacking.kind !== 'audio' ||
      currentBacking.src !== nextBacking.src
    ) {
      nativeBackingCacheRef.current = null
    }
    if (
      currentBacking.kind === 'audio' &&
      currentBacking.src.startsWith('blob:') &&
      (nextBacking.kind !== 'audio' || nextBacking.src !== currentBacking.src)
    ) {
      // Keep replaced imports alive for Undo; release them when this workspace unmounts.
    }
    if (nextBacking.kind === 'audio' && nextBacking.src.startsWith('blob:')) {
      ownedBackingBlobUrlsRef.current.add(nextBacking.src)
    }
    pauseBacking()
    updateBacking(nextBacking)
    // A song you play along to is almost never at the click's tempo, and a
    // click fighting the track is worse than no click. Start it off whenever a
    // backing is attached or swapped — the Click chip turns it back on.
    if (nextBacking.kind !== 'none') updatePractice({ clickEnabled: false })
  }, [pauseBacking, session.backing, updateBacking, updatePractice])

  useEffect(() => () => {
    for (const url of ownedBackingBlobUrlsRef.current) URL.revokeObjectURL(url)
    ownedBackingBlobUrlsRef.current.clear()
  }, [])

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
      // No ended-listener: the backing track finishing must not tear down the
      // audio route while takes are still playing or a recording is running.
      const started = await playTakeMediaAudible(audio, {
        skipRoutePrep: true,
        attachEndedRouteRestore: false,
      })
      if (started) {
        await waitForMediaProgressing(audio, { timeoutMs: 2000 })
      }
      setBackingPlaying(started)
      return started
    }

    const iframe = backingYoutubeIframeRef.current
    if (iframe) startYoutubeProxyPlayback(iframe, backing.volume)
    // Preserve the user's/playback transport's intent if the iframe is still
    // loading. Its onLoad handler will start it once the player is ready.
    setBackingPlaying(true)
    return iframe !== null
  }, [session.backing])

  const scheduleYoutubeBackingStart = useCallback(async (performanceEpochMs: number) => {
    clearYoutubeStartSchedule()
    if (session.backing.kind !== 'youtube') return

    const generation = youtubeStartGenerationRef.current
    const leadSec = await getWebKitBackingStartLeadSec()
    if (generation !== youtubeStartGenerationRef.current) return
    youtubeScheduledPerformanceRef.current = performanceEpochMs
    const delayMs = Math.max(0, performanceEpochMs - Date.now() - leadSec * 1000)
    youtubeStartTimerRef.current = window.setTimeout(() => {
      if (generation !== youtubeStartGenerationRef.current) return
      youtubeStartTimerRef.current = null
      void startBackingPlayback()
    }, delayMs)
  }, [clearYoutubeStartSchedule, session.backing, startBackingPlayback])

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

  const handleExport = useCallback((destination: 'share' | 'vault' | 'preview') => {
    if (exportLock.current) return
    exportLock.current = true
    setIsExporting(true)
    setExportProgress(0)
    const abort = new AbortController()
    exportAbort.current = abort
    void (async () => {
      try {
        const duration = session.endSec ?? Math.max(sync.state.duration,
          ...session.panels.map(p => p.kind === 'performance' && !p.hidden ? panelEndSec(p, session.practice.bpm) : 0))
        const key = JSON.stringify(session) + ':' + duration
        let rendered = renderedVideo?.key === key ? renderedVideo : null
        if (!rendered) {
          if (session.backing.kind === 'youtube') {
            const proceed = await showConfirm({ title: 'Backing track not included',
              message: "YouTube is a practice reference and cannot be included in the finished video. Export without it?",
              confirmLabel: 'Export without backing' })
            if (!proceed) return
          }
          sync.pause(); pauseBacking()
          await stopNativeGridPlayback()
          if (abort.signal.aborted) return
          const result = await exportMultitrackSession(session, layout, duration,
            { signal: abort.signal, onProgress: setExportProgress })
          if (!result.ok) {
            if (result.reason !== 'cancelled') await showAlert({ message: describeMultitrackExportFailure(result.reason), tone: 'error' })
            return
          }
          rendered = { path: result.renderedPath, durationSeconds: result.durationSeconds, key }
          setRenderedVideo(rendered)
        }
        if (abort.signal.aborted) return
        if (destination === 'share') await BestTakeAudioPlugin.shareMediaFile({ path: rendered.path, title: session.name || 'BestTake Multitrack', audioGain: 1 })
        if (destination === 'vault') {
          await onSaveRenderedTakeToVault(rendered)
          await showAlert({ message: 'Saved to your Take Vault.' })
        }
      } catch (error) {
        if (!abort.signal.aborted) await showAlert({ message: 'Could not finish this action. Any completed video is kept here so you can retry sharing or saving.', tone: 'error' })
        console.warn('[Multitrack] finish failed', error)
      } finally {
        exportLock.current = false; exportAbort.current = null; setIsExporting(false)
      }
    })()
  }, [layout, onSaveRenderedTakeToVault, pauseBacking, renderedVideo, session, showAlert, showConfirm, stopNativeGridPlayback, sync])

  const registerPanelMedia = useCallback((id: string, el: HTMLMediaElement | null) => {
    sync.registerMedia(id, el)
    if (el) {
      masterMediaRef.current = masterMediaRef.current ?? el
    } else if (masterMediaRef.current && !document.body.contains(masterMediaRef.current)) {
      masterMediaRef.current = null
    }
  }, [sync.registerMedia])

  const recordingTargetPanelIdRef = useRef<string | null>(null)
  // Per-record monitor mix. Every filled panel except the recording target is
  // a reference; there is no privileged "Track 1" box.
  const [monitorMutes, setMonitorMutes] = useState<Set<string>>(() => new Set())
  const monitorMutesRef = useRef(monitorMutes)
  monitorMutesRef.current = monitorMutes
  const nativeTransportActiveRef = useRef(false)
  const recordingPerformanceEpochRef = useRef(0)

  const buildNativeMonitorSources = useCallback(async (
    targetPanelId: string | null,
    respectRecordingMonitorMutes = true,
    /** Timeline second the mix starts from — non-zero when overdubbing a part
        that only exists later in the song. */
    startAtSec = 0,
  ): Promise<MultitrackMonitorSource[]> => {
    const sources: MultitrackMonitorSource[] = []
    const startSec = startAtSec

    for (const [panelIndex, panel] of session.panels.entries()) {
      if (
        panel.kind !== 'performance' || panel.hidden ||
        (targetPanelId !== null && panel.id === targetPanelId) ||
        !panel.take ||
        panel.muted ||
        (respectRecordingMonitorMutes && monitorMutesRef.current.has(panel.id))
      ) continue

      const path = await resolveNativeFileUri(panel.take)
      if (!path) {
        throw new Error(`${panel.take.name || `Box ${panelIndex + 1}`} is missing from this device. Choose the take again.`)
      }
      // The sync timeline is authoritative here. During Align, it contains the
      // live unsaved drag/trim values, so Preview audio now follows the same
      // edits as the video instead of rebuilding from stale session metadata.
      const timeline = sync.getPanelTimelineSettings(panel.id)
      const rawEnd = timeline.trimEndSec ?? (sync.getPanelMediaDuration(panel.id) || panel.take.duration || 0)
      const lead = withOverlayLeadIn(panel, session.practice.bpm, timeline.trimStartSec, timeline.offsetMs)
      const from = panel.sectionAudio
        ? Math.max(startSec, (panel.sectionStartSec ?? 0) - lead.leadIn)
        : startSec
      const end = Math.min(session.endSec ?? Infinity, panel.sectionAudio ? panel.sectionEndSec ?? Infinity : Infinity)
      const window = sourceWindow(lead.trimStart, rawEnd, lead.offsetMs, from, end)
      if (!window) continue
      const sourceInSec = window.sourceInSec
      const timelineDelaySec = window.timelineDelaySec + from - startSec

      sources.push({
        id: panel.id,
        label: panel.label || panel.take.name || `Box ${panelIndex + 1}`,
        path,
        sourceInSec,
        enhancerParams: nativeTakePlaybackEnhancerParams(panel.take.enhancerBaked),
        sourceOutSec: window.sourceOutSec,
        ...(timelineDelaySec > 0 ? { timelineDelaySec } : null),
        volume: panel.volume ?? 1,
      })
    }

    if (
      session.backing.kind === 'audio' &&
      (!respectRecordingMonitorMutes || !monitorMutesRef.current.has('backing'))
    ) {
      try {
        let path = nativeBackingCacheRef.current?.src === session.backing.src
          ? nativeBackingCacheRef.current.path
          : null
        if (!path) {
          const response = await fetch(session.backing.src)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          const extension = extensionForBlob(blob, session.backing.fileName)
          path = await writeBlobToNativeCache(
            MULTITRACK_MONITOR_CACHE_DIR,
            `backing-monitor.${extension}`,
            blob,
          )
          nativeBackingCacheRef.current = { src: session.backing.src, path }
        }
        // The backing's own zero IS timeline zero, so it has nothing to play
        // during a lead-in — it waits out the gap instead of starting early.
        const backingStartsInside = startSec >= 0
        sources.push({
          id: 'backing',
          label: session.backing.fileName || 'Backing track',
          path,
          sourceInSec: backingStartsInside ? startSec : 0,
          ...(session.endSec ? { sourceOutSec: session.endSec } : {}),
          ...(backingStartsInside ? null : { timelineDelaySec: -startSec }),
          volume: session.backing.volume,
        })
      } catch (error) {
        console.error('[Multitrack] backing track preparation failed', error)
        throw new Error(`${session.backing.fileName || 'The backing track'} could not be loaded. Choose the file again.`)
      }
    }

    return sources
  }, [session.backing, session.panels, session.endSec, session.practice.bpm, sync.getPanelTimelineSettings, sync.getPanelMediaDuration])

  const playAllFromStart = useCallback(async (requestedStart = 0) => {
    const duration = session.endSec ?? Math.max(sync.state.duration,
      ...session.panels.map(p => p.kind === 'performance' && !p.hidden ? panelEndSec(p, session.practice.bpm) : 0))
    const startAt = playbackStartPosition(requestedStart, duration)
    sync.pause()
    pauseBacking()
    await stopNativeGridPlayback()
    sync.setExcludePanelId(null)
    sync.setReferencePanelIds(null)
    const preRollSec = startAt > 0 ? 0 : playbackCountOffSec(session.practice.bpm)

    if (!isNativeMultitrackTransportAvailable()) {
      const generation = nativeGridPlaybackGenerationRef.current
      const started = startAt > 0 ? await sync.play() : await sync.playAllFromUserGesture(preRollSec)
      if (started) {
        const delay = Math.max(0, -multitrackTransport.rawPosition() * 1000)
        window.setTimeout(() => { if (generation === nativeGridPlaybackGenerationRef.current) void playBackingFromStart() }, delay)
      }
      return started
    }

    const generation = ++nativeGridPlaybackGenerationRef.current
    nativeGridPlaybackPreparingRef.current = true
    setIsNativeGridPlaybackPreparing(true)

    try {
      // iOS Play All uses one native AVAudioEngine graph for every take (and
      // uploaded backing audio). This avoids WebKit's multiple-media-element
      // limit and gives every source the same sample clock.
      const sources = await buildNativeMonitorSources(null, false, startAt > 0 ? startAt : -preRollSec)
      if (generation !== nativeGridPlaybackGenerationRef.current) return false

      const prepared = await prepareNativeMultitrackMonitor(sources)
      // Cancellation already owns teardown. A stale completion must never
      // stop the transport prepared for the next recording.
      if (generation !== nativeGridPlaybackGenerationRef.current) return false
      if (!prepared) {
        await stopNativeMultitrackTransport()
        return false
      }

      const snapshot = sharedMetronomeEngine.getSnapshot()
      const beatsPerBar = Math.max(
        1,
        Number.parseInt((session.practice.meter ?? '4/4').split('/')[0] ?? '4', 10) || 4,
      )
      const transport = await startNativeMultitrackTransport({
        bpm: session.practice.bpm,
        beatsPerBar: preRollSec > 0 ? 4 : beatsPerBar,
        countInBars: preRollSec > 0 ? 1 : 0,
        clickEnabled: preRollSec > 0,
        playbackCountOff: preRollSec > 0,
        soundId: session.practice.clickSound ?? snapshot.soundId,
      })
      if (generation !== nativeGridPlaybackGenerationRef.current) return false
      if (!transport) {
        await stopNativeMultitrackTransport()
        return false
      }

      nativeGridPlaybackActiveRef.current = true
      // During a count-off, sources roll from firstClickEpochMs; timeline zero
      // stays pinned to performanceEpochMs. Backing audio waits for zero.
      const downbeatEpochMs = transport.performanceEpochMs
      if (session.backing.kind === 'youtube') {
        seekYoutubeProxy(backingYoutubeIframeRef.current, Math.max(0, startAt))
        await scheduleYoutubeBackingStart(downbeatEpochMs)
      }
      const visualsStarted = await sync.startVisualPlaybackAtEpoch(
        preRollSec > 0 ? transport.firstClickEpochMs : transport.performanceEpochMs,
        startAt > 0 ? startAt : -preRollSec,
      )
      if (generation !== nativeGridPlaybackGenerationRef.current) return false
      if (!visualsStarted) {
        await stopNativeGridPlayback()
        return false
      }
      return true
    } catch (error) {
      if (generation !== nativeGridPlaybackGenerationRef.current) return false
      console.error('[MultitrackOverlay] native Play All failed', error)
      sync.pause()
      pauseBacking()
      await stopNativeGridPlayback()
      void showAlert({
        message: error instanceof Error
          ? error.message
          : 'The multitrack mix could not start. Try again.',
        tone: 'error',
      })
      return false
    } finally {
      if (generation === nativeGridPlaybackGenerationRef.current) {
        nativeGridPlaybackPreparingRef.current = false
        setIsNativeGridPlaybackPreparing(false)
      }
    }
  }, [
    buildNativeMonitorSources,
    pauseBacking,
    playBackingFromStart,
    scheduleYoutubeBackingStart,
    session.backing.kind, session.endSec, session.panels,
    session.practice.bpm, session.practice.meter, session.practice.clickSound,
    showAlert,
    stopNativeGridPlayback,
    sync,
  ])

  const pauseAllPlayback = useCallback(() => {
    sync.pause()
    pauseBacking()
    void stopNativeGridPlayback()
  }, [pauseBacking, stopNativeGridPlayback, sync])

  // Keep/Retry and opening another box may happen before native recovery
  // finishes. Arming must await that same handoff, never race it.
  const recordingRecoveryRef = useRef<Promise<void>>(Promise.resolve())
  const restoreRecordingReadiness = useCallback(() => {
    inGridReviewMediaRef.current?.pause()
    sync.pause()
    pauseBacking()
    const recovery = recordingRecoveryRef.current.catch(() => {}).then(async () => {
      await stopNativeGridPlayback()
      await stopNativeMultitrackTransport()
      await completePlaybackRouteRestore()
      await ensureNativeCameraSessionHealthy()
    })
    recordingRecoveryRef.current = recovery
    // Background warm-up has no caller to surface a rejection. Arming below
    // still awaits the original promise and reports failures to the player.
    void recovery.catch(error => console.warn('[Multitrack] capture handoff failed', error))
    return recovery
  }, [pauseBacking, stopNativeGridPlayback, sync.pause])

  const recording = useMultitrackRecording({
    onPrepareRecording: (panelId) => {
      recordingTargetPanelIdRef.current = panelId
      sync.setExcludePanelId(panelId)
      const referenceIds = session.panels
        .filter((panel) =>
          panel.kind === 'performance' &&
          panel.id !== panelId &&
          panel.take !== null && !panel.hidden,
        )
        .map((panel) => panel.id)
      sync.setReferencePanelIds(referenceIds)
    },
    onStartMicRecording: () => onStartRecording(),
    onAbortMicRecording: () => {
      discardNextRecordingRef.current = true
      onStopRecording()
    },
    onArmPlayback: async (panelId) => {
      await restoreRecordingReadiness()
      if (session.backing.kind === 'youtube') {
        await prepareBackingAtStart()
        seekYoutubeProxy(backingYoutubeIframeRef.current, recordStartSecRef.current)
      }
      // Adding a part that only exists at the bridge shouldn't mean sitting
      // through the whole song: the monitor mix rolls from the playhead.
      const startSec = recordStartSecRef.current
      const sources = await buildNativeMonitorSources(panelId, true, startSec)
      nativeTransportActiveRef.current = await prepareNativeMultitrackMonitor(sources)
      if (nativeTransportActiveRef.current) {
        await sync.prepareVisualAtStart(startSec)
        return true
      }
      if (isNativeMultitrackTransportAvailable()) return false

      // Browser development fallback. iOS production must use the native
      // transport; this path keeps the feature testable without AVFoundation.
      await sync.prepareAtStart(startSec)
      await prepareBackingAtStart()
      return true
    },
    onStartTransport: async ({ bpm, countInBars, clickEnabled }) => {
      const snapshot = sharedMetronomeEngine.getSnapshot()
      const beatsPerBar = Math.max(1, Number.parseInt((session.practice.meter ?? '4/4').split('/')[0] ?? '4', 10) || 4)
      if (nativeTransportActiveRef.current) {
        return startNativeMultitrackTransport({
          bpm,
          beatsPerBar,
          countInBars,
          clickEnabled,
          soundId: session.practice.clickSound ?? snapshot.soundId,
        })
      }

      sharedMetronomeEngine.applySectionConfig(
        {
          bpm,
          meter: (session.practice.meter ?? '4/4') as import('../../utils/metronomeConfig').MetronomeMeter,
          subdivision: 'off',
          pulseModeId: 'default',
          accentLevels: ['strong', 'weak', 'weak', 'weak'],
        },
        { resetBeat: true },
      )
      const started = clickEnabled || countInBars > 0 ? await sharedMetronomeEngine.start() : true
      if (!started) return null
      const beatDurationSec = 60 / bpm
      const countInBeats = beatsPerBar * countInBars
      const firstClickEpochMs = Date.now() + 50
      return {
        firstClickEpochMs,
        performanceEpochMs: firstClickEpochMs + countInBeats * beatDurationSec * 1000,
        countInBeats,
        beatDurationSec,
      }
    },
    onTransportScheduled: async (transport) => {
      recordingPerformanceEpochRef.current = transport.performanceEpochMs
      if (!monitorMutesRef.current.has('backing')) {
        await scheduleYoutubeBackingStart(transport.performanceEpochMs)
      }
    },
    onStopTransport: () => {
      if (nativeTransportActiveRef.current) {
        void stopNativeMultitrackTransport()
      }
      nativeTransportActiveRef.current = false
      sync.pause()
    },
    recoverFromInterrupt: () => {
      sync.pause()
      pauseBacking()
      sync.setExcludePanelId(null)
      sync.setReferencePanelIds(null)
      sharedMetronomeEngine.stop()
    },
    onPerformanceStart: async () => {
      // Native transport already started panel audio and uploaded backings on
      // the exact downbeat. YouTube cannot join that native graph, so it remains
      // an explicitly best-effort preview source.
      if (!nativeTransportActiveRef.current) {
        if (!session.practice.clickEnabled || monitorMutesRef.current.has('click')) sharedMetronomeEngine.stop()
        await sync.startPrepared()
      } else {
        await sync.startVisualPlaybackAtEpoch(recordingPerformanceEpochRef.current, recordStartSecRef.current, true)
      }
      if (
        session.backing.kind === 'youtube' &&
        !monitorMutesRef.current.has('backing') &&
        youtubeScheduledPerformanceRef.current === null
      ) {
        await startBackingPlayback()
      }
    },
    onError: (message) => {
      setPendingReview(null)
      pauseBacking()
      sync.setExcludePanelId(null)
      sync.setReferencePanelIds(null)
      nativeTransportActiveRef.current = false
      void showAlert({ message, tone: 'error' })
    },
  })

  // Watchdog: phase says 'recording' but the camera never confirmed — abort
  // loudly instead of leaving a dead-end stage (no take will ever arrive).
  useEffect(() => {
    if (recording.phase !== 'recording' || isRecording) return
    const timer = window.setTimeout(() => {
      onStopRecording()
      void ensureNativeCameraSessionHealthy()
      recordingRef.current.fail('The camera never started recording. Please try again.')
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [isRecording, onStopRecording, recording.phase])

  // Watchdog: stopped into review but the take never arrived from the save
  // pipeline — reset with an error instead of freezing on a blank review.
  useEffect(() => {
    if (recording.phase !== 'review' || pendingReview) return
    const timer = window.setTimeout(() => {
      recordingRef.current.fail('The recording could not be saved. Please try again.')
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [pendingReview, recording.phase])

  useEffect(() => {
    recordingTargetPanelIdRef.current = recording.targetPanelId
    sync.setExcludePanelId(recording.targetPanelId)
  }, [recording.targetPanelId, sync])

  useEffect(() => {
    if (!isOpen) pauseAllPlayback()
  }, [isOpen, pauseAllPlayback])

  useEffect(() => {
    if (session.backing.kind === 'none') pauseBacking()
  }, [pauseBacking, session.backing.kind])

  // ── Idle / background recovery ───────────────────────────────────────────
  // Everything the lifecycle listeners touch is read through refs: the objects
  // below are rebuilt on every render, and depending on them directly would
  // re-subscribe these listeners on each one.
  const recordingRef = useRef(recording)
  recordingRef.current = recording
  const activePanelIdRef = useRef(activePanelId)
  activePanelIdRef.current = activePanelId
  const pauseAllPlaybackRef = useRef(pauseAllPlayback)
  pauseAllPlaybackRef.current = pauseAllPlayback
  const onWakeCameraRef = useRef(onWakeCamera)
  onWakeCameraRef.current = onWakeCamera
  /** The capture surface is genuinely delivering pictures right now. */
  const cameraLive = nativeLivePreviewActive === true || streamRef.current !== null
  const cameraLiveRef = useRef(cameraLive)
  cameraLiveRef.current = cameraLive

  // After background / lock screen / app switch: iOS has already torn down the
  // capture session, the AVAudioEngine monitor graph, and the audio route. Stop
  // pretending any of them are still rolling, then heal them on return.
  useEffect(() => {
    if (!isOpen) return

    const wakeTimers: number[] = []
    const clearWakeTimers = () => {
      for (const id of wakeTimers.splice(0)) window.clearTimeout(id)
    }

    const onBackground = () => {
      clearWakeTimers()
      pauseAllPlaybackRef.current()
      const phase = recordingRef.current.phase
      if (phase === 'arming' || phase === 'count-in') {
        // Nothing musical was captured yet. cancel() aborts capture and flags the
        // fragment for deletion itself when the recorder had already started.
        recordingRef.current.cancel()
      } else if (phase === 'recording') {
        // Native capture was already stopped for us and the partial take is on
        // its way to the vault; land it in review so it can be kept or retried
        // instead of leaving the stage stuck on a recording that ended.
        recordingRef.current.enterReview()
      }
    }

    const onForeground = () => {
      clearWakeTimers()
      wakeDismissedRef.current = false
      recordingRef.current.recover()
      void resumePlaybackAudioContext()
      void sharedMetronomeEngine.prepareForCountIn()
      void ensureNativeCameraSessionHealthy()

      // Give the app's own camera restart a moment. If the stage still has no
      // picture, re-acquire it once ourselves, and only ask the user to tap
      // when even that didn't bring it back.
      wakeTimers.push(window.setTimeout(() => {
        if (!activePanelIdRef.current || cameraLiveRef.current) {
          setNeedsWake(false)
          return
        }
        void onWakeCameraRef.current?.()
        wakeTimers.push(window.setTimeout(() => {
          if (!activePanelIdRef.current || cameraLiveRef.current) return
          setNeedsWake(true)
        }, 2200))
      }, 1500))
    }

    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackground)
    window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, onForeground)
    const onVisible = () => {
      if (document.visibilityState === 'visible') onForeground()
      else onBackground()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearWakeTimers()
      window.removeEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackground)
      window.removeEventListener(APP_FOREGROUND_RECOVERY_EVENT, onForeground)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isOpen])

  // Standing watchdog for every other way the camera can go idle (interrupted
  // session, phone call, another app grabbing the camera): a live picture
  // clears the prompt, a long dead one raises it.
  useEffect(() => {
    if (cameraLive) {
      wakeDismissedRef.current = false
      setNeedsWake(false)
      return
    }
    if (
      !isOpen ||
      !activePanelId ||
      pendingReview ||
      wakeDismissedRef.current ||
      recording.phase !== 'idle'
    ) return
    const timer = window.setTimeout(() => setNeedsWake(true), 5000)
    return () => window.clearTimeout(timer)
  }, [activePanelId, cameraLive, isOpen, pendingReview, recording.phase])

  useEffect(() => {
    if (!isOpen) {
      setNeedsWake(false)
      wakeDismissedRef.current = false
    }
  }, [isOpen])

  const handleWakeTap = useCallback(() => {
    if (isWaking) return
    setIsWaking(true)
    void (async () => {
      try {
        // A real tap is the one moment iOS lets us re-arm every engine at once.
        requestInteractiveMediaRecovery('multitrack-wake-tap')
        await resumePlaybackAudioContext()
        await sharedMetronomeEngine.prepareForCountIn()
        await ensureNativeCameraSessionHealthy()
        await onWakeCamera?.()
      } catch (error) {
        console.warn('[Multitrack] tap-to-reactivate failed', error)
      } finally {
        setIsWaking(false)
        setNeedsWake(false)
      }
    })()
  }, [isWaking, onWakeCamera])

  const handleWakeDismiss = useCallback(() => {
    wakeDismissedRef.current = true
    setNeedsWake(false)
  }, [])

  useEffect(() => {
    const targetPanelId = recording.targetPanelId ?? activePanelId
    if (!pendingRecordingTakeId || !targetPanelId) return
    const take = takes.find((t) => t.id === pendingRecordingTakeId)
    if (!take) return
    if (discardNextRecordingRef.current) {
      discardNextRecordingRef.current = false
      onDeleteTakes([take.id])
      onRecordingComplete()
      onClearPendingRecording()
      return
    }
    // A part shot on the front camera is kept the way the player saw it while
    // performing: review, the grid and the export all mirror it.
    const mirrored = getCameraFacingFront()
    setPendingReview({ panelId: targetPanelId, take: { ...take, mirrorPlayback: mirrored }, mirrored })
    onRecordingComplete()
    onClearPendingRecording()
  }, [activePanelId, onClearPendingRecording, onDeleteTakes, onRecordingComplete, pendingRecordingTakeId, recording.targetPanelId, takes])

  // When Play All (or align-stage preview) finishes naturally, hand the audio
  // route back to recording — but never while a take is arming/counting/rolling,
  // where a reference clip ending early must NOT tear down the shared session.
  const recordingPhaseRef = useRef(recording.phase)
  recordingPhaseRef.current = recording.phase
  useEffect(() => {
    sync.setOnAllEnded(() => {
      if (recordingPhaseRef.current !== 'idle') return
      pauseBacking()
      void stopNativeGridPlayback()
      void completePlaybackRouteRestore().catch(() => {})
    })
    return () => sync.setOnAllEnded(null)
  }, [pauseBacking, stopNativeGridPlayback, sync.setOnAllEnded])

  const handleConfirmTake = useCallback(() => {
    if (!pendingReview) return
    const startSec = recordStartSecRef.current
    recordStartSecRef.current = 0

    if (startSec > 0) {
      // The take was captured against the mix rolling from `startSec`, so its
      // downbeat belongs at `startSec` on the timeline, not at zero. Shifting
      // the offset (rather than the media) keeps one canonical placement that
      // Play All, the align stage, and the export all read.
      const take = pendingReview.take
      const capturedOffsetMs = timelineOffsetMsForTake(take, session.practice.bpm)
      const offsetMs = Math.round(-startSec * 1000)
      assignTakeToPanel(pendingReview.panelId, take)
      updatePanel(pendingReview.panelId, { timelineOffsetMs: offsetMs, trimStartSec: Math.max(0, capturedOffsetMs / 1000), mirrored: pendingReview.mirrored })
      sync.setPanelOffset(pendingReview.panelId, offsetMs)
      sync.setPanelTrim(pendingReview.panelId, Math.max(0, capturedOffsetMs / 1000), null)
      // The new box appears exactly while its own part plays.
      const takeDuration = take.duration ?? 0
      setPanelSection(
        pendingReview.panelId,
        startSec,
        takeDuration > 0 ? startSec + Math.max(.05, takeDuration - capturedOffsetMs / 1000) : undefined,
      )
    } else {
      assignTakeToPanel(pendingReview.panelId, pendingReview.take)
      updatePanel(pendingReview.panelId, { mirrored: pendingReview.mirrored })
    }

    setPendingReview(null)
    recording.cancel()
    setActivePanelId(null)
    pauseAllPlayback()
    sync.seek(0)
    playAllFromBeginningAfterRecordRef.current = true
    restoreRecordingReadiness()
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
  }, [
    assignTakeToPanel, updatePanel,
    pauseAllPlayback,
    pendingReview,
    recording,
    restoreRecordingReadiness,
    session.practice.bpm,
    setPanelSection,
    showAlert,
    sync,
  ])

  const handleRetryTake = useCallback(() => {
    if (!pendingReview) return
    setPendingReview(null)
    recording.cancel()
    restoreRecordingReadiness()
  }, [pendingReview, recording, restoreRecordingReadiness])

  const activePanel = session.panels.find((panel) => panel.id === activePanelId)

  const hasAnyTake = session.panels.some(
    (panel) => panel.kind === 'performance' && !panel.hidden && panel.take !== null,
  )
  const shareDisabled = !hasAnyTake || isExporting || recording.phase !== 'idle'
  const incomingProjectHandler = useRef<() => void>(() => {})
  incomingProjectHandler.current = () => {
    if (!isOpen || isRestoring || projectFileBusyRef.current || recording.phase !== 'idle' || isExporting || !getPendingMultitrackFile()) return
    const url = consumeMultitrackFile()!
    void handleProjectFile(url)
  }
  useEffect(() => subscribeMultitrackFile(() => incomingProjectHandler.current()), [])
  useEffect(() => { incomingProjectHandler.current() }, [isOpen, isRestoring, projectFileBusy, recording.phase, isExporting])

  useEffect(() => {
    // While the timeline editor is open it owns the live offsets and trims —
    // it writes every drag straight into sync. Re-deriving them from the saved
    // session here would snap a clip back mid-gesture, so stand down until the
    // editor closes and this effect reconciles against the saved values again.
    if (alignStageOpen) return
    for (const panel of session.panels) {
      if (panel.kind !== 'performance') continue
      sync.setPanelVolume(panel.id, panel.volume ?? 1)
      sync.setPanelMuted(panel.id, panel.muted === true || panel.hidden === true)
      sync.setPanelTrim(panel.id, panel.trimStartSec ?? 0, panel.trimEndSec ?? null)
      sync.setPanelOffset(panel.id, panelOffsetMs(panel, session.practice.bpm))

    }
  }, [alignStageOpen, session.panels, session.practice.bpm, sync])

  useEffect(() => {
    sync.setProjectRules(session.endSec, session.panels.filter(p => p.kind === 'performance' && p.hidden).map(p => p.id),
      session.panels.flatMap(p => {
        if (p.kind !== 'performance') return []
        const visualLeadIn = overlayLeadInSec(p, session.practice.bpm)
        if (p.sectionAudio || visualLeadIn) {
          return [{ id: p.id, start: p.sectionStartSec, end: p.sectionEndSec, visualLeadIn }]
        }
        return []
      }))
  }, [session.endSec, session.panels, session.practice.bpm, sync.setProjectRules])

  const tileSheetPanel = session.panels.find(
    (panel) => panel.id === tileSheetPanelId && panel.kind === 'performance',
  )
  const tileSheetTake = tileSheetPanel?.kind === 'performance' ? tileSheetPanel.take : null

  /**
   * `startSec` is the timeline position the monitor mix will roll from — always
   * passed explicitly so a mid-song overdub can never leak into the next plain
   * recording, which would start the references mid-track while the count-in
   * counted from the top.
   */
  const openRecordingForPanel = useCallback(
    (panelId: string, startSec = 0) => {
      triggerLightHaptic(hapticFeedback)
      recordStartSecRef.current = Math.max(0, startSec)
      setTileSheetPanelId(null)
      onOpenRecordingStage?.()
      setActivePanelId(panelId)
      recordingTargetPanelIdRef.current = panelId
      sync.setExcludePanelId(panelId)
      sync.setReferencePanelIds(
        session.panels
          .filter((panel) => panel.kind === 'performance' && panel.id !== panelId && panel.take)
          .map((panel) => panel.id),
      )
      // A previous preview can leave reference videos parked at their ends
      // (opacity zero). Restore their frames before the player presses Record.
      sync.seek(Math.max(0, startSec))
      void restoreRecordingReadiness().then(async () => {
        if (activePanelIdRef.current !== panelId) return
        await sync.prepareVisualAtStart(Math.max(0, startSec))
      }).catch(error => console.warn('[Multitrack] reference preview failed', error))
    },
    [hapticFeedback, onOpenRecordingStage, restoreRecordingReadiness, session.panels, sync],
  )

  /** Tempo the count-in and the recorded take are anchored to. */
  const resolveRecordingGrid = useCallback(() => {
    const bpm = session.practice.bpm
    const beatsPerBar = Math.max(1, Number.parseInt((session.practice.meter ?? '4/4').split('/')[0] ?? '4', 10) || 4)
    const safeBpm = Math.max(40, Math.min(300, Math.round(bpm) || 120))
    return { bpm: safeBpm, beatsPerBar, barSec: (60 / safeBpm) * beatsPerBar }
  }, [session.practice.bpm, session.practice.meter])

  /**
   * Overdubs drop in on a downbeat. Starting at an arbitrary second would put
   * the count-in click a fraction of a beat out of phase with everything already
   * recorded, so the click would fight the track instead of leading into it.
   */
  const snapToDownbeat = useCallback(
    (atSec: number) => {
      const { barSec } = resolveRecordingGrid()
      if (!Number.isFinite(barSec) || barSec <= 0) return Math.max(0, atSec)
      return Math.max(0, Math.round(Math.max(0, atSec) / barSec) * barSec)
    },
    [resolveRecordingGrid],
  )

  /**
   * Timeline "+": claim a box and overdub into it from the playhead.
   *
   * The box's section window is deliberately NOT set here. It is set once the
   * take actually lands (handleConfirmTake), so abandoning the recording leaves
   * nothing behind to clean up — a stale window on an empty box would drop it
   * out of the grid and reshuffle the canvas on the next Play All.
   */
  const handleAddBoxAt = useCallback(
    (atSec: number) => {
      const panelId = addPerformanceBox(true)
      if (!panelId) {
        void showAlert({
          message: 'You can add four extra boxes on top of the twelve-part layout. Remove an extra box to add another.',
        })
        return
      }
      pauseAllPlayback()
      const duration = session.endSec ?? Math.max(sync.state.duration,
        ...session.panels.map(p => p.kind === 'performance' && !p.hidden ? panelEndSec(p, session.practice.bpm) : 0))
      const startSec = snapToDownbeat(playbackStartPosition(atSec, duration))
      // Park the playhead on the bar we snapped to so the timeline shows exactly
      // where the new part will come in.
      if (startSec !== atSec) sync.seek(startSec)
      setPanelSection(panelId, startSec, undefined)
      setTileSheetPanelId(panelId)
    },
    [addPerformanceBox, pauseAllPlayback, session.endSec, session.panels, session.practice.bpm, setPanelSection, showAlert, snapToDownbeat, sync],
  )

  /** Timeline lane "Record here": overdub into an existing empty box. */
  const handleRecordBoxAt = useCallback(
    (panelId: string, atSec: number) => {
      const startSec = snapToDownbeat(atSec)
      if (startSec !== atSec) sync.seek(startSec)
      openRecordingForPanel(panelId, startSec)
    },
    [openRecordingForPanel, snapToDownbeat, sync],
  )

  /** Timeline "+ image": pick a screenshot that cuts in at the playhead. */
  const handleAddImageAt = useCallback((atSec: number) => {
    pendingImageAtSecRef.current = Math.max(0, atSec)
    sheetMusicInputRef.current?.click()
  }, [])

  /**
   * Timeline "Page": the same part, one page on, cutting in at the playhead.
   * The file is not picked again — a page turn is the same PDF, so the cue
   * points at the asset already in the project and only the page differs.
   */
  const handleAddPageAt = useCallback((atSec: number) => {
    const windows = sheetCueWindows(session.sheetMusic)
    let active = windows[0] ?? null
    for (const window of windows) if (window.startSec <= atSec) active = window
    const asset = active?.asset
    if (!asset || asset.mimeType !== 'application/pdf') return
    const pageIndex = (asset.pageIndex ?? 0) + 1
    if (pageIndex >= (asset.pageCount ?? 0)) return
    addSheetCue({ ...asset, pageIndex }, Math.max(0, atSec))
  }, [addSheetCue, session.sheetMusic])

  /**
   * Removing an image from the timeline. The opening image is the panel's base
   * asset rather than a cue, so it has to be cleared through assignSheetMusic —
   * whichever cue comes next then takes over the top of the song.
   */
  const handleRemoveSheetImage = useCallback(
    (cueId: string) => {
      if (cueId === SHEET_BASE_CUE_ID) {
        assignSheetMusic(session.sheetMusic.id, null)
        return
      }
      removeSheetCue(cueId)
    },
    [assignSheetMusic, removeSheetCue, session.sheetMusic.id],
  )

  const backingChipLabel =
    session.backing.kind === 'none'
      ? 'Add backing'
      : session.backing.kind === 'audio'
        ? session.backing.fileName
        : session.backing.label || 'YouTube'

  const headphonesConnected = useHeadphoneOutput()
  const headphoneNoticeShownForOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      headphoneNoticeShownForOpenRef.current = false
      return
    }
    if (!activePanel || isRestoring || !session.practice.clickEnabled || headphonesConnected || headphoneNoticeShownForOpenRef.current) return
    const timer = window.setTimeout(() => {
      if (!isOpen || isHeadphoneOutputActive() || headphoneNoticeShownForOpenRef.current) return
      headphoneNoticeShownForOpenRef.current = true
      void showAlert({
        title: 'Headphones recommended',
        message:
          'Without headphones the click bleeds into your recording, so only a lead-in count-in can play. Plug in or connect headphones (wired or Bluetooth) to use the metronome while you record.',
        confirmLabel: 'Got it',
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activePanel, isRestoring, session.practice.clickEnabled, headphonesConnected, isOpen, showAlert])

  const handleSaveAlignChanges = useCallback(
    async (
      changes: Array<{
        panelId: string
        takeId: string
        offsetMs: number
        trimStart: number
        trimEnd: number | undefined
      }>,
    ) => {
      for (const change of changes) {
        const panel = session.panels.find((p) => p.id === change.panelId)
        if (!panel || panel.kind !== 'performance' || !panel.take) continue
        sync.setPanelTrim(change.panelId, change.trimStart, change.trimEnd ?? null)
        setPanelTrim(change.panelId, change.trimStart, change.trimEnd)
        updatePanel(change.panelId, { timelineOffsetMs: change.offsetMs })
      }
    },
    [updatePanel, session.panels, setPanelTrim, sync],
  )

  // ── Monitor mix ("You'll hear" chips) ────────────────────────────────────
  // Keep monitoring choices across parts within the same project.
  useEffect(() => {
    setMonitorMutes(new Set())
  }, [session.projectId])

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
    const sources: Array<{ id: string; label: string; muted: boolean; unavailableReason?: string }> = []
    session.panels.forEach((panel, index) => {
      if (panel.kind !== 'performance' || !panel.take || panel.hidden) return
      if (panel.id === activePanelId) return
      sources.push({
        id: panel.id,
        label: panel.label || panel.take.name || `Box ${index + 1}`,
        muted: monitorMutes.has(panel.id) || panel.muted === true || panel.volume === 0,
        unavailableReason: panel.muted ? 'Muted in mix' : panel.volume === 0 ? 'Volume is zero' : undefined,
      })
    })
    if (session.backing.kind !== 'none') {
      sources.push({ id: 'backing', label: backingChipLabel, muted: monitorMutes.has('backing') || session.backing.volume === 0, unavailableReason: session.backing.volume === 0 ? 'Volume is zero' : undefined })
    }
    if (session.practice.clickEnabled) {
      sources.push({ id: 'click', label: 'Click', muted: monitorMutes.has('click') })
    }
    return sources
  }, [activePanelId, backingChipLabel, monitorMutes, session.backing.kind, session.backing.volume, session.panels, session.practice.clickEnabled])

  const closeRecorder = () => {
                if (isRecording && (recording.phase === 'idle' || recording.phase === 'review')) {
                  discardNextRecordingRef.current = true
                  onStopRecording()
                }
                if (pendingReview) {
                  setPendingReview(null)
                }
                sync.setExcludePanelId(null)
                sync.setReferencePanelIds(null)
                sync.setMonitorMutedPanelIds([])
                sync.pause()
                pauseBacking()
                recording.cancel()
                recordStartSecRef.current = 0
                setActivePanelId(null)
                sync.seek(0)
                playAllFromBeginningAfterRecordRef.current = true
  }

  return createPortal(
    <>
      {projectFileBusy && <div className="multitrack-file-busy" role="alert" aria-live="polite"><strong>Preparing project file…</strong><span>Keeping your recordings and layout together.</span></div>}
      <AnimatePresence>
        {isOpen && (
          <motion.div ref={shellRef} key="mt-overlay" className="multitrack-overlay multitrack-overlay--camera-mode multitrack-quiet-workspace" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={iosSpringSnappy} style={motionGpuLayer} role="dialog" aria-modal="true">
            <header className="multitrack-overlay__header">
              <Pressable type="button" intensity="soft" disabled={isExporting || isRecording || isStopping || alignStageOpen} onClick={activePanel ? closeRecorder : onClose} aria-label={activePanel ? "Back to workspace" : "Return to Camera Mode"} className="multitrack-camera-back">
                <ChevronLeft className="h-6 w-6" />
              </Pressable>
              <button type="button" className="multitrack-camera-title multitrack-project-trigger" aria-label="Open project and parts" disabled={isRestoring || isExporting || !!activePanel || alignStageOpen} onClick={() => { pauseAllPlayback(); setActiveSourceSheet('project') }}>
                <h1>{activePanel ? recording.phase === 'review' ? 'Review take' : 'Record a part' : 'Multitrack'}</h1>
                <span>{session.name || 'My performance'}</span>
              </button>
              <Pressable
                type="button"
                intensity="normal"
                onClick={() => { if (alignStageOpen) { void showAlert({ message: 'Tap Done in the editor to apply your timing changes before exporting.' }); return } pauseAllPlayback(); setActiveSourceSheet('export') }}
                disabled={isRestoring || isExporting || !!activePanel || recording.phase !== 'idle'}
                className="multitrack-share-btn"
              >
                <Share2 className="h-4 w-4" />
                {isExporting ? 'Rendering…' : 'Export'}
              </Pressable>
            </header>
            {isRestoring && !persistenceNotice ? <p role="status" className="px-4 py-2 text-sm">Opening workspace…</p> : null}
            {persistenceNotice ? <p role="status" className="px-4 py-2 text-sm">{persistenceNotice}</p> : null}
            <div inert={isRestoring || isExporting} className={`multitrack-overlay__body ${alignStageOpen ? 'multitrack-overlay__body--editing' : ''}`}>
              {layoutEditing && <>
                <div className="multitrack-studio-actions multitrack-arrange-actions">
                  <button disabled={!canUndo || isExporting} onClick={() => { pauseAllPlayback(); undo() }}>Undo</button>
                  <button disabled={isExporting} onClick={() => handleAddBoxAt(sync.state.currentTime)}>+ Extra box</button>
                  <button onClick={() => setLayoutEditing(false)}>Done arranging</button>
                </div>
                <p className="multitrack-arrange-hint">Select a box to move or resize it.</p>
              </>}
              <MultitrackPanelGrid onDeleteExtra={id => updateProject({ panels: session.panels.filter(p => p.id !== id) })} aspectRatio="9:16" layoutStyle={session.layoutStyle} bpm={session.practice.bpm} editable={layoutEditing || alignStageOpen} interactionDisabled={isExporting || !!activePanel || recording.phase !== 'idle' || sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing} onMoveOverlay={(id, rect) => { const panel = session.panels.find(p => p.id === id); updatePanel(id, panel?.kind === 'performance' && panel.overlay ? { overlay: rect } : { frame: rect }) }} layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={activePanelId} recordingPhase={recording.phase}
                streamRef={streamRef} streamGeneration={streamGeneration}
                nativeLivePreviewActive={nativeLivePreviewActive} nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
                countInRemaining={recording.countInRemaining} recordingElapsed={elapsed}
                reviewTake={pendingReview?.panelId === activePanelId ? pendingReview.take : null}
                reviewMediaRef={inGridReviewMediaRef}
                onTapPerformance={(id) => { triggerLightHaptic(hapticFeedback); setTileSheetPanelId(id) }}
                onRemoveTake={(id) => assignTakeToPanel(id, null)}
                onSheetMusicChange={handleSheetMusicAssetChange}
                onSheetCueAssetChange={updateSheetCueAsset}
                onRemoveSheetCue={handleRemoveSheetImage}
                onEditSheetMusic={() => setActiveSourceSheet('visual')}
                currentTimeSec={sync.state.currentTime}
                onRegisterMedia={registerPanelMedia} onBeginPanelPreview={sync.beginPanelPreview} onEndPanelPreview={sync.endPanelPreview} />
              {!alignStageOpen && <MultitrackWorkspaceTools practice={session.practice} onChange={handlePracticeChange} onOpenTools={() => setActiveSourceSheet('tools')}
                streamRef={streamRef} mediaRef={masterMediaRef} tunerInstrument={tunerInstrument} busy={isRecording || isStopping || recording.phase !== 'idle'}
                routine={props.routine} backingLabel={session.backing.kind !== 'none' ? backingChipLabel : undefined} onOpenBacking={() => setActiveSourceSheet('backing')}
                musicLabel={layoutSheetAsset?.fileName} onOpenMusic={() => setActiveSourceSheet('visual')} />}

            </div>
            {/* The timeline editor docks under the live canvas rather than
                covering it: the grid above IS the preview you are editing. */}
            {activePanel ? (
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
                  : null
              }
              inGrid
              dock
              reviewMediaRef={inGridReviewMediaRef}
              monitorSources={monitorSources}
              onToggleMonitorSource={toggleMonitorSource}
              hasBacking={session.backing.kind !== 'none'}
              onPracticeChange={handlePracticeChange}
              onRecord={() => {
                if (isRecording || isStopping) return
                discardNextRecordingRef.current = false
                recordingTargetPanelIdRef.current = activePanel.id
                sync.setExcludePanelId(activePanel.id)
                if (
                  session.backing.kind === 'youtube' &&
                  !monitorMutesRef.current.has('backing')
                ) {
                  prepareBackingForRecord()
                }
                // Same tempo source the overdub start point was snapped to — if
                // these two disagreed the click would land off the bar grid.
                recording.beginCountIn(activePanel.id, {
                  ...session.practice,
                  bpm: resolveRecordingGrid().bpm,
                  // The click never loops through the speaker while the mic is
                  // open: without headphones it bleeds into the take, so only
                  // the count-in plays and then it stops.
                  clickEnabled:
                    session.practice.clickEnabled &&
                    !monitorMutesRef.current.has('click') &&
                    isHeadphoneOutputActive(),
                })
              }}
              onStop={() => {
                sync.setExcludePanelId(null)
                sync.setReferencePanelIds(null)
                sync.pause()
                pauseBacking()
                if (recording.phase !== 'recording') {
                  discardNextRecordingRef.current = true
                  recording.cancel()
                  return
                }
                const timing = recording.getRecordingTiming()
                onStopRecording(
                  timing
                    ? {
                        timelineOffsetMs: timing.timelineOffsetMs,
                        recordingBpm: timing.recordingBpm,
                        performanceStartBeats: timing.performanceStartBeat,
                      }
                    : undefined,
                )
                recording.enterReview()
              }}
              onUseExisting={() => setTakePickerPanelId(activePanel.id)}
              onConfirmTake={handleConfirmTake}
              onRetryTake={handleRetryTake}
              onDiscardTake={() => {
                if (!pendingReview || isStopping) return
                onDeleteTakes([pendingReview.take.id])
                handleRetryTake()
                setActivePanelId(null)
              }}
              onClose={closeRecorder}
            />
          </motion.div>
        )}
      </AnimatePresence>
            ) : alignStageOpen ? (
              <MultitrackAlignStage
                onPanelVolumeChange={setPanelVolume}
                onPanelMuteToggle={setPanelMuted}
                isOpen={alignStageOpen}
                panels={session.panels.filter(
                  (panel): panel is PerformancePanelState => panel.kind === 'performance',
                )}
                sheetMusic={session.sheetMusic}
                bpm={session.practice.bpm}
                sync={sync}
                busy={isExporting || recording.phase !== 'idle'}
                onClose={() => {
                  pauseAllPlayback()
                  setAlignStageOpen(false)
                }}
                onPreviewToggle={() => {
                  if (sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing) {
                    pauseAllPlayback()
                    return
                  }
                  const startAt = playAllFromBeginningAfterRecordRef.current ? 0 : sync.state.currentTime
                  playAllFromBeginningAfterRecordRef.current = false
                  void playAllFromStart(startAt)
                }}
                onEditStart={pauseAllPlayback}
                onAddBox={handleAddBoxAt}
                onRecordBox={handleRecordBoxAt}
                onAddImage={handleAddImageAt}
                onAddPage={handleAddPageAt}
                onMoveImage={moveSheetCue}
                onRemoveImage={handleRemoveSheetImage}
                onRestoreSheetMusic={sheetMusic => updateProject({ sheetMusic })}
                onSectionChange={setPanelSection}
                onDone={handleSaveAlignChanges}
              />
            ) : (
              <>{sync.state.isPlaying && sync.state.preRollRemaining > 0 && <div className="multitrack-playback-count" role="status">Count in · {Math.min(4, Math.ceil(sync.state.preRollRemaining / (60 / session.practice.bpm)))}</div>}
              <MultitrackToolbar isPlaying={sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing} currentTime={sync.state.currentTime} duration={sync.state.duration}
                onAddPart={() => {
                  pauseAllPlayback()
                  const panelId = addPerformanceBox()
                  if (!panelId) { void showAlert({ message: 'All twelve parts are filled. Tap a part to replace its recording.' }); return }
                  setTileSheetPanelId(panelId)
                }}
                onOpenLayout={() => { pauseAllPlayback(); setActiveSourceSheet('layout') }}
                onOpenAlign={() => { setLayoutEditing(false); setAlignStageOpen(true) }}
                onTogglePlay={() => {
                  if (sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing) {
                    pauseAllPlayback()
                    return
                  }
                  const startAt = playAllFromBeginningAfterRecordRef.current ? 0 : sync.state.currentTime
                  playAllFromBeginningAfterRecordRef.current = false
                  void playAllFromStart(startAt)
                }} onRestart={() => void playAllFromStart()} onSeek={(time) => {
                  playAllFromBeginningAfterRecordRef.current = false
                  if (nativeGridPlaybackActiveRef.current || nativeGridPlaybackPreparingRef.current) {
                    pauseAllPlayback()
                  }
                  sync.seek(time)
                }} /></>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Last-resort recovery. Everything above tries to heal itself first; this
          only appears when the camera still has no picture after that. */}
      <AnimatePresence>
        {isOpen && needsWake ? (
          <motion.div
            key="mt-wake-veil"
            className="multitrack-wake-veil"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alertdialog"
            aria-label="Multitrack went to sleep"
          >
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className="multitrack-wake-veil__card"
              onClick={handleWakeTap}
              disabled={isWaking}
            >
              <RefreshCw className={`h-7 w-7 ${isWaking ? 'multitrack-wake-veil__spin' : ''}`} />
              <strong>{isWaking ? 'Waking up…' : 'Tap to reactivate'}</strong>
              <span>
                The camera and audio went to sleep while you were away. Your boxes and takes are
                still here.
              </span>
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="multitrack-wake-veil__dismiss"
              onClick={handleWakeDismiss}
            >
              Not now
            </Pressable>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <MultitrackTakePicker isOpen={takePickerPanelId !== null} takes={takes} onClose={() => setTakePickerPanelId(null)} onSelectTake={(take) => {
        if (takePickerPanelId) {
          const panel = session.panels.find(p => p.id === takePickerPanelId)
          assignTakeToPanel(takePickerPanelId, take)
          if (panel?.kind === 'performance' && panel.overlay) {
            const start = panel.sectionStartSec ?? 0
            const sourceIn = Math.max(0, timelineOffsetMsForTake(take, session.practice.bpm) / 1000)
            updatePanel(panel.id, { timelineOffsetMs: -start * 1000, trimStartSec: sourceIn,
              sectionStartSec: start, sectionEndSec: start + Math.max(.05, (take.duration ?? 0) - sourceIn) })
          }
        }
        setTakePickerPanelId(null); setActivePanelId(null)
      }} />

      {/* Backing audio/iframe must outlive the on-demand sheet UI. */}
      {isOpen ? (
        <MultitrackBackingMediaHost
          backing={session.backing}
          audioRef={backingAudioRef}
          youtubeIframeRef={backingYoutubeIframeRef}
          playYoutubeWhenReady={backingPlaying}
        />
      ) : null}

      {/* Sheet music / image picker (triggered from the tile sheet and from the
          timeline's "Add image here"). */}
      <input
        ref={sheetMusicInputRef}
        type="file"
        accept={sheetMusicAcceptAttribute()}
        className="sr-only"
        aria-label="Import multitrack photo or PDF"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          const atSec = pendingImageAtSecRef.current
          pendingImageAtSecRef.current = null
          if (!file) return
          void loadSheetMusicFile(file).then((asset) => {
            if (atSec === null) {
              // Picked from the mix strip / tile sheet: this is the panel image.
              assignSheetMusic(session.sheetMusic.id, asset)
              setActiveSourceSheet('visual')
              return
            }
            // Picked from the timeline: cut it in at that second, and only open
            // the placement sheet for the very first image, when the panel is
            // still deciding where it lives.
            const isFirstImage =
              !session.sheetMusic.asset && (session.sheetMusic.cues?.length ?? 0) === 0
            addSheetCue(asset, atSec)
            if (isFirstImage) setActiveSourceSheet('visual')
          }).catch((cause: unknown) => {
            // A file that cannot be read has to say so now. Failing quietly
            // left a white rectangle in the middle of the video with no
            // explanation and no way to tell it from a page of rests.
            void showAlert({
              message: cause instanceof Error && cause.message
                ? cause.message
                : 'That file could not be opened. Try a PDF or a photo of the page.',
            })
          })
          event.currentTarget.value = ''
        }}
      />

        <AnimatedBottomSheet
          isOpen={activeSourceSheet === 'visual' && isOpen}
          onClose={() => setActiveSourceSheet(null)}
          ariaLabel={layoutSheetAsset ? "Image and sheet layout" : "Music, photo or PDF"}
          elevated
          elevatedLight
          transparentBackdrop
          zClass={MULTITRACK_SHEET_Z}
          maxHeightClass="max-h-[60vh]"
        >
          {layoutSheetAsset ? <div className="multitrack-sheet multitrack-visual-editor">
            <div className="multitrack-visual-editor__heading">
              <div>
                <p className="multitrack-sheet__title">Image &amp; sheet layout</p>
                <p>Choose where its panel sits. After closing this sheet, drag the image or pinch it directly to zoom.</p>
              </div>
              <Pressable
                type="button"
                intensity="normal"
                className="multitrack-visual-editor__done"
                onClick={() => setActiveSourceSheet(null)}
              >
                Done
              </Pressable>
            </div>

            <section className="multitrack-visual-editor__section">
              <div className="multitrack-visual-editor__section-title">
                <strong>Place panel</strong>
                <span>This moves the whole image panel around your videos.</span>
              </div>
              <div className="multitrack-visual-editor__placements" role="radiogroup" aria-label="Image panel placement">
                {SHEET_FRAME_OPTIONS.map(({ value, label, detail }) => {
                  const active = (layoutSheetAsset?.framePosition ?? 'top') === value
                  return (
                    <Pressable
                      key={value}
                      type="button"
                      intensity="soft"
                      role="radio"
                      aria-checked={active}
                      className={`multitrack-visual-editor__placement ${active ? 'is-active' : ''}`}
                      onClick={() => updateSheetMusicAsset({ framePosition: value })}
                    >
                      {layoutSheetAsset ? (
                        <SheetPlacementDiagram preset={layout} asset={layoutSheetAsset} position={value} />
                      ) : null}
                      <span>
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </span>
                    </Pressable>
                  )
                })}
              </div>
            </section>

            {layoutSheetAsset.mimeType === 'application/pdf' && (layoutSheetAsset.pageCount ?? 0) > 1 ? (
              <section className="multitrack-visual-editor__section">
                <div className="multitrack-visual-editor__section-title">
                  <strong>First page</strong>
                  <span>
                    The page on screen from the downbeat. Scroll the panel or tap its edges to
                    turn it; later pages are added to the timeline in the editor.
                  </span>
                </div>
                <div className="multitrack-visual-editor__pages" role="group" aria-label="First page">
                  <Pressable
                    type="button"
                    intensity="soft"
                    aria-label="Previous page"
                    disabled={(layoutSheetAsset.pageIndex ?? 0) <= 0}
                    onClick={() => updateSheetMusicAsset({ pageIndex: Math.max(0, (layoutSheetAsset.pageIndex ?? 0) - 1) })}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Pressable>
                  <output>
                    Page {Math.min((layoutSheetAsset.pageIndex ?? 0) + 1, layoutSheetAsset.pageCount ?? 1)}
                    {' of '}
                    {layoutSheetAsset.pageCount}
                  </output>
                  <Pressable
                    type="button"
                    intensity="soft"
                    aria-label="Next page"
                    disabled={(layoutSheetAsset.pageIndex ?? 0) >= (layoutSheetAsset.pageCount ?? 1) - 1}
                    onClick={() => updateSheetMusicAsset({ pageIndex: Math.min((layoutSheetAsset.pageCount ?? 1) - 1, (layoutSheetAsset.pageIndex ?? 0) + 1) })}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Pressable>
                </div>
              </section>
            ) : null}

            {layoutSheetAsset.mimeType !== 'application/pdf' ? (
              <section className="multitrack-visual-editor__section">
                <div className="multitrack-visual-editor__section-title">
                  <strong>Image framing</strong>
                  <span>Fill removes empty bands. Show full image may add margins.</span>
                </div>
                <div className="multitrack-visual-editor__framing" role="radiogroup" aria-label="Image framing">
                  {([
                    ['fill', 'Fill panel', 'Edge-to-edge; crops if needed'],
                    ['fit', 'Show full image', 'No cropping; may show margins'],
                  ] as const).map(([value, label, detail]) => {
                    const active = (layoutSheetAsset?.contentMode ?? 'fill') === value
                    return (
                      <Pressable
                        key={value}
                        type="button"
                        intensity="soft"
                        role="radio"
                        aria-checked={active}
                        className={`multitrack-visual-editor__frame-choice ${active ? 'is-active' : ''}`}
                        onClick={() => updateSheetMusicAsset({ contentMode: value })}
                      >
                        <strong>{label}</strong>
                        <small>{detail}</small>
                      </Pressable>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {/* Rolling belongs to a long photo of a part. A PDF page is fitted
                whole, so rolling it would only drive it off the panel — pages
                turn instead. */}
            <div className="multitrack-project-panel">
              {layoutSheetAsset.mimeType !== 'application/pdf' ? <>
                <label className="multitrack-check"><input type="checkbox" checked={layoutSheetAsset?.scrollEndY !== undefined} onChange={e => updateSheetMusicAsset({ scrollEndY: e.target.checked ? -.25 : undefined, scrollDurationSec: layoutSheetAsset?.scrollDurationSec ?? 10 })} /> Roll this image upward during playback</label>
                {layoutSheetAsset?.scrollEndY !== undefined && <>
                  <label>Roll duration (seconds)<input type="number" min={.1} step={.5} value={layoutSheetAsset.scrollDurationSec ?? 10} onChange={e => updateSheetMusicAsset({ scrollDurationSec: Math.max(.1, Number(e.target.value)) })} /></label>
                  <label>Final vertical position<input type="range" min={-.25} max={1.25} step={.01} value={layoutSheetAsset.scrollEndY} onChange={e => updateSheetMusicAsset({ scrollEndY: Number(e.target.value) })} /></label>
                </>}
              </> : null}
              <p>{layoutSheetAsset.mimeType === 'application/pdf'
                ? 'Use the editor’s Page button to turn to the next page at the playhead.'
                : 'Use the editor’s Add image here button to change to the next screenshot at the playhead.'}</p>
            </div>
            <section className="multitrack-visual-editor__section multitrack-visual-editor__sliders">
              <label className="multitrack-visual-editor__slider-row">
                <span>
                  <strong>Panel size</strong>
                  <small>How much layout space it receives</small>
                </span>
                <output>{Math.round((layoutSheetAsset.frameScale ?? 1) * 100)}%</output>
                <input
                  type="range"
                  min={0.65}
                  max={1.8}
                  step={0.05}
                  value={layoutSheetAsset.frameScale ?? 1}
                  onChange={(event) => updateSheetMusicAsset({ frameScale: Number(event.target.value) })}
                />
              </label>
              <label className="multitrack-visual-editor__slider-row">
                <span>
                  <strong>{layoutSheetAsset.mimeType === 'application/pdf' ? 'Page zoom' : 'Image zoom'}</strong>
                  <small>{layoutSheetAsset.mimeType === 'application/pdf'
                    ? 'The panel’s own gestures turn pages, so a page is zoomed here'
                    : 'You can also pinch directly on the image'}</small>
                </span>
                <output>{Math.round((layoutSheetAsset.scale ?? 1) * 100)}%</output>
                <input
                  type="range"
                  min={0.6}
                  max={2.5}
                  step={0.05}
                  value={layoutSheetAsset.scale ?? 1}
                  onChange={(event) => updateSheetMusicAsset({ scale: Number(event.target.value) })}
                />
              </label>
            </section>

            <div className="multitrack-visual-editor__actions">
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => updateSheetMusicAsset({ x: 0.5, y: 0.5, scale: 1 })}
              >
                <Crosshair className="h-4 w-4" />
                Center image
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => updateSheetMusicAsset({
                  x: 0.5,
                  y: 0.5,
                  scale: 1,
                  frameScale: 1,
                  framePosition: 'top',
                })}
              >
                <RotateCcw className="h-4 w-4" />
                Reset layout
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => { pendingImageAtSecRef.current = null; sheetMusicInputRef.current?.click() }}
              >
                <FileMusic className="h-4 w-4" />
                Replace file
              </Pressable>
            </div>
          </div> : <div className="multitrack-sheet multitrack-visual-editor">
            <div className="multitrack-visual-editor__heading"><div>
              <h2 className="multitrack-sheet__title">Music, photo or PDF</h2>
              <p>Add sheet music or an image to your composition.</p>
            </div><button type="button" onClick={() => setActiveSourceSheet(null)}>Done</button></div>
            <div className="multitrack-quiet-option-list">
              <button type="button" onClick={() => { pendingImageAtSecRef.current = null; sheetMusicInputRef.current?.click() }}>
                <FileMusic /><span><strong>Choose a photo or PDF</strong><small>Open your photos or files</small></span><ChevronRight />
              </button>
            </div>
          </div>}
        </AnimatedBottomSheet>

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
            {tileSheetTake ? tileSheetTake.name || 'Part options' : 'Add a part'}
          </p>
          <div className="multitrack-sheet__primary-row">
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className="multitrack-sheet__primary multitrack-sheet__primary--record"
              onClick={() => {
                if (tileSheetPanelId) openRecordingForPanel(tileSheetPanelId, tileSheetPanel?.kind === 'performance' && tileSheetPanel.overlay ? tileSheetPanel.sectionStartSec ?? 0 : 0)
              }}
            >
              <Video className="h-6 w-6" />
              {tileSheetTake ? 'Record another take' : 'Record a new part'}
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
              From Take Vault
            </Pressable>
          </div>
          {!tileSheetTake ? (
            <div className="multitrack-sheet__more-row">
              <Pressable
                type="button"
                intensity="soft"
                className="multitrack-sheet__more"
                onClick={() => {
                  pendingImageAtSecRef.current = null
                  sheetMusicInputRef.current?.click()
                  setTileSheetPanelId(null)
                }}
              >
                <FileMusic className="h-4 w-4" />
                Add sheet music to workspace
              </Pressable>
            </div>
          ) : (
            <div className="multitrack-sheet__more-row">
              <Pressable
                type="button"
                intensity="soft"
                className="multitrack-sheet__more"
                onClick={() => {
                  setTileSheetPanelId(null)
                  setAlignStageOpen(true)
                }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Editor
              </Pressable>
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
          {tileSheetPanel?.kind === 'performance' && tileSheetTake ? (
            <p className="multitrack-sheet__footnote">
              {hasSectionWindow(tileSheetPanel)
                ? 'This box only appears for part of the song. Open Editor to move or widen that window.'
                : 'Open Editor to trim this part, slide it in time, or make the box appear for only part of the song.'}
            </p>
          ) : null}
        </div>
      </AnimatedBottomSheet>


      <AnimatedBottomSheet isOpen={activeSourceSheet === 'tools' && isOpen} onClose={() => setActiveSourceSheet(current => current === 'tools' ? null : current)} ariaLabel="Workspace tools" elevated elevatedLight zClass={{ backdrop: 'z-[155]', sheet: 'z-[160]' }} maxHeightClass="max-h-[80vh]">
        <div className="multitrack-sheet multitrack-quiet-tools-sheet"><header className="multitrack-tools-sheet-header"><h2>Workspace tools</h2><button onClick={() => setActiveSourceSheet(null)}>Done</button></header><p>Choose the widgets you want to keep open.</p>
          <h3>Practice</h3><div className="multitrack-quiet-option-list">
            <button aria-pressed={session.practice.showPitch} onClick={() => { handlePracticeChange({ showPitch: !session.practice.showPitch, practiceOverlayEnabled: true }) }}><Activity /><span><strong>Tuner</strong><small>Live pitch in your workspace</small></span><small>{session.practice.showPitch ? 'Remove' : 'Pin'}</small></button>
            <button aria-pressed={session.practice.showMetronome} onClick={() => { handlePracticeChange({ showMetronome: !session.practice.showMetronome, practiceOverlayEnabled: true }) }}><Timer /><span><strong>Click & tempo</strong><small>{session.practice.bpm} BPM · {session.practice.meter ?? '4/4'}</small></span><small>{session.practice.showMetronome ? 'Remove' : 'Pin'}</small></button>
          </div>
          <h3>Playback</h3><div className="multitrack-quiet-option-list">
            <button aria-pressed={props.audioEnhancerEnabled} onClick={() => props.onAudioEnhancerChange(!props.audioEnhancerEnabled)}><Sparkles /><span><strong>Audio Enhance</strong><small>Clean up take playback and multitrack monitor audio</small></span><small>{props.audioEnhancerEnabled ? 'On' : 'Off'}</small></button>
          </div>
          <h3>Media</h3><div className="multitrack-quiet-option-list">
            <button disabled={isRestoring || isExporting || isRecording || isStopping || recording.phase !== 'idle'} onClick={() => { pauseAllPlayback(); setActiveSourceSheet('backing') }}><Music4 /><span><strong>Backing track</strong><small>{backingChipLabel}</small></span><ChevronRight /></button>
            <button disabled={isRestoring || isExporting || isRecording || isStopping || recording.phase !== 'idle'} onClick={() => { pauseAllPlayback(); setActiveSourceSheet('visual') }}><FileMusic /><span><strong>Music / photo / PDF</strong><small>{layoutSheetAsset?.fileName || 'Add a visual to your composition'}</small></span><ChevronRight /></button>
          </div>
          <h3>Setup</h3><div className="multitrack-quiet-option-list"><button disabled={isRecording || isStopping || recording.phase !== 'idle'} onClick={() => setActiveSourceSheet('click')}><SlidersHorizontal /><span><strong>Click & count-in</strong><small>Count-in bars, tempo, time, and sound</small></span><ChevronRight /></button></div>
        </div>
      </AnimatedBottomSheet>
      <AnimatedBottomSheet isOpen={activeSourceSheet === 'click' && isOpen} onClose={() => setActiveSourceSheet(null)} ariaLabel="Click and count-in" elevated elevatedLight zClass={{ backdrop: 'z-[155]', sheet: 'z-[160]' }} maxHeightClass="max-h-[70vh]">
        <div className="multitrack-sheet"><h2 className="multitrack-sheet__title">Click & count-in</h2><MultitrackCountInControls practice={session.practice} onChange={handlePracticeChange} hasBacking={session.backing.kind !== 'none'} /></div>
      </AnimatedBottomSheet>
      <AnimatedBottomSheet isOpen={activeSourceSheet === 'layout' && isOpen} onClose={() => setActiveSourceSheet(null)} ariaLabel="Layout" elevated elevatedLight zClass={MULTITRACK_SHEET_Z} maxHeightClass="max-h-[90vh]">
        {activeSourceSheet === 'layout' && <MultitrackLayoutSheet key={session.projectId} session={session} onCancel={() => setActiveSourceSheet(null)} onApply={draft => { updateProject({ layoutId: draft.layoutId, panels: draft.panels, aspectRatio: '9:16', layoutStyle: draft.layoutStyle }); setActiveSourceSheet(null) }} />}
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
            onBackingChange={handleBackingChange}
            onTogglePlayback={toggleBackingPlayback}
          />
        </div>
      </AnimatedBottomSheet>

      <AnimatedBottomSheet isOpen={activeSourceSheet === 'project' && isOpen} onClose={() => setActiveSourceSheet(null)} ariaLabel="Project and parts" elevated elevatedLight zClass={MULTITRACK_SHEET_Z} maxHeightClass="max-h-[85vh]">
        <div className="multitrack-sheet multitrack-project-tools">
          <p className="multitrack-sheet__title">Project & parts</p>

        </div>
        <MultitrackProjectPanel session={session} projects={projects}
          onShare={() => void handleProjectFile()} onImport={file => void handleProjectFile(file)} fileBusy={projectFileBusy || isRestoring || isExporting || recording.phase !== 'idle'}
          onProject={(id, duplicate) => { pauseAllPlayback(); setAlignStageOpen(false); setRenderedVideo(null); void openProject(id, duplicate) }}
          onUpdate={updateProject} onPanel={updatePanel} onLayout={setLayout} onReorder={reorderPanel} onUndo={undo} canUndo={canUndo}
          onRecord={(id, time) => { setActiveSourceSheet(null); handleRecordBoxAt(id, time) }} time={sync.state.currentTime} />
          <details className="multitrack-advanced"><summary>Advanced composition</summary>
          <div className="multitrack-studio-actions">
            <button disabled={isExporting} onClick={() => { pauseAllPlayback(); setActiveSourceSheet(null); setAlignStageOpen(false); setLayoutEditing(true) }}>Arrange boxes</button>
            <button disabled={isExporting} onClick={() => { setActiveSourceSheet(null); handleAddBoxAt(sync.state.currentTime) }}>+ Extra box</button>
          </div>
          </details>
      </AnimatedBottomSheet>
      <AnimatedBottomSheet
        isOpen={activeSourceSheet === 'export' && isOpen}
        onClose={() => { if (!isExporting) setActiveSourceSheet(null) }}
        ariaLabel="Export multitrack video"
        elevated
        elevatedLight
        zClass={MULTITRACK_SHEET_Z}
        maxHeightClass="max-h-[85vh]"
      >
        <div className="multitrack-sheet">
          <p className="multitrack-sheet__title">Finish & share</p>
          <div className="multitrack-project-panel">
            <ProjectFileActions busy={projectFileBusy || isRestoring || isExporting || recording.phase !== 'idle'}
              onShare={() => void handleProjectFile()} onImport={file => void handleProjectFile(file)} />
            <p>Send your parts. Your friend adds theirs and sends the project back.</p>
          </div>
          <div className="multitrack-project-panel">
            <p>Portrait video · 9:16</p>
            <label>End at (seconds)<input disabled={isExporting} type="number" min={.1} step={.1} placeholder={`Auto · ${sync.state.duration.toFixed(1)} seconds`} value={session.endSec ?? ''} onChange={e => updateProject({ endSec: e.target.value === '' ? undefined : Math.max(.1, Number(e.target.value)) })} /></label>
            <p>Leave the ending blank to include the longest part. Your practice click is not added to the exported mix.</p>
            {session.backing.kind === 'youtube' && <p>YouTube is a practice reference only. Import an audio file to include backing music in your export.</p>}
            {isExporting ? <div role="status"><progress max={1} value={exportProgress} /> Rendering {Math.round(exportProgress * 100)}% <button onClick={() => exportAbort.current?.abort()}>Cancel</button></div>
              : <button disabled={shareDisabled} onClick={() => handleExport('preview')}>Render & preview video</button>}
            {renderedVideo && <video className="multitrack-export-preview" src={Capacitor.convertFileSrc(renderedVideo.path)} controls playsInline preload="metadata" aria-label="Rendered video preview" />}
          </div>
          <p className="multitrack-sheet__empty">Your layout, trims, alignment, borders, sheet image, and audio mix will be rendered together.</p>
          <div className="multitrack-sheet__primary-row">
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className="multitrack-sheet__primary"
              disabled={shareDisabled} onClick={() => handleExport('share')}
            >
              <Share2 className="h-6 w-6" />
              Share video
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="multitrack-sheet__primary"
              disabled={shareDisabled} onClick={() => handleExport('vault')}
            >
              <Save className="h-6 w-6" />
              Save to Take Vault
            </Pressable>
          </div>
        </div>
      </AnimatedBottomSheet>


    </>, document.body)
}
