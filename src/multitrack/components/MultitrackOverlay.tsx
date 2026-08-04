import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, FileMusic, FolderOpen, Music4, Share2, SlidersHorizontal, Trash2, Video, VolumeX, Volume2 } from 'lucide-react'
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
import { APP_FOREGROUND_RECOVERY_EVENT } from '../../utils/appForeground'
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
import { exportMultitrackSession, type MultitrackExportFailureReason } from '../export/multitrackExport'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from '../sheetMusic/sheetMusicUtils'
import MultitrackPanelGrid from './MultitrackPanelGrid'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackBackingTrackPanel, { MultitrackBackingMediaHost } from '../backing/MultitrackBackingTrackPanel'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import MultitrackRecordingStage from './MultitrackRecordingStage'
import MultitrackAlignStage from './MultitrackAlignStage'

/** Sheets portal to document.body; the overlay itself sits at z-135. */
const MULTITRACK_SHEET_Z = { backdrop: 'z-[140]', sheet: 'z-[145]' }
const MULTITRACK_MONITOR_CACHE_DIR = 'multitrack-monitor-assets'

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
  const inGridReviewMediaRef = useRef<HTMLMediaElement | null>(null)
  const backingAudioRef = useRef<HTMLAudioElement>(null)
  const backingYoutubeIframeRef = useRef<HTMLIFrameElement>(null)
  const [takePickerPanelId, setTakePickerPanelId] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [backingPlaying, setBackingPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [pendingReview, setPendingReview] = useState<{ panelId: string; take: Take } | null>(null)
  const discardNextRecordingRef = useRef(false)
  /** Bottom sheets: backing source, mixer, or a tile's action sheet. */
  const [activeSourceSheet, setActiveSourceSheet] = useState<'backing' | 'mixer' | null>(null)
  const [tileSheetPanelId, setTileSheetPanelId] = useState<string | null>(null)
  const [alignStageOpen, setAlignStageOpen] = useState(false)
  const sheetMusicInputRef = useRef<HTMLInputElement>(null)
  const {
    session,
    layout,
    setLayout,
    assignTakeToPanel,
    setPanelVolume,
    setPanelMuted,
    setPanelTrim,
    assignSheetMusic,
    updatePractice,
    updateBacking,
  } = useMultitrackSession({ takes, isOpen })
  const sync = useMultitrackSync()
  const { showAlert, showConfirm } = useActionSheet()

  const handlePracticeChange = useCallback((patch: Partial<typeof session.practice>) => {
    if (patch.bpm !== undefined) {
      sharedMetronomeEngine.setBpm(patch.bpm)
    } else if (patch.showMetronome === true) {
      sharedMetronomeEngine.setBpm(session.practice.bpm)
    }
    updatePractice(patch)
  }, [session.practice.bpm, updatePractice])

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
    targetPanelId: string,
  ): Promise<MultitrackMonitorSource[]> => {
    const sources: MultitrackMonitorSource[] = []

    for (const panel of session.panels) {
      if (
        panel.kind !== 'performance' ||
        panel.id === targetPanelId ||
        !panel.take ||
        panel.muted ||
        monitorMutesRef.current.has(panel.id)
      ) continue

      const path = await resolveNativeFileUri(panel.take)
      if (!path) throw new Error(`Missing monitor source ${panel.id}`)
      const offsetSec = timelineOffsetMsForTake(panel.take, session.practice.bpm) / 1000
      sources.push({
        id: panel.id,
        path,
        sourceInSec: (panel.trimStartSec ?? 0) + Math.max(0, offsetSec),
        ...(panel.trimEndSec !== undefined ? { sourceOutSec: panel.trimEndSec } : null),
        ...(offsetSec < 0 ? { timelineDelaySec: -offsetSec } : null),
        volume: panel.volume ?? 1,
      })
    }

    if (
      session.backing.kind === 'audio' &&
      !monitorMutesRef.current.has('backing')
    ) {
      const blob = await fetch(session.backing.src).then((response) => response.blob())
      const extension = extensionForBlob(blob, session.backing.fileName)
      const path = await writeBlobToNativeCache(
        MULTITRACK_MONITOR_CACHE_DIR,
        `backing-monitor.${extension}`,
        blob,
      )
      sources.push({
        id: 'backing',
        path,
        sourceInSec: 0,
        volume: session.backing.volume,
      })
    }

    return sources
  }, [session.backing, session.panels, session.practice.bpm])

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
      sync.pause()
      pauseBacking()
      const sources = await buildNativeMonitorSources(panelId)
      nativeTransportActiveRef.current = await prepareNativeMultitrackMonitor(sources)
      if (nativeTransportActiveRef.current) {
        sync.prepareVisualAtStart()
        return true
      }
      if (isNativeMultitrackTransportAvailable()) return false

      // Browser development fallback. iOS production must use the native
      // transport; this path keeps the feature testable without AVFoundation.
      await sync.prepareAtStart(0)
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
        sync.startVisualPrepared()
      }
      if (
        session.backing.kind === 'youtube' &&
        !monitorMutesRef.current.has('backing')
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
    if (!isOpen) pauseBacking()
  }, [isOpen, pauseBacking])

  useEffect(() => {
    if (session.backing.kind === 'none') pauseBacking()
  }, [pauseBacking, session.backing.kind])

  // After background / lock screen / app switch: clear a stuck arming count-in and
  // heal the metronome audio graph so the next Record tap can start clicks.
  useEffect(() => {
    if (!isOpen) return

    const healMultitrackAudio = () => {
      recording.recover()
      void resumePlaybackAudioContext()
      void sharedMetronomeEngine.prepareForCountIn()
      void ensureNativeCameraSessionHealthy()
    }

    window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, healMultitrackAudio)
    const onVisible = () => {
      if (document.visibilityState === 'visible') healMultitrackAudio()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener(APP_FOREGROUND_RECOVERY_EVENT, healMultitrackAudio)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isOpen, recording])

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
      void completePlaybackRouteRestore().catch(() => {})
    })
    return () => sync.setOnAllEnded(null)
  }, [sync.setOnAllEnded])

  /** After review playback (Preview) ends in Keep/Retry, hand the audio route
   * back to recording and heal the capture session before the next take. */
  const restoreRecordingReadiness = useCallback(() => {
    void completePlaybackRouteRestore()
      .catch(() => {})
      .then(() => ensureNativeCameraSessionHealthy())
  }, [])

  const handleConfirmTake = useCallback(() => {
    if (!pendingReview) return
    assignTakeToPanel(pendingReview.panelId, pendingReview.take)
    setPendingReview(null)
    recording.cancel()
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
  }, [assignTakeToPanel, pendingReview, recording, restoreRecordingReadiness, showAlert])

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
  }, [session.panels, session.practice.bpm, sync])

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
              <MultitrackPanelGrid layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={activePanelId} recordingPhase={recording.phase}
                streamRef={streamRef} streamGeneration={streamGeneration}
                nativeLivePreviewActive={nativeLivePreviewActive} nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
                countInRemaining={recording.countInRemaining} recordingElapsed={elapsed}
                reviewTake={pendingReview?.panelId === activePanelId ? pendingReview.take : null}
                reviewMediaRef={inGridReviewMediaRef}
                onTapPerformance={(id) => { triggerLightHaptic(hapticFeedback); setTileSheetPanelId(id) }}
                onRemoveTake={(id) => assignTakeToPanel(id, null)} onSheetMusicChange={assignSheetMusic}
                onRegisterMedia={registerPanelMedia} />
            </div>
            <MultitrackToolbar isPlaying={sync.state.isPlaying || backingPlaying} currentTime={sync.state.currentTime} duration={sync.state.duration}
              activeLayoutId={session.layoutId}
              onSelectLayout={setLayout}
              onOpenMixer={() => setActiveSourceSheet('mixer')}
              onOpenAlign={hasAnyTake ? () => setAlignStageOpen(true) : undefined}
              onTogglePlay={() => void (async () => {
                try {
                  if (sync.state.isPlaying || backingPlaying) {
                    sync.pause()
                    pauseBacking()
                    return
                  }
                  sync.setExcludePanelId(null)
                  await sync.playAllFromUserGesture()
                  await playBackingFromStart()
                } catch (error) {
                  console.error('[MultitrackOverlay] Play all failed', error)
                }
              })()} onRestart={() => void (async () => {
                try {
                  sync.pause()
                  pauseBacking()
                  sync.setExcludePanelId(null)
                  await sync.restart()
                  await playBackingFromStart()
                } catch (error) {
                  console.error('[MultitrackOverlay] Restart failed', error)
                }
              })()} onSeek={sync.seek} />
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
                  setTileSheetPanelId(null)
                  setAlignStageOpen(true)
                }}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Align
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

      <MultitrackAlignStage
        isOpen={alignStageOpen && isOpen}
        panels={session.panels.filter(
          (panel): panel is PerformancePanelState => panel.kind === 'performance',
        )}
        sync={sync}
        onClose={() => {
          sync.pause()
          pauseBacking()
          setAlignStageOpen(false)
        }}
        onPreviewToggle={() => {
          if (sync.state.isPlaying || backingPlaying) {
            sync.pause()
            pauseBacking()
            return
          }
          sync.setExcludePanelId(null)
          sync.playAllFromUserGesture()
          void playBackingFromStart()
        }}
        onDone={handleSaveAlignChanges}
      />

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
