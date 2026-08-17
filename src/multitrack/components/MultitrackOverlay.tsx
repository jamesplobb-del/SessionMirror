import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AudioLines, ChevronLeft, Crosshair, FileMusic, FolderOpen, Music4, RefreshCw, RotateCcw, Save, Share2, SlidersHorizontal, Trash2, Video, VolumeX, Volume2 } from 'lucide-react'
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
import { useActionSheet } from '../../context/ActionSheetContext'
import { useMultitrackSession } from '../state/useMultitrackSession'
import { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMultitrackRecording } from '../recording/useMultitrackRecording'
import { updateVaultTake } from '../../db/vaultRepository'
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
import { hasSectionWindow } from '../layout/sectionVisibility'
import { SHEET_BASE_CUE_ID, sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackBackingTrackPanel, { MultitrackBackingMediaHost } from '../backing/MultitrackBackingTrackPanel'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import MultitrackRecordingStage from './MultitrackRecordingStage'
import MultitrackAlignStage from './MultitrackAlignStage'
import MultitrackPracticeOverlay from '../practiceWidgets/MultitrackPracticeOverlay'

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
  const [pendingReview, setPendingReview] = useState<{ panelId: string; take: Take } | null>(null)
  const discardNextRecordingRef = useRef(false)
  /** Bottom sheets: backing source, mixer, or a tile's action sheet. */
  const [activeSourceSheet, setActiveSourceSheet] = useState<'backing' | 'mixer' | 'export' | 'visual' | null>(null)
  const [tileSheetPanelId, setTileSheetPanelId] = useState<string | null>(null)
  const [alignStageOpen, setAlignStageOpen] = useState(false)
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
    session,
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
  } = useMultitrackSession({ takes, isOpen })
  const sync = useMultitrackSync()
  const { showAlert, showConfirm } = useActionSheet()
  const nativeGridPlaybackActiveRef = useRef(false)
  const nativeGridPlaybackPreparingRef = useRef(false)
  const nativeGridPlaybackGenerationRef = useRef(0)
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
      URL.revokeObjectURL(currentBacking.src)
      ownedBackingBlobUrlsRef.current.delete(currentBacking.src)
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

  const handleExport = useCallback((destination: 'share' | 'vault') => {
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

      // The native renderer composites one fixed rect per source for the whole
      // video, so a box scoped to a section keeps its slot the entire time in the
      // export instead of the grid reflowing around it as it does on the canvas.
      if (session.panels.some((panel) => panel.kind === 'performance' && hasSectionWindow(panel))) {
        const proceed = await showConfirm({
          title: 'Section boxes export full length',
          message:
            "Boxes set to show for part of the song keep their spot for the whole exported video — the grid won't reshuffle like it does here. Export anyway?",
          confirmLabel: 'Export anyway',
        })
        if (!proceed) return
      }

      setActiveSourceSheet(null)
      sync.pause()
      pauseBacking()
      await stopNativeGridPlayback()
      setIsExporting(true)
      try {
        const result = await exportMultitrackSession(
          session,
          layout,
          sync.state.duration,
          { share: destination === 'share' },
        )
        if (!result.ok) {
          await showAlert({ message: describeMultitrackExportFailure(result.reason), tone: 'error' })
          return
        }
        if (destination === 'vault') {
          try {
            await onSaveRenderedTakeToVault({
              path: result.renderedPath,
              durationSeconds: result.durationSeconds,
            })
            await showAlert({ message: 'Saved to your Take Vault.' })
          } catch (error) {
            console.warn('[Multitrack] could not save rendered video to vault', error)
            await showAlert({ message: 'The video rendered, but could not be saved to your Take Vault.', tone: 'error' })
          }
        }
      } finally {
        setIsExporting(false)
      }
    })()
  }, [isExporting, layout, onSaveRenderedTakeToVault, pauseBacking, session, showAlert, showConfirm, stopNativeGridPlayback, sync])

  const registerPanelMedia = useCallback((id: string, el: HTMLMediaElement | null) => {
    sync.registerMedia(id, el)
    if (el) {
      masterMediaRef.current = masterMediaRef.current ?? el
    } else if (masterMediaRef.current && !document.body.contains(masterMediaRef.current)) {
      masterMediaRef.current = null
    }
  }, [sync.registerMedia])

  const recordingTargetPanelIdRef = useRef<string | null>(null)
  /**
   * Auto-alignment results (refined timelineOffsetMs) keyed by take id. Applied
   * over the take's stored offset so a refinement that lands after the take is
   * assigned still takes effect without a DB round-trip.
   */
  const alignedOffsetRef = useRef<Map<string, number>>(new Map())

  // Per-record monitor mix. Every filled panel except the recording target is
  // a reference; there is no privileged "Track 1" box.
  const [monitorMutes, setMonitorMutes] = useState<Set<string>>(() => new Set())
  const monitorMutesRef = useRef(monitorMutes)
  monitorMutesRef.current = monitorMutes
  const nativeTransportActiveRef = useRef(false)

  const buildNativeMonitorSources = useCallback(async (
    targetPanelId: string | null,
    respectRecordingMonitorMutes = true,
    /** Timeline second the mix starts from — non-zero when overdubbing a part
        that only exists later in the song. */
    startAtSec = 0,
  ): Promise<MultitrackMonitorSource[]> => {
    const sources: MultitrackMonitorSource[] = []
    const startSec = Math.max(0, startAtSec)

    for (const [panelIndex, panel] of session.panels.entries()) {
      if (
        panel.kind !== 'performance' ||
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
      const offsetSec = timeline.offsetMs / 1000
      // Timeline t plays media time `t + trimStart + offset`; the clip enters at
      // `-offset`. Starting at `startSec` therefore either seeks into the clip or,
      // if it has not entered yet, waits out the remaining gap.
      const entersAtSec = Math.max(0, -offsetSec)
      const startsInsideClip = startSec >= entersAtSec
      const sourceInSec = startsInsideClip
        ? startSec + timeline.trimStartSec + offsetSec
        : timeline.trimStartSec
      const timelineDelaySec = startsInsideClip ? 0 : entersAtSec - startSec
      // A clip that has already finished by `startSec` contributes nothing.
      if (timeline.trimEndSec !== null && sourceInSec >= timeline.trimEndSec) continue

      sources.push({
        id: panel.id,
        label: panel.take.name || `Box ${panelIndex + 1}`,
        path,
        sourceInSec,
        ...(timeline.trimEndSec !== null ? { sourceOutSec: timeline.trimEndSec } : null),
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
        sources.push({
          id: 'backing',
          label: session.backing.fileName || 'Backing track',
          path,
          sourceInSec: startSec,
          volume: session.backing.volume,
        })
      } catch (error) {
        console.error('[Multitrack] backing track preparation failed', error)
        throw new Error(`${session.backing.fileName || 'The backing track'} could not be loaded. Choose the file again.`)
      }
    }

    return sources
  }, [session.backing, session.panels, sync.getPanelTimelineSettings])

  const playAllFromStart = useCallback(async () => {
    sync.pause()
    pauseBacking()
    await stopNativeGridPlayback()
    sync.setExcludePanelId(null)
    sync.setReferencePanelIds(null)

    if (!isNativeMultitrackTransportAvailable()) {
      const started = await sync.playAllFromUserGesture()
      if (started) await playBackingFromStart()
      return started
    }

    const generation = ++nativeGridPlaybackGenerationRef.current
    nativeGridPlaybackPreparingRef.current = true
    setIsNativeGridPlaybackPreparing(true)

    try {
      // iOS Play All uses one native AVAudioEngine graph for every take (and
      // uploaded backing audio). This avoids WebKit's multiple-media-element
      // limit and gives every source the same sample clock.
      const sources = await buildNativeMonitorSources(null, false)
      if (generation !== nativeGridPlaybackGenerationRef.current) return false

      const prepared = await prepareNativeMultitrackMonitor(sources)
      if (!prepared || generation !== nativeGridPlaybackGenerationRef.current) {
        await stopNativeMultitrackTransport()
        return false
      }

      const snapshot = sharedMetronomeEngine.getSnapshot()
      const beatsPerBar = Math.max(
        1,
        Number.parseInt(snapshot.meter.split('/')[0] ?? '4', 10) || 4,
      )
      const transport = await startNativeMultitrackTransport({
        bpm: session.practice.bpm,
        beatsPerBar,
        countInBars: 0,
        clickEnabled: false,
        soundId: snapshot.soundId,
      })
      if (!transport || generation !== nativeGridPlaybackGenerationRef.current) {
        await stopNativeMultitrackTransport()
        return false
      }

      nativeGridPlaybackActiveRef.current = true
      if (session.backing.kind === 'youtube') {
        await scheduleYoutubeBackingStart(transport.performanceEpochMs)
      }
      const visualsStarted = await sync.startVisualPlaybackAtEpoch(
        transport.performanceEpochMs,
      )
      if (!visualsStarted || generation !== nativeGridPlaybackGenerationRef.current) {
        await stopNativeGridPlayback()
        return false
      }
      return true
    } catch (error) {
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
    session.backing.kind,
    session.practice.bpm,
    showAlert,
    stopNativeGridPlayback,
    sync,
  ])

  const pauseAllPlayback = useCallback(() => {
    sync.pause()
    pauseBacking()
    void stopNativeGridPlayback()
  }, [pauseBacking, stopNativeGridPlayback, sync])

  const recording = useMultitrackRecording({
    onPrepareRecording: (panelId) => {
      recordingTargetPanelIdRef.current = panelId
      sync.setExcludePanelId(panelId)
      const referenceIds = session.panels
        .filter((panel) =>
          panel.kind === 'performance' &&
          panel.id !== panelId &&
          panel.take !== null &&
          !panel.muted &&
          !monitorMutesRef.current.has(panel.id),
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
      await stopNativeGridPlayback()
      sync.pause()
      pauseBacking()
      if (session.backing.kind === 'youtube') {
        await prepareBackingAtStart()
      }
      // Adding a part that only exists at the bridge shouldn't mean sitting
      // through the whole song: the monitor mix rolls from the playhead.
      const startSec = recordStartSecRef.current
      const sources = await buildNativeMonitorSources(panelId, true, startSec)
      nativeTransportActiveRef.current = await prepareNativeMultitrackMonitor(sources)
      if (nativeTransportActiveRef.current) {
        sync.prepareVisualAtStart(startSec)
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
      const beatsPerBar = Math.max(1, Number.parseInt(snapshot.meter.split('/')[0] ?? '4', 10) || 4)
      if (nativeTransportActiveRef.current) {
        return startNativeMultitrackTransport({
          bpm,
          beatsPerBar,
          countInBars,
          clickEnabled,
          soundId: snapshot.soundId,
        })
      }

      sharedMetronomeEngine.applySectionConfig(
        {
          bpm,
          meter: '4/4',
          subdivision: 'off',
          pulseModeId: 'default',
          accentLevels: ['strong', 'weak', 'weak', 'weak'],
        },
        { resetBeat: true },
      )
      const started = await sharedMetronomeEngine.start()
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
        await sync.startPrepared()
      } else {
        sync.startVisualPrepared(recordStartSecRef.current)
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
    setPendingReview({ panelId: targetPanelId, take })
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
      void stopNativeGridPlayback()
      void completePlaybackRouteRestore().catch(() => {})
    })
    return () => sync.setOnAllEnded(null)
  }, [stopNativeGridPlayback, sync.setOnAllEnded])

  /** After review playback (Preview) ends in Keep/Retry, hand the audio route
   * back to recording and heal the capture session before the next take. */
  const restoreRecordingReadiness = useCallback(() => {
    void completePlaybackRouteRestore()
      .catch(() => {})
      .then(() => ensureNativeCameraSessionHealthy())
  }, [])

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
      const offsetMs = Math.round(capturedOffsetMs - startSec * 1000)
      const placedTake = { ...take, timelineOffsetMs: offsetMs }
      alignedOffsetRef.current.set(take.id, offsetMs)
      assignTakeToPanel(pendingReview.panelId, placedTake)
      sync.setPanelOffset(pendingReview.panelId, offsetMs)
      // The new box appears exactly while its own part plays.
      const takeDuration = take.duration ?? 0
      setPanelSection(
        pendingReview.panelId,
        startSec,
        takeDuration > 0 ? startSec + takeDuration : undefined,
      )
      void updateVaultTake(take.id, { timelineOffsetMs: offsetMs }).catch((error) => {
        console.warn('[Multitrack] could not persist overdub placement', error)
      })
    } else {
      assignTakeToPanel(pendingReview.panelId, pendingReview.take)
    }

    setPendingReview(null)
    recording.cancel()
    setActivePanelId(null)
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
    assignTakeToPanel,
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
    onDeleteTakes([pendingReview.take.id])
    setPendingReview(null)
    recording.cancel()
    restoreRecordingReadiness()
  }, [onDeleteTakes, pendingReview, recording, restoreRecordingReadiness])

  const activePanel = session.panels.find((panel) => panel.id === activePanelId)

  const hasAnyTake = session.panels.some(
    (panel) => panel.kind === 'performance' && panel.take !== null,
  )
  const shareDisabled = !hasAnyTake || isExporting || recording.phase !== 'idle'

  useEffect(() => {
    // While the timeline editor is open it owns the live offsets and trims —
    // it writes every drag straight into sync. Re-deriving them from the saved
    // session here would snap a clip back mid-gesture, so stand down until the
    // editor closes and this effect reconciles against the saved values again.
    if (alignStageOpen) return
    for (const panel of session.panels) {
      if (panel.kind !== 'performance') continue
      sync.setPanelVolume(panel.id, panel.volume ?? 1)
      sync.setPanelMuted(panel.id, panel.muted === true)
      sync.setPanelTrim(panel.id, panel.trimStartSec ?? 0, panel.trimEndSec ?? null)
      const takeId = panel.take?.id
      const beatOffset =
        panel.take != null
          ? timelineOffsetMsForTake(panel.take, session.practice.bpm)
          : undefined
      const offset =
        (takeId ? alignedOffsetRef.current.get(takeId) : undefined) ??
        beatOffset ??
        panel.take?.timelineOffsetMs ??
        0
      sync.setPanelOffset(panel.id, offset)
    }
  }, [alignStageOpen, session.panels, session.practice.bpm, sync])

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
      recordingTargetPanelIdRef.current = panelId
      sync.setExcludePanelId(panelId)
      sync.setReferencePanelIds(
        session.panels
          .filter((panel) => panel.kind === 'performance' && panel.id !== panelId && panel.take)
          .map((panel) => panel.id),
      )
      void ensureNativeCameraSessionHealthy()
    },
    [hapticFeedback, onOpenRecordingStage, session.panels, sync],
  )

  /** Timeline "+": claim a box and overdub into it from the playhead. */
  const handleAddBoxAt = useCallback(
    (atSec: number) => {
      const startSec = Math.max(0, atSec)
      const panelId = addPerformanceBox(
        startSec > 0 ? { startSec, endSec: undefined } : undefined,
      )
      if (!panelId) {
        void showAlert({
          message: 'Six boxes is the most one canvas holds. Free one up to add another part.',
        })
        return
      }
      recordStartSecRef.current = startSec
      openRecordingForPanel(panelId)
    },
    [addPerformanceBox, openRecordingForPanel, showAlert],
  )

  /** Timeline lane "Record here": overdub into an existing empty box. */
  const handleRecordBoxAt = useCallback(
    (panelId: string, atSec: number) => {
      const startSec = Math.max(0, atSec)
      recordStartSecRef.current = startSec
      if (startSec > 0) setPanelSection(panelId, startSec, undefined)
      openRecordingForPanel(panelId)
    },
    [openRecordingForPanel, setPanelSection],
  )

  /** Timeline "+ image": pick a screenshot that cuts in at the playhead. */
  const handleAddImageAt = useCallback((atSec: number) => {
    pendingImageAtSecRef.current = Math.max(0, atSec)
    sheetMusicInputRef.current?.click()
  }, [])

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

  const mixerPanels = session.panels.filter(
    (panel) => panel.kind === 'performance' && panel.take !== null,
  )

  const backingChipLabel =
    session.backing.kind === 'none'
      ? 'Add backing'
      : session.backing.kind === 'audio'
        ? session.backing.fileName
        : session.backing.label || 'YouTube'


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
        alignedOffsetRef.current.set(change.takeId, change.offsetMs)
        sync.setPanelTrim(change.panelId, change.trimStart, change.trimEnd ?? null)
        setPanelTrim(change.panelId, change.trimStart, change.trimEnd)
        // eslint-disable-next-line no-await-in-loop
        await updateVaultTake(change.takeId, { timelineOffsetMs: change.offsetMs })
        assignTakeToPanel(change.panelId, { ...panel.take, timelineOffsetMs: change.offsetMs })
      }
    },
    [alignedOffsetRef, assignTakeToPanel, session.panels, setPanelTrim, sync],
  )

  // ── Monitor mix ("You'll hear" chips) ────────────────────────────────────
  // Per-take mute set: panel ids plus the 'backing'/'click' sentinels. All-on
  // by default; reset whenever the stage opens for a different tile.
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
          <motion.div ref={shellRef} key="mt-overlay" className="multitrack-overlay multitrack-overlay--camera-mode" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={iosSpringSnappy} style={motionGpuLayer} role="dialog" aria-modal="true">
            <header className="multitrack-overlay__header">
              <Pressable type="button" intensity="soft" onClick={onClose} aria-label="Return to Camera Mode" className="multitrack-camera-back">
                <ChevronLeft className="h-6 w-6" />
              </Pressable>
              <div className="multitrack-camera-title">
                <span><Video className="h-3 w-3" /> Camera Mode</span>
                <h1 className="text-lg font-semibold">Multitrack</h1>
              </div>
              <Pressable
                type="button"
                intensity="normal"
                onClick={() => setActiveSourceSheet('export')}
                disabled={shareDisabled}
                className="multitrack-share-btn"
              >
                <Share2 className="h-4 w-4" />
                {isExporting ? 'Rendering…' : 'Export'}
              </Pressable>
            </header>
            <div className={`multitrack-overlay__body ${alignStageOpen ? 'multitrack-overlay__body--editing' : ''}`}>
              <div className="multitrack-mix-strip" aria-label="Project audio sources" hidden={alignStageOpen}>
                {/* Practice toggles lead the strip — they are tapped most and must
                    stay reachable without scrolling past a long backing/file name. */}
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
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => handlePracticeChange({
                    showPitch: !session.practice.showPitch,
                    practiceOverlayEnabled: true,
                  })}
                  className={`multitrack-source-chip ${session.practice.showPitch ? 'multitrack-source-chip--active' : ''}`}
                >
                  <AudioLines className="h-3.5 w-3.5" />
                  <span className="multitrack-source-chip__label">Pitch</span>
                  <span className="multitrack-source-chip__state">
                    {session.practice.showPitch ? 'on' : 'off'}
                  </span>
                </Pressable>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => setActiveSourceSheet('backing')}
                  className={`multitrack-source-chip ${session.backing.kind !== 'none' ? 'multitrack-source-chip--active' : ''}`}
                >
                  <Music4 className="h-3.5 w-3.5" />
                  <span className="multitrack-source-chip__label multitrack-source-chip__label--truncate">{backingChipLabel}</span>
                  {session.backing.kind !== 'none' ? <span className="multitrack-source-chip__dot" /> : null}
                </Pressable>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => {
                    if (layoutSheetAsset) setActiveSourceSheet('visual')
                    else sheetMusicInputRef.current?.click()
                  }}
                  className={`multitrack-source-chip ${layoutSheetAsset ? 'multitrack-source-chip--active' : ''}`}
                >
                  <FileMusic className="h-3.5 w-3.5" />
                  <span className="multitrack-source-chip__label multitrack-source-chip__label--truncate">
                    {layoutSheetAsset?.fileName ?? 'Music / photo / PDF'}
                  </span>
                  {layoutSheetAsset ? <span className="multitrack-source-chip__dot" /> : null}
                </Pressable>
              </div>
              <MultitrackPanelGrid layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={activePanelId} recordingPhase={recording.phase}
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
                onRegisterMedia={registerPanelMedia} />
            </div>
            {/* The timeline editor docks under the live canvas rather than
                covering it: the grid above IS the preview you are editing. */}
            {alignStageOpen ? (
              <MultitrackAlignStage
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
                  void playAllFromStart()
                }}
                onAddBox={handleAddBoxAt}
                onRecordBox={handleRecordBoxAt}
                onAddImage={handleAddImageAt}
                onMoveImage={moveSheetCue}
                onRemoveImage={handleRemoveSheetImage}
                onSectionChange={setPanelSection}
                onDone={handleSaveAlignChanges}
              />
            ) : (
              <MultitrackToolbar isPlaying={sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing} currentTime={sync.state.currentTime} duration={sync.state.duration}
                activeLayoutId={session.layoutId}
                onSelectLayout={setLayout}
                onOpenMixer={() => setActiveSourceSheet('mixer')}
                onOpenAlign={() => setAlignStageOpen(true)}
                onTogglePlay={() => {
                  if (sync.state.isPlaying || backingPlaying || isNativeGridPlaybackPreparing) {
                    pauseAllPlayback()
                    return
                  }
                  void playAllFromStart()
                }} onRestart={() => void playAllFromStart()} onSeek={(time) => {
                  if (nativeGridPlaybackActiveRef.current || nativeGridPlaybackPreparingRef.current) {
                    pauseAllPlayback()
                  }
                  sync.seek(time)
                }} />
            )}
            {!activePanel ? (
              <MultitrackPracticeOverlay
                boundaryRef={shellRef}
                practice={session.practice}
                isPlaying={sync.state.isPlaying || backingPlaying}
                streamRef={streamRef}
                tunerInstrument={tunerInstrument}
                mediaRef={masterMediaRef}
                mediaKey="multitrack-grid"
                onHideMetronome={() => handlePracticeChange({ showMetronome: false })}
                onHidePitch={() => handlePracticeChange({ showPitch: false })}
              />
            ) : null}
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
              inGrid
              reviewMediaRef={inGridReviewMediaRef}
              monitorSources={monitorSources}
              onToggleMonitorSource={toggleMonitorSource}
              hasBacking={session.backing.kind !== 'none'}
              onPracticeChange={handlePracticeChange}
              onRecord={() => {
                if (isRecording || isStopping) return
                discardNextRecordingRef.current = false
                // Heal a playback-interrupted capture session before starting;
                // count-in gives it ample time to settle.
                void ensureNativeCameraSessionHealthy()
                recordingTargetPanelIdRef.current = activePanel.id
                sync.setExcludePanelId(activePanel.id)
                if (
                  session.backing.kind === 'youtube' &&
                  !monitorMutesRef.current.has('backing')
                ) {
                  prepareBackingForRecord()
                }
                const recordingBpm = session.practice.showMetronome
                  ? sharedMetronomeEngine.getSnapshot().bpm
                  : session.practice.bpm
                recording.beginCountIn(activePanel.id, {
                  ...session.practice,
                  bpm: recordingBpm,
                  clickEnabled:
                    session.practice.clickEnabled && !monitorMutesRef.current.has('click'),
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
              onClose={() => {
                if (isRecording && (recording.phase === 'idle' || recording.phase === 'review')) {
                  discardNextRecordingRef.current = true
                  onStopRecording()
                }
                if (pendingReview) {
                  onDeleteTakes([pendingReview.take.id])
                  setPendingReview(null)
                }
                sync.setExcludePanelId(null)
                sync.setReferencePanelIds(null)
                sync.setMonitorMutedPanelIds([])
                sync.pause()
                pauseBacking()
                recording.cancel()
                // Backing out of a mid-song overdub leaves no clip behind, so the
                // empty box should not keep the window that was staged for it.
                if (recordStartSecRef.current > 0 && activePanel.kind === 'performance' && !activePanel.take) {
                  setPanelSection(activePanel.id, undefined, undefined)
                }
                recordStartSecRef.current = 0
                setActivePanelId(null)
              }}
            />
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

      <MultitrackTakePicker isOpen={takePickerPanelId !== null} takes={takes} onClose={() => setTakePickerPanelId(null)} onSelectTake={(take) => { if (takePickerPanelId) assignTakeToPanel(takePickerPanelId, take); setTakePickerPanelId(null); setActivePanelId(null) }} />

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
        className="hidden"
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
          })
          event.currentTarget.value = ''
        }}
      />

      {layoutSheetAsset ? (
        <AnimatedBottomSheet
          isOpen={activeSourceSheet === 'visual' && isOpen}
          onClose={() => setActiveSourceSheet(null)}
          ariaLabel="Image and sheet layout"
          elevated
          elevatedLight
          transparentBackdrop
          zClass={MULTITRACK_SHEET_Z}
          maxHeightClass="max-h-[60vh]"
        >
          <div className="multitrack-sheet multitrack-visual-editor">
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
                  <strong>Image zoom</strong>
                  <small>You can also pinch directly on the image</small>
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
                onClick={() => sheetMusicInputRef.current?.click()}
              >
                <FileMusic className="h-4 w-4" />
                Replace file
              </Pressable>
            </div>
          </div>
        </AnimatedBottomSheet>
      ) : null}

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
                Music / photo / PDF
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
                Timeline
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
                ? 'This box only appears for part of the song. Open Timeline to move or widen that window.'
                : 'Open Timeline to trim this part, slide it in time, or make the box appear for only part of the song.'}
            </p>
          ) : null}
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
            onBackingChange={handleBackingChange}
            onTogglePlayback={toggleBackingPlayback}
          />
        </div>
      </AnimatedBottomSheet>

      <AnimatedBottomSheet
        isOpen={activeSourceSheet === 'export' && isOpen}
        onClose={() => setActiveSourceSheet(null)}
        ariaLabel="Export multitrack video"
        elevated
        elevatedLight
        zClass={MULTITRACK_SHEET_Z}
        maxHeightClass="max-h-[55vh]"
      >
        <div className="multitrack-sheet">
          <p className="multitrack-sheet__title">Export finished video</p>
          <p className="multitrack-sheet__empty">Your layout, trims, alignment, borders, sheet image, and audio mix will be rendered together.</p>
          <div className="multitrack-sheet__primary-row">
            <Pressable
              type="button"
              intensity="normal"
              haptic="medium"
              className="multitrack-sheet__primary"
              onClick={() => handleExport('share')}
            >
              <Share2 className="h-6 w-6" />
              Share video
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="multitrack-sheet__primary"
              onClick={() => handleExport('vault')}
            >
              <Save className="h-6 w-6" />
              Save to Take Vault
            </Pressable>
          </div>
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
