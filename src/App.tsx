import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { AnimatePresence, motion } from 'framer-motion'
import { Headphones, Maximize2, X } from 'lucide-react'
import LiveCameraBackground from './components/LiveCameraBackground'
import CameraPermissionPrompt from './components/CameraPermissionPrompt'
import PipCompareRow from './components/PipCompareRow'
import SplitCompareLayout from './components/SplitCompareLayout'
import YoutubeBenchmarkPlayer from './components/YoutubeBenchmarkPlayer'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import HandsFreeStage from './components/HandsFreeStage'
import { resolveHandsFreePhase } from './utils/handsFreePhase'
import type { LabsRoute } from './components/labs/LabsOverlay'
import { useCameraSession } from './hooks/useCameraSession'
import { usePhysicalOrientation } from './hooks/usePhysicalOrientation'
import { useAppSettings } from './hooks/useAppSettings'
import { useAppShellPolicies } from './hooks/useAppShellPolicies'
import { useAudioPracticeTab } from './hooks/useAudioPracticeTab'
import { applyDroneFromDesk, getDroneSnapshot, subscribeDrone } from './hooks/useDrone'
import HandsFreeSettingsCard from './components/HandsFreeSettingsCard'
import { loadLastSurface, saveLastSurface } from './utils/deskMemory'
import { SKIP_MEDIA_PERMISSION_GATE } from './utils/skipMediaPermissionGate'
import {
  upsertWorkspaceDesk,
  deskMatchesSnapshot,
  loadFocusDesk,
  loadWorkspaceDesks,
  saveFocusDesk,
  saveWorkspaceDesks,
  summarizeDesk,
  type DeskSnapshot,
  type WorkspaceDesk,
} from './utils/workspaceDesks'
import { shareTakeToSystem } from './utils/shareTakeVideo'
import { useAutoSoundRecording } from './hooks/useAutoSoundRecording'
import { pausePitchGraphsForMedia } from './hooks/useLivePitchTracker'
import {
  registerAutoPlaybackHold,
  registerInlineTakePlaybackPreviewHold,
  registerTakePlaybackMicHandlers,
  finalizeTakePlaybackCleanup,
  suspendInlineTakeBoxPlaybackForLifecycle,
  releaseTakePlaybackAudio,
  playTakeMediaAudible,
} from './utils/takePlaybackAudio'
import { stopNativeInlineTakeBoxPlayback } from './utils/nativeInlineTakeBoxPlayback'
import {
  prepareInlineMediaElement,
  assignMediaPlaybackSrc,
  resolveMediaPlaybackSrc,
  waitForMediaReadyWithRetry,
} from './utils/mediaPlayback'
import {
  generateThumbnailFromBlob,
  captureAndPersistTakeThumbnail,
  hydrateTakeThumbnailsInBackground,
} from './utils/generateThumbnail'
import {
  normalizeLandscapeRecordingBlob,
  normalizeLandscapeTakeInPlace,
} from './utils/prepareTakeVideoExport'
import { createTake, mergeHydratedTakes, sortTakes, takeHasPlaybackMedia } from './utils/takes'
import {
  pauseYoutubeProxy,
  prepareNewYoutubeReference,
  registerYoutubeStereoGuard,
  setYoutubeReferenceActive,
  startYoutubeProxyPlayback,
  wakeYoutubeReference,
  cancelYoutubeRecordingMaintain,
  scheduleYoutubeRecordingMaintain,
  setYoutubeRecordingMaintain,
  resumeYoutubePlayAlong,
  maintainDuringRecording,
} from './utils/playalong/youtubeBridge'
import {
  getYoutubePlayAlongUiState,
  resetYoutubePlayAlongRouteFailure,
  setYoutubeReferenceEnabled,
  startYoutubePlayAlongDiagnostics,
  stopYoutubePlayAlongDiagnostics,
  subscribeYoutubePlayAlongUi,
} from './utils/playalong/youtubePlayAlongSession'
import { YOUTUBE_PROXY_ORIGIN, parseYoutubeVideoId } from './utils/youtubeEmbed'
import { isYoutubeDialogOpen } from './utils/youtubeDialogState'
import {
  deleteTakeFile,
  NATIVE_AUDIO_MIME,
  NATIVE_VIDEO_MIME,
  persistRenderedTakeVideo,
  persistUploadedVideo,
  readCachedPlaybackSrc,
  resolveTakePlaybackUrl,
  resolveNativeFileUri,
  sanitizeNativeVideoSrc,
  type RecordingCompletePayload,
  type MultitrackRecordingStopOptions,
} from './utils/takeStorage'
import { resetVideoPlayback } from './utils/videoPlayback'
import type { ReviewContext, ReviewSlot, RecordingMode, SortMode, Take, TakeUpdate } from './types'
import { AUDIO_TAKE_THUMBNAIL, getTakeMediaType, inferMediaTypeFromMime } from './utils/mediaType'
import { scheduleViewportSync } from './utils/viewportSync'
import { applyDarkHudStatusBar } from './utils/nativeStatusBar'
import { registerRecordingRouteRestoredHandler } from './utils/stereoPlaybackRoute'
import { lockPortraitOrientation, syncAppOrientationLock } from './utils/lockPortraitOrientation'
import { PHYSICAL_UI_ROOT_ID } from './utils/physicalUiPortal'
import { scheduleAfterPaint, scheduleIdle } from './utils/scheduleDeferred'
import { sharedMetronomeEngine } from './metronome/sharedMetronomeEngine'
import { iosHudDim, motionGpuLayer } from './utils/motionPresets'
import { isOnboardingComplete, markAllCoachMarksSeen } from './utils/onboardingTutorial'
import { getInstrumentSettings } from './utils/instrumentProfiles'
import { ActionSheetProvider, showAlertOutsideTree } from './context/ActionSheetContext'
import { MetronomeProvider } from './context/MetronomeContext'
import { TutorialProvider } from './context/TutorialContext'
import {
  deleteCachedTakeThumbnail,
  invalidateThumbnailCacheIndex,
  persistTakeThumbnail,
  reResolveCachedTakeThumbnail,
} from './utils/takeThumbnailCache'
import {
  clearProjectBestTake,
  createProject,
  DEFAULT_PROJECT_NAME,
  deleteProject,
  deleteLibraryItem,
  deleteVaultTake,
  endPracticeSession,
  findBestTakeId,
  getLibraryItemsByProject,
  getProjectBenchmarkBinding,
  getTakesByProject,
  initVaultDatabase,
  listBestTakeHistory,
  listPracticeItemStates,
  listProjects,
  saveLibraryAudioItem,
  saveTake,
  setProjectBenchmarkBinding,
  setProjectBestTake,
  setProjectLibraryBenchmark,
  setTakeEnhancerBaked,
  startPracticeSession,
  uiTakesFromVaultRowsFast,
  hydrateVaultTakeRowsProgressive,
  updateLibraryItemName,
  updatePracticeItemState,
  updateVaultTake,
  type BestTakeHistoryEntry,
  type PracticeItemState,
  type Project,
} from './db'
import { resolveBenchmarkPlayback } from './utils/benchmarkReference'
import { hydrateLibraryItems, type HydratedLibraryItem } from './utils/libraryBridge'
import {
  triggerBestTakeHaptic,
  triggerLightHaptic,
  triggerSuccessHaptic,
  triggerWarningHaptic,
  warmHaptics,
} from './utils/haptics'
import {
  deleteLibraryFile,
  normalizeLibraryAudioMime,
  persistLibraryAudio,
  probeAudioDurationSeconds,
} from './utils/libraryStorage'
import type { BenchmarkBinding } from './types/library'
import { setTakePlaybackEnhancerState } from './utils/takePlaybackSpeaker'
import BestTakeAudioPlugin, {
  applyNativeExperimentalAudioMode,
  applyTakesBackupPreference,
} from './utils/audioSessionRoute'
import { buildNativeEnhancerParams } from './utils/audioEnhancer'
import { isPlaybackRouteHoldActive } from './utils/playbackRouteCoordinator'
import { setActiveCaptureProfile } from './utils/audioCapture'
import {
  buildRecordingCaptureDiagnostics,
  logRecordingCaptureDiagnostics,
  resolveNativePlaybackGainDb,
} from './utils/recordingDiagnostics'
import {
  installPlaybackRouteEndedListener,
  clearPlaybackRouteForLifecycle,
  preparePlaybackRoute,
  registerPlaybackCameraHandlers,
} from './utils/playbackRouteCoordinator'
import {
  forceNativeRecordingMode,
  syncNativeCameraSessionState,
  isNativeCaptureSessionActive,
} from './utils/cameraSessionState'
import { pickHudQuickSettings } from './utils/hudQuickSettings'
import { initAppFilesystem, nativeDataFileExists } from './utils/filesystemInit'
import {
  bootstrapViewport,
  requestCameraPreviewLayoutRecovery,
  stabilizeViewportAfterMediaInteraction,
} from './utils/viewportSync'
import { resumePlaybackAudioContext } from './utils/playbackAudioContext'
import {
  APP_BACKGROUND_SUSPEND_EVENT,
  APP_FOREGROUND_RECOVERY_EVENT,
  isAppInForeground,
} from './utils/appForeground'
import { loadAppSettingsForSessionStart } from './utils/appSettings'
import {
  applyAutoPlaybackLeadIn,
  attachAutoPlaybackTailSkip,
  AUTO_PLAYBACK_LEAD_IN_S,
} from './utils/autoRecordPlayback'
import {
  attachPlaybackPipelineInstrumentation,
  createPlaybackDiagSession,
  logAudioFileContentVerification,
  logAudioSessionSnapshot,
  logPlaybackSourceVerification,
  logRecordingOutputVerification,
  logRouteTransition,
  setActivePlaybackDiagSession,
  snapshotPlaybackMedia,
} from './utils/audioPlaybackDiagnostics'
import { tuneMusicRecordingStream, tunePlaybackIsolationStream } from './utils/audioCapture'
import { prepareTakePlaybackReadiness } from './utils/takePlaybackReadiness'
import AppBootGate from './components/ui/AppBootGate'
import AnimatedTabPanel from './components/ui/AnimatedTabPanel'
import AudioPracticeTopTabs from './components/audioPractice/AudioPracticeTopTabs'
import AudioModeHome from './components/audioPractice/AudioModeHome'
import AudioMetronomeTab from './components/audioPractice/AudioMetronomeTab'
import AudioTunerTab from './components/audioPractice/AudioTunerTab'
import PracticeTimelineView from './practiceTimeline/components/PracticeTimelineView'
import {
  consumePendingMarkers,
  saveTakeMarkers,
} from './practiceTimeline/recording/timelineMarkers'
import TunerTakePillRow from './components/audioPractice/TunerTakePillRow'
import PracticeHub, {
  type FocusedPracticeSelection,
} from './components/PracticeHub'
import FocusedPracticeCue from './components/FocusedPracticeCue'
import FocusedPracticeHistory from './components/FocusedPracticeHistory'
import YoutubeUrlDialog from './components/YoutubeUrlDialog'
import { PracticeReferenceContext } from './context/PracticeReferenceContext'
import {
  getSelectedReferenceUrl,
  selectPracticeReference,
} from './utils/practiceReferences'
import RoutineBar from './components/RoutineBar'
import {
  freshRoutineDay,
  loadPreferredInstrumentId,
  loadRoutine,
  loadRoutineDay,
  nextOpenStep,
  reconcileDay,
  routineProgress,
  savePreferredInstrumentId,
  saveRoutine,
  saveRoutineDay,
  todayKey,
  type Routine,
  type RoutineDay,
} from './utils/practiceRoutines'
import type { RoutineBuilderMode, RoutineFocusRequest } from './components/RoutineBuilder'
import {
  AudioModePlaybackProvider,
  audioModePlaybackControlsRef,
} from './context/AudioModePlaybackContext'
import type { AudioPracticeTab } from './types/audioPractice'
import { requestQuickFunctionFromApp } from './utils/quickTunerLaunch'
import { initHeadphoneOutputDetection } from './utils/headphoneOutput'
import { registerKeepAwakeLifecycle } from './utils/keepScreenAwake'
import { analyzeTakeForFocusedPractice } from './utils/takePracticeAnalysis'

const AUTO_PLAYBACK_POST_COOLDOWN_MS = 0
const AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS = 240
const AUDIO_PLAYBACK_CAPTURE_SUSPEND_MS = 300
const YOUTUBE_HEADPHONES_TIP_MS = 3200
const YOUTUBE_EXPAND_TIP_MS = 4500

type AudioTakeReadiness =
  | { status: 'preparing' }
  | { status: 'ready'; durationSeconds: number }
  | { status: 'error'; message: string }

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function resolveTakePlaybackUrlFast(filePath: string, videoUrl: string): string | null {
  const freshUrl = sanitizeNativeVideoSrc(videoUrl)
  if (freshUrl) return freshUrl

  if (videoUrl && videoUrl.startsWith('blob:')) {
    return videoUrl
  }

  if (!filePath && videoUrl) {
    return resolveMediaPlaybackSrc(videoUrl)
  }

  const cached = readCachedPlaybackSrc(filePath, videoUrl)
  if (cached) return cached

  if (videoUrl) {
    return resolveMediaPlaybackSrc(videoUrl)
  }

  return null
}

/** Stable pitch source — same object reference when signature unchanged. */
interface MainAudioPitchSource {
  mediaRef: RefObject<HTMLMediaElement | null>
  take: Take | null
  isPlaying: boolean
  mediaKey: string
  liveMicOnly: boolean
}

const ReviewModeOverlay = lazy(() => import('./components/ReviewModeOverlay'))
const DraggablePitchWidget = lazy(() => import('./components/DraggablePitchWidget'))
/** Minimum gap between unforced tuner capture-session rebuilds. */
const TUNER_MIC_REBUILD_FLOOR_MS = 1500

const importMetronomeWidget = () => import('./components/DraggableMetronomeWidget')
const importDroneWidget = () => import('./components/DraggableDroneWidget')
const DraggableMetronomeWidget = lazy(importMetronomeWidget)
const DraggableDroneWidget = lazy(importDroneWidget)

/** Where the last sitting ended. Read once so day two opens on the take, not a menu. */
const bootSurface = loadLastSurface()
const TakeVaultDrawer = lazy(() => import('./components/TakeVaultDrawer'))
const importSettingsDrawer = () => import('./components/SettingsDrawer')
const SettingsDrawer = lazy(importSettingsDrawer)
const OnboardingTutorial = lazy(() => import('./components/OnboardingTutorial'))
const CoachMark = lazy(() => import('./components/CoachMark'))
const LabsOverlay = lazy(() => import('./components/labs/LabsOverlay'))
const MultitrackOverlay = lazy(() => import('./multitrack/components/MultitrackOverlay'))

/** Wait for Settings sheet exit before attaching pitch engine (matches drawer close animation). */
const PITCH_ENGINE_COMMIT_DELAY_MS = 300

interface AppBootSnapshot {
  projects: Project[]
  activeProjectId: string | null
  takes: Take[]
  benchmarkId: string | null
  challengerId: string | null
  libraryItems: HydratedLibraryItem[]
  benchmarkBinding: BenchmarkBinding | null
  bestTakeHistory: BestTakeHistoryEntry[]
  practiceItemStates: PracticeItemState[]
}

const BOOT_REVEAL_DELAY_MS = 500

function formatBootFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  const base = 'BestTake could not finish starting. Your saved takes are still on this device.'
  return detail ? `${base}\n\n${detail}` : base
}

async function performAppBoot(): Promise<AppBootSnapshot> {
  await Promise.all([initVaultDatabase(), initAppFilesystem()])

  const settings = loadAppSettingsForSessionStart()
  const projectList = await listProjects()
  const initialId = projectList[0]?.id ?? null
  let takes: Take[] = []
  let benchmarkId: string | null = null
  let challengerId: string | null = null
  let libraryItems: HydratedLibraryItem[] = []
  let benchmarkBinding: BenchmarkBinding | null = null
  const [bestTakeHistory, practiceItemStates] = await Promise.all([
    listBestTakeHistory(),
    listPracticeItemStates(),
  ])

  if (initialId) {
    const rows = await getTakesByProject(initialId)
    const loadedFast = uiTakesFromVaultRowsFast(rows)
    benchmarkId = findBestTakeId(rows)
    const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null
    challengerId = settings.showTakeCards ? defaultChallengerId : null

    const libraryRows = await getLibraryItemsByProject(initialId)
    libraryItems = await hydrateLibraryItems(
      libraryRows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        kind: row.kind,
        name: row.name,
        createdAt: row.createdAt,
        filePath: row.filePath,
        mimeType: row.mimeType,
        duration: row.duration,
      }))
    )
    benchmarkBinding = await getProjectBenchmarkBinding(initialId)

    const hydrated = await hydrateVaultTakeRowsProgressive(rows, {
      priorityIds: [benchmarkId, defaultChallengerId].filter((id): id is string => Boolean(id)),
    })
    takes = mergeHydratedTakes(loadedFast, hydrated)
  }

  return {
    projects: projectList,
    activeProjectId: initialId,
    takes,
    benchmarkId,
    challengerId,
    libraryItems,
    benchmarkBinding,
    bestTakeHistory,
    practiceItemStates,
  }
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true)
  const [bootSnapshot, setBootSnapshot] = useState<AppBootSnapshot | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    registerKeepAwakeLifecycle()
    initHeadphoneOutputDetection()
    bootstrapViewport()
    void lockPortraitOrientation()
    void applyDarkHudStatusBar()

    void (async () => {
      try {
        const snapshot = await performAppBoot()
        if (cancelled) return

        if (Capacitor.isNativePlatform()) {
          await SplashScreen.hide()
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, BOOT_REVEAL_DELAY_MS)
        })
        if (cancelled) return

        setBootSnapshot(snapshot)
        scheduleIdle(() => {
          void resumePlaybackAudioContext()
        }, 400)
        setIsBooting(false)
      } catch (error) {
        console.error('Failed to initialize app', error)
        if (cancelled) return

        if (Capacitor.isNativePlatform()) {
          try {
            await SplashScreen.hide()
          } catch {
            // Splash may already be hidden on web or after a partial init.
          }
        }

        setBootError(formatBootFailureMessage(error))
        setIsBooting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bootAttempt])

  const retryBoot = useCallback(() => {
    setBootError(null)
    setBootSnapshot(null)
    setIsBooting(true)
    setBootAttempt((attempt) => attempt + 1)
  }, [])

  if (isBooting) {
    return <AppBootGate />
  }

  if (bootError || !bootSnapshot) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-black p-6 text-center font-sans text-white">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">BestTake could not start</h1>
          <p className="whitespace-pre-line text-sm leading-6 text-white/70">
            {bootError ?? 'BestTake could not start.'}
          </p>
          <button
            type="button"
            onClick={retryBoot}
            className="min-h-11 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black"
          >
            Try Again
          </button>
        </div>
      </main>
    )
  }

  return <StandardApp bootSnapshot={bootSnapshot} />
}

function StandardApp({ bootSnapshot }: { bootSnapshot: AppBootSnapshot }) {
  usePhysicalOrientation()
  const isNativeCameraPlatform = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  const [takes, setTakes] = useState<Take[]>(bootSnapshot.takes)
  const [projects, setProjects] = useState<Project[]>(bootSnapshot.projects)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    bootSnapshot.activeProjectId
  )
  const [benchmarkId, setBenchmarkId] = useState<string | null>(bootSnapshot.benchmarkId)
  const [challengerId, setChallengerId] = useState<string | null>(bootSnapshot.challengerId)
  const [libraryItems, setLibraryItems] = useState<HydratedLibraryItem[]>(bootSnapshot.libraryItems)
  const [benchmarkBinding, setBenchmarkBinding] = useState<BenchmarkBinding | null>(
    bootSnapshot.benchmarkBinding
  )
  const [bestTakeHistory, setBestTakeHistory] = useState<BestTakeHistoryEntry[]>(
    bootSnapshot.bestTakeHistory,
  )
  const [practiceItemStates, setPracticeItemStates] = useState<PracticeItemState[]>(
    bootSnapshot.practiceItemStates,
  )
  const [isPracticeHubOpen, setIsPracticeHubOpen] = useState(false)
  const [focusedPractice, setFocusedPractice] = useState<FocusedPracticeSelection | null>(null)
  const [focusPanel, setFocusPanel] = useState<'references' | 'history' | null>(null)
  const [focusedCueOpen, setFocusedCueOpen] = useState(false)
  const [focusedPostTakeId, setFocusedPostTakeId] = useState<string | null>(null)
  const [focusedPostTakeReviewed, setFocusedPostTakeReviewed] = useState(false)
  const [focusedPracticeSessionId, setFocusedPracticeSessionId] = useState<string | null>(null)
  const [focusedReferenceTakeId, setFocusedReferenceTakeId] = useState<string | null>(null)
  const focusedPreviousChallengerRef = useRef<string | null>(null)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [reviewContext, setReviewContext] = useState<ReviewContext>('compare')
  const [vaultReviewIndex, setVaultReviewIndex] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [labsRoute, setLabsRoute] = useState<LabsRoute | null>(null)
  const [multitrackOpen, setMultitrackOpen] = useState(false)
  const [multitrackPendingRecordingTakeId, setMultitrackPendingRecordingTakeId] = useState<
    string | null
  >(null)
  const multitrackRecordingActiveRef = useRef(false)
  const [pipDragState, setPipDragState] = useState<PipDragUiState>({
    isDragging: false,
    isArming: false,
    overDelete: false,
  })
  const [autoPlaybackTakeId, setAutoPlaybackTakeId] = useState<string | null>(null)
  const [autoPlaybackPlaying, setAutoPlaybackPlaying] = useState(false)
  const [audioModeTakePlaying, setAudioModeTakePlaying] = useState(false)
  const [benchmarkPipPlaying, setBenchmarkPipPlaying] = useState(false)
  const [challengerPipPlaying, setChallengerPipPlaying] = useState(false)
  const [reviewPlaybackPlaying, setReviewPlaybackPlaying] = useState(false)
  const [takeDeleteError, setTakeDeleteError] = useState<string | null>(null)
  const [audioTakeReadiness, setAudioTakeReadiness] = useState<Record<string, AudioTakeReadiness>>(
    {},
  )
  // The pitch overlay comes back if it was up when the app was last closed.
  const [showPitch, setShowPitch] = useState(() => loadAppSettingsForSessionStart().pitchTrackerEnabled)
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false)
  const [pendingPitchTrackerEnabled, setPendingPitchTrackerEnabled] = useState<boolean | null>(null)
  /** Saved desks — chips at the top of the Workspace tray. */
  const [workspaceDesks, setWorkspaceDesks] = useState<WorkspaceDesk[]>(() => loadWorkspaceDesks())
  /** The live room, kept current so a focused take can remember the desk it was played on. */
  const liveDeskSnapshotRef = useRef<DeskSnapshot | null>(null)
  const [handsFreeCardOpen, setHandsFreeCardOpen] = useState(false)
  /** One breath of the record button after Current finishes playing back. */
  const [againPulse, setAgainPulse] = useState(false)
  const [youtubeAutoPlayOnLoad, setYoutubeAutoPlayOnLoad] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null)
  const [showYoutubeHeadphonesTip, setShowYoutubeHeadphonesTip] = useState(false)
  const [youtubeHeadphonesTipNonce, setYoutubeHeadphonesTipNonce] = useState(0)
  const [showYoutubeExpandTip, setShowYoutubeExpandTip] = useState(false)
  const [youtubeExpandTipNonce, setYoutubeExpandTipNonce] = useState(0)
  const [youtubePlayAlongUi, setYoutubePlayAlongUi] = useState(getYoutubePlayAlongUiState)
  const [isSplitView, setIsSplitView] = useState(false)
  const isSplitViewRef = useRef(false)
  const [splitRatio, setSplitRatio] = useState(56)
  // The legacy compact/full card state remains available to the existing
  // presentation architecture, but Camera Mode no longer exposes its chevron trigger.
  const [cameraTakeCardsExpanded] = useState(false)
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false)
  const [tutorialTourEnabled, setTutorialTourEnabled] = useState(false)

  /* ---- Daily routine ------------------------------------------------------
   * One routine, one card of progress for today. The routine is the checklist;
   * each step carries a desk so starting it is a single tap. */
  const [routine, setRoutine] = useState<Routine | null>(() => loadRoutine())
  const [routineDay, setRoutineDay] = useState<RoutineDay | null>(() => {
    const stored = loadRoutine()
    return stored ? loadRoutineDay(stored) : null
  })
  const [routineBuilderRequest, setRoutineBuilderRequest] = useState<RoutineBuilderMode | null>(null)
  /** A focus step with no practice item yet: the hub asks, then binds it. */
  const [routineFocusRequest, setRoutineFocusRequest] = useState<RoutineFocusRequest | null>(null)
  const [preferredInstrumentId, setPreferredInstrumentId] = useState<string | null>(() =>
    loadPreferredInstrumentId(),
  )
  const [routineBarExpanded, setRoutineBarExpanded] = useState(true)
  const routineRef = useRef<Routine | null>(routine)
  routineRef.current = routine
  const routineDayRef = useRef<RoutineDay | null>(routineDay)
  routineDayRef.current = routineDay

  useEffect(() => {
    saveRoutine(routine)
  }, [routine])

  useEffect(() => {
    saveRoutineDay(routineDay)
  }, [routineDay])
  const [practiceSessionActive, setPracticeSessionActive] = useState(false)
  const [practiceRecordingControlsExpanded, setPracticeRecordingControlsExpanded] = useState(false)
  const [showTunerTakePills, setShowTunerTakePills] = useState(false)

  const { settings, updateSettings, resetSettings } = useAppSettings()
  // Focus references are for listening between attempts; regular practice keeps its play-along preference.
  const shouldPauseYoutubeForRecording = Boolean(focusedPractice) || settings.excludeYoutubeFromRecording
  const {
    activeTab: audioPracticeTab,
    setActiveTab: setAudioPracticeTab,
  } = useAudioPracticeTab(bootSurface.tab)
  const handleAudioPracticeTabChange = useCallback(
    (tab: AudioPracticeTab) => {
      if (tab === 'tuner' && audioPracticeTab !== 'tuner') {
        setShowTunerTakePills(false)
      }
      setAudioPracticeTab(tab)
      if (tab === 'games') {
        setShowPitch(false)
        setLabsRoute('menu')
      }
    },
    [audioPracticeTab, setAudioPracticeTab]
  )
  /** Practice has no tab of its own — the metronome's Program button opens it. */
  const handleOpenProgram = useCallback(() => {
    handleAudioPracticeTabChange('practice')
  }, [handleAudioPracticeTabChange])
  const showTakeCardsRef = useRef(settings.showTakeCards)
  showTakeCardsRef.current = settings.showTakeCards
  const audioEnhancerEnabledRef = useRef(settings.audioEnhancerEnabled)
  audioEnhancerEnabledRef.current = settings.audioEnhancerEnabled
  const audioEnhancerSettingsRef = useRef(settings.audioEnhancerSettings)
  audioEnhancerSettingsRef.current = settings.audioEnhancerSettings
  const pendingChallengerIdRef = useRef<string | null>(null)
  /** User closed the current-take box — skip auto-fill until the next recording. */
  const challengerUserDismissedRef = useRef(false)
  const reloadTakesGenerationRef = useRef(0)
  const takesRef = useRef<Take[]>([])
  const pendingAutoPlaybackRef = useRef(false)
  const audioTakeReadinessInputRef = useRef(
    new Map<string, { filePath: string; fallbackUrl: string }>()
  )
  const autoPlaybackAudioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlaybackUsesNativeRef = useRef(false)
  const liveMicPlaceholderRef = useRef<HTMLMediaElement | null>(null)
  const queuedAutoPlayRef = useRef<{ url: string; takeId: string } | null>(null)
  const recordingModeRef = useRef<RecordingMode>('video')
  const cameraReadyRef = useRef(false)
  const pitchCommitTimerRef = useRef<number | null>(null)
  const autoPlaybackReleaseTimerRef = useRef<number | null>(null)
  const autoPlaybackGenerationRef = useRef(0)
  const playAutoTakeAudioRef = useRef<
    (
      playbackUrl: string,
      takeId: string,
      performanceStartSeconds?: number,
      filePath?: string,
      playbackGainDb?: number
    ) => void
  >(() => {})
  const refreshCameraSessionRef = useRef<() => Promise<void>>(async () => {})
  const suspendCameraForBackgroundRef = useRef<() => void>(() => {})
  const recordDeleteDropRef = useRef<HTMLDivElement>(null)
  const [autoRecordStartSuppressed, setAutoRecordStartSuppressed] = useState(false)
  const [handsFreePlaybackPending, setHandsFreePlaybackPending] = useState(false)
  const autoRecordStartSuppressedRef = useRef(autoRecordStartSuppressed)
  autoRecordStartSuppressedRef.current = autoRecordStartSuppressed
  /**
   * True from the moment a hands-free take finishes until its replay has ended.
   * Read by background work that rewrites the take file on disk (the Audio
   * Enhancer bake) so it never swaps the file out from under the decoder that
   * is streaming it.
   */
  const handsFreePlaybackBusyRef = useRef(false)
  handsFreePlaybackBusyRef.current =
    pendingAutoPlaybackRef.current || handsFreePlaybackPending || autoPlaybackPlaying
  const benchmarkPipVideoRef = useRef<HTMLMediaElement>(null)
  const challengerPipVideoRef = useRef<HTMLMediaElement>(null)
  const splitPreviewRef = useRef<HTMLVideoElement>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null)
  const youtubeUrlRef = useRef<string | null>(null)
  const lastMicPreferenceRouteRef = useRef(settings.micInputPreference)
  const [youtubeHostEl, setYoutubeHostEl] = useState<HTMLElement | null>(null)
  const appShellRef = useRef<HTMLDivElement>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId
  const focusedPracticeRef = useRef<FocusedPracticeSelection | null>(focusedPractice)
  focusedPracticeRef.current = focusedPractice
  const focusedPracticeSessionIdRef = useRef<string | null>(focusedPracticeSessionId)
  focusedPracticeSessionIdRef.current = focusedPracticeSessionId
  const practiceItemStatesRef = useRef<PracticeItemState[]>(practiceItemStates)
  practiceItemStatesRef.current = practiceItemStates

  const isReviewOpen = reviewSlot !== null
  const isLabsOpen = labsRoute !== null
  const isExperimentalOpen = isLabsOpen || multitrackOpen
  const hudModalState: 'idle' | 'sheet' | 'review' = isReviewOpen
    ? 'review'
    : isVaultOpen || isSettingsOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null
    ? 'sheet'
    : 'idle'

  useEffect(() => {
    if (!isExperimentalOpen) return
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
    setIsPracticeHubOpen(false)
  }, [isExperimentalOpen])

  useLayoutEffect(() => {
    return scheduleViewportSync(() => {})
  }, [])

  useEffect(() => {
    if (isOnboardingComplete()) {
      // Returning players with a routine open on Today, unless today is done.
      const stored = routineRef.current
      if (!stored || stored.steps.length === 0) return
      if (routineProgress(stored, routineDayRef.current).complete) return
      const timer = window.setTimeout(() => {
        setIsPracticeHubOpen(true)
      }, BOOT_REVEAL_DELAY_MS + 240)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      setShowOnboardingTutorial(true)
    }, BOOT_REVEAL_DELAY_MS + 240)
    return () => window.clearTimeout(timer)
  }, [])

  const handleCompleteOnboardingTutorial = useCallback(() => {
    showTakeCardsRef.current = true
    updateSettings({
      autoSoundRecording: false,
      showTakeCards: true,
    })
    setShowOnboardingTutorial(false)
    setTutorialTourEnabled(true)
    setIsPracticeHubOpen(true)
  }, [updateSettings])

  const handleSkipOnboardingTutorial = useCallback(() => {
    markAllCoachMarksSeen()
    setShowOnboardingTutorial(false)
    setTutorialTourEnabled(false)
    setIsPracticeHubOpen(true)
  }, [])

  /** Onboarding instrument pick — sets the tuner profile, written pitch, and auto-record gate. */
  const handleSelectOnboardingInstrument = useCallback(
    (instrumentId: string) => {
      const instrumentSettings = getInstrumentSettings(instrumentId)
      if (!instrumentSettings) return
      updateSettings(instrumentSettings)
      savePreferredInstrumentId(instrumentId)
      setPreferredInstrumentId(instrumentId)
    },
    [updateSettings],
  )

  /**
   * The last onboarding card offers to lay out a routine. Either choice ends
   * the cards and lands in the hub's builder; the guided tour waits until the
   * hub closes, same as after a normal finish.
   */
  const handleOnboardingRoutineChoice = useCallback(
    (mode: RoutineBuilderMode) => {
      showTakeCardsRef.current = true
      updateSettings({
        autoSoundRecording: false,
        showTakeCards: true,
      })
      setShowOnboardingTutorial(false)
      setTutorialTourEnabled(true)
      setRoutineBuilderRequest(mode)
      setIsPracticeHubOpen(true)
    },
    [updateSettings],
  )

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    warmHaptics()
    void syncAppOrientationLock()

    let removeListener: (() => void) | undefined
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          warmHaptics()
          void syncAppOrientationLock()
        }
      }).then((sub) => {
        removeListener = () => {
          void sub.remove()
        }
      })
    })

    return () => {
      removeListener?.()
    }
  }, [])

  useEffect(() => {
    isSplitViewRef.current = isSplitView
  }, [isSplitView])

  useEffect(() => {
    if (!showYoutubeHeadphonesTip) return
    const timer = window.setTimeout(() => {
      setShowYoutubeHeadphonesTip(false)
    }, YOUTUBE_HEADPHONES_TIP_MS)
    return () => window.clearTimeout(timer)
  }, [showYoutubeHeadphonesTip, youtubeHeadphonesTipNonce])

  useEffect(() => {
    if (!showYoutubeExpandTip) return
    const timer = window.setTimeout(() => {
      setShowYoutubeExpandTip(false)
    }, YOUTUBE_EXPAND_TIP_MS)
    return () => window.clearTimeout(timer)
  }, [showYoutubeExpandTip, youtubeExpandTipNonce])

  useEffect(() => {
    if (isSplitView) {
      setShowYoutubeExpandTip(false)
    }
  }, [isSplitView])

  const teardownPipMedia = useCallback((media: HTMLMediaElement | null | undefined) => {
    if (!media) return
    pausePitchGraphsForMedia(media)
    resetVideoPlayback(media)
  }, [])

  const pausePipVideos = useCallback(() => {
    const benchmark = benchmarkPipVideoRef.current
    const challenger = challengerPipVideoRef.current
    teardownPipMedia(benchmark)
    teardownPipMedia(challenger)
    // Native AVPlayer overlay path — notify:true lets the owning box reset its
    // isPlaying state and release the stereo hold it acquired.
    void stopNativeInlineTakeBoxPlayback({ notify: true })
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setBenchmarkPipPlaying(false)
    setChallengerPipPlaying(false)
  }, [teardownPipMedia])

  const releaseAutoRecordSuppress = useCallback((delayMs = 350) => {
    if (autoPlaybackReleaseTimerRef.current !== null) {
      window.clearTimeout(autoPlaybackReleaseTimerRef.current)
      autoPlaybackReleaseTimerRef.current = null
    }

    if (delayMs <= 0) {
      autoRecordStartSuppressedRef.current = false
      setAutoRecordStartSuppressed(false)
      return
    }

    autoPlaybackReleaseTimerRef.current = window.setTimeout(() => {
      autoPlaybackReleaseTimerRef.current = null
      autoRecordStartSuppressedRef.current = false
      setAutoRecordStartSuppressed(false)
    }, delayMs)
  }, [])

  const teardownAutoPlaybackMedia = useCallback(() => {
    if (autoPlaybackUsesNativeRef.current) {
      autoPlaybackUsesNativeRef.current = false
      audioModePlaybackControlsRef.pause?.()
    }
    const audio = autoPlaybackAudioRef.current
    if (audio) {
      pausePitchGraphsForMedia(audio)
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setAutoPlaybackPlaying(false)
  }, [])

  const teardownActiveAutoPlayback = useCallback(() => {
    autoPlaybackGenerationRef.current += 1
    queuedAutoPlayRef.current = null
    teardownAutoPlaybackMedia()
    setAutoPlaybackTakeId(null)
  }, [teardownAutoPlaybackMedia])

  const stopAutoPlaybackAudio = useCallback(() => {
    pendingAutoPlaybackRef.current = false
    setHandsFreePlaybackPending(false)
    teardownActiveAutoPlayback()
  }, [teardownActiveAutoPlayback])

  useEffect(() => {
    const suspendInteractiveAudio = () => {
      pauseYoutubeProxy(youtubeIframeRef.current)
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      void suspendInlineTakeBoxPlaybackForLifecycle()
      void finalizeTakePlaybackCleanup()
      void clearPlaybackRouteForLifecycle('app-background')
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') suspendInteractiveAudio()
    }
    const onBackgroundSuspend = () => suspendInteractiveAudio()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackgroundSuspend)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackgroundSuspend)
    }
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const finishAutoPlayback = useCallback(() => {
    // Clear the replay UI and invalidate any in-flight native start
    // immediately. Route/mic cleanup can take a bridge round trip and must not
    // leave the interface stuck in "Playing your take back…" while it settles.
    stopAutoPlaybackAudio()
    void finalizeTakePlaybackCleanup().finally(() => {
      releaseAutoRecordSuppress(AUTO_PLAYBACK_POST_COOLDOWN_MS)
      if (recordingModeRef.current === 'audio') {
        stabilizeViewportAfterMediaInteraction()
        window.requestAnimationFrame(() => {
          void refreshCameraSessionRef.current()
        })
      }
    })
  }, [releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const playAutoTakeAudio = useCallback(
    (
      playbackUrl: string,
      takeId: string,
      performanceStartSeconds?: number,
      filePath = '',
      playbackGainDb?: number
    ) => {
      if (recordingModeRef.current !== 'audio') {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        return
      }

      if (!playbackUrl) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        finishAutoPlayback()
        return
      }

      const playbackGeneration = autoPlaybackGenerationRef.current + 1
      autoPlaybackGenerationRef.current = playbackGeneration

      const sessionId = createPlaybackDiagSession('auto-playback')
      setActivePlaybackDiagSession(sessionId)
      const previousAutoPlaybackTakeId = queuedAutoPlayRef.current?.takeId ?? null
      const newestTakeId = takesRef.current[takesRef.current.length - 1]?.id ?? null

      teardownAutoPlaybackMedia()
      queuedAutoPlayRef.current = { url: playbackUrl, takeId }

      setAutoRecordStartSuppressed(true)
      setHandsFreePlaybackPending(true)
      setAutoPlaybackPlaying(false)
      setAutoPlaybackTakeId(takeId)

      const useNativeAudioPlayback =
        Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' && Boolean(filePath)

      if (useNativeAudioPlayback) {
        autoPlaybackUsesNativeRef.current = true
        void (async () => {
          await waitMs(AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS)
          if (autoPlaybackGenerationRef.current !== playbackGeneration) return

          // The provider owns the same native player used by ordinary audio
          // take playback. It is mounted globally; wait through a React commit
          // rather than silently falling back to the old HTML-audio path.
          let playNativeAudio = audioModePlaybackControlsRef.play
          for (let attempt = 0; !playNativeAudio && attempt < 15; attempt++) {
            await waitMs(16)
            playNativeAudio = audioModePlaybackControlsRef.play
          }
          if (!playNativeAudio) {
            console.error(
              '[Playback] native audio controller unavailable; WebKit fallback disabled',
              {
                takeId,
              }
            )
            autoPlaybackUsesNativeRef.current = false
            setActivePlaybackDiagSession(null)
            finishAutoPlayback()
            return
          }

          if (!(await nativeDataFileExists(filePath))) {
            console.warn('[Playback] native auto-playback aborted — recording file missing', {
              takeId,
              filePath,
            })
            setActivePlaybackDiagSession(null)
            finishAutoPlayback()
            return
          }

          const startTime = Math.max(
            0,
            (typeof performanceStartSeconds === 'number' ? performanceStartSeconds : 0) -
              AUTO_PLAYBACK_LEAD_IN_S
          )
          let tailTimer: number | null = null
          const clearTailTimer = () => {
            if (tailTimer !== null) {
              window.clearTimeout(tailTimer)
              tailTimer = null
            }
          }
          const completeNativeAutoPlayback = () => {
            clearTailTimer()
            if (autoPlaybackGenerationRef.current !== playbackGeneration) return
            autoPlaybackUsesNativeRef.current = false
            setActivePlaybackDiagSession(null)
            finishAutoPlayback()
          }

          playNativeAudio(
            {
              id: takeId,
              takeId,
              name: 'Hands-free take',
              filePath,
              mediaUrl: playbackUrl,
              mimeType: NATIVE_AUDIO_MIME,
              playbackGainDb,
              nativePlayback: true,
            },
            {
              startTime,
              onStarted: (duration) => {
                if (autoPlaybackGenerationRef.current !== playbackGeneration) {
                  audioModePlaybackControlsRef.pause?.()
                  return
                }
                setHandsFreePlaybackPending(false)
                setAutoPlaybackPlaying(true)
                const remainingPlaybackSeconds = duration - startTime
                const tailSkipSeconds = settings.soundSilenceSeconds
                if (remainingPlaybackSeconds > tailSkipSeconds + 0.25) {
                  tailTimer = window.setTimeout(() => {
                    tailTimer = null
                    audioModePlaybackControlsRef.pause?.()
                    completeNativeAutoPlayback()
                  }, (remainingPlaybackSeconds - tailSkipSeconds) * 1000)
                }
              },
              onFailed: completeNativeAutoPlayback,
              onEnded: completeNativeAutoPlayback,
            }
          )
        })()
        return
      }

      const audio = autoPlaybackAudioRef.current
      if (!audio) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        setActivePlaybackDiagSession(null)
        finishAutoPlayback()
        return
      }

      void logPlaybackSourceVerification({
        sessionId,
        requestedTakeId: takeId,
        filePath,
        requestedUrl: playbackUrl,
        resolvedUrl: playbackUrl,
        newestTakeId,
        previousAutoPlaybackTakeId,
        queuedTakeId: takeId,
      })
      void logAudioSessionSnapshot('before-auto-playback-assign-src', sessionId, {
        playbackGeneration,
      })

      const detachPipeline = attachPlaybackPipelineInstrumentation(audio, {
        sessionId,
        takeId,
        path: 'auto-playback',
      })
      let detachTailSkip: (() => void) | null = null
      let autoPlaybackComplete = false

      void (async () => {
        if (Capacitor.isNativePlatform()) {
          await waitMs(AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS)
        }
        if (autoPlaybackGenerationRef.current !== playbackGeneration) {
          detachPipeline()
          setActivePlaybackDiagSession(null)
          return
        }

        if (Capacitor.isNativePlatform() && filePath) {
          if (!(await nativeDataFileExists(filePath))) {
            console.warn('[Playback] auto-playback aborted — recording file missing', {
              takeId,
              filePath,
            })
            detachPipeline()
            setActivePlaybackDiagSession(null)
            finishAutoPlayback()
            return
          }
        }

        try {
          if (Capacitor.isNativePlatform()) {
            // Mirror camera hands-free: release live capture before route prep
            // so headphone playback is not fighting the mic capture session.
            suspendCameraForBackgroundRef.current()
            await waitMs(AUDIO_PLAYBACK_CAPTURE_SUSPEND_MS)
            await preparePlaybackRoute({ suspendCamera: false })
          }
        } catch (error) {
          console.warn('[PlaybackRoute] auto-playback prep failed', error)
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
          return
        }

        audio.pause()
        audio.onended = null
        audio.onerror = null
        audio.removeAttribute('src')
        audio.load()

        prepareInlineMediaElement(audio)
        audio.preload = 'auto'
        assignMediaPlaybackSrc(audio, playbackUrl)
        audio.load()

        logRouteTransition(sessionId, 'recording-ended-playback-pending', {
          takeId,
          playbackUrl,
        })

        await logAudioSessionSnapshot('before-wait-for-media-ready', sessionId)

        const ready = await waitForMediaReadyWithRetry(audio)
        if (autoPlaybackGenerationRef.current !== playbackGeneration) {
          detachPipeline()
          setActivePlaybackDiagSession(null)
          return
        }
        if (!ready || queuedAutoPlayRef.current?.takeId !== takeId) {
          logRouteTransition(sessionId, 'auto-playback-aborted-not-ready', {
            ready,
            queuedTakeId: queuedAutoPlayRef.current?.takeId ?? null,
            ...snapshotPlaybackMedia(audio),
          })
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
          return
        }

        if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
          console.warn('[Playback] auto-playback aborted — media has no duration', {
            takeId,
            duration: audio.duration,
            readyState: audio.readyState,
          })
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
          return
        }

        await logAudioSessionSnapshot('before-playTakeMediaAudible', sessionId)
        void logAudioFileContentVerification({
          sessionId,
          takeId,
          filePath,
          playbackUrl,
          durationSeconds: audio.duration,
        })

        await applyAutoPlaybackLeadIn(audio, undefined, performanceStartSeconds)

        const completeAutoPlayback = () => {
          if (autoPlaybackComplete) return
          autoPlaybackComplete = true
          detachTailSkip?.()
          detachTailSkip = null
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
        }

        detachTailSkip = attachAutoPlaybackTailSkip(
          audio,
          settings.soundSilenceSeconds,
          completeAutoPlayback
        )
        audio.onended = completeAutoPlayback
        audio.onerror = completeAutoPlayback

        const started = await playTakeMediaAudible(audio, {
          skipRoutePrep: true,
          onFailure: () => setAutoPlaybackPlaying(false),
        })
        if (autoPlaybackGenerationRef.current !== playbackGeneration) {
          detachTailSkip?.()
          detachTailSkip = null
          detachPipeline()
          setActivePlaybackDiagSession(null)
          return
        }

        await logAudioSessionSnapshot(
          started ? 'after-playTakeMediaAudible-started' : 'after-playTakeMediaAudible-failed',
          sessionId,
          { started }
        )

        if (started) {
          setHandsFreePlaybackPending(false)
          setAutoPlaybackPlaying(true)
        } else {
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
        }
      })()
    },
    [finishAutoPlayback, settings.soundSilenceSeconds, teardownAutoPlaybackMedia]
  )

  playAutoTakeAudioRef.current = playAutoTakeAudio

  const applyTakeThumbnails = useCallback((updates: Map<string, string>) => {
    setTakes((prev) =>
      prev.map((take) => {
        const thumbnailUrl = updates.get(take.id)
        return thumbnailUrl ? { ...take, thumbnailUrl } : take
      })
    )
  }, [])

  const reloadProjectTakes = useCallback(
    async (projectId: string) => {
      const generation = ++reloadTakesGenerationRef.current
      const rows = await getTakesByProject(projectId)
      const libraryRows = await getLibraryItemsByProject(projectId)
      const binding = await getProjectBenchmarkBinding(projectId)
      if (generation !== reloadTakesGenerationRef.current) return

      const loadedFast = uiTakesFromVaultRowsFast(rows)
      const bestId = findBestTakeId(rows)
      const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null

      const hydratedLibrary = await hydrateLibraryItems(
        libraryRows.map((row) => ({
          id: row.id,
          projectId: row.projectId,
          kind: row.kind,
          name: row.name,
          createdAt: row.createdAt,
          filePath: row.filePath,
          mimeType: row.mimeType,
          duration: row.duration,
        }))
      )
      if (generation !== reloadTakesGenerationRef.current) return

      setLibraryItems(hydratedLibrary)
      setBenchmarkBinding(binding)
      setTakes((current) => mergeHydratedTakes(current, loadedFast))
      setBenchmarkId(bestId)
      setChallengerId((current) => {
        if (!showTakeCardsRef.current) return null
        if (current && rows.some((row) => row.id === current)) return current

        const pendingId = pendingChallengerIdRef.current
        if (pendingId && rows.some((row) => row.id === pendingId)) {
          challengerUserDismissedRef.current = false
          return pendingId
        }

        if (challengerUserDismissedRef.current) return null

        return defaultChallengerId
      })

      scheduleIdle(() => {
        if (generation !== reloadTakesGenerationRef.current) return

        void hydrateVaultTakeRowsProgressive(rows, {
          priorityIds: [bestId, defaultChallengerId].filter((id): id is string => Boolean(id)),
          onBatch: (partial) => {
            if (generation !== reloadTakesGenerationRef.current) return
            setTakes((current) => mergeHydratedTakes(current, partial))
          },
        }).then((loaded) => {
          if (generation !== reloadTakesGenerationRef.current) return

          setTakes((current) => mergeHydratedTakes(current, loaded))
          void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnails)
        })
      }, 500)
    },
    [applyTakeThumbnails]
  )

  useEffect(() => {
    if (bootSnapshot.takes.length === 0) return
    void hydrateTakeThumbnailsInBackground(bootSnapshot.takes, applyTakeThumbnails)
  }, [applyTakeThumbnails, bootSnapshot.takes])

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeProjectIdRef.current) return

      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setActiveProjectId(projectId)
      setTakes([])
      setBenchmarkId(null)
      setChallengerId(null)
      challengerUserDismissedRef.current = false
      setLibraryItems([])
      setBenchmarkBinding(null)
      await reloadProjectTakes(projectId)
    },
    [pausePipVideos, releaseAutoRecordSuppress, reloadProjectTakes, stopAutoPlaybackAudio]
  )

  const handleCreateProject = useCallback(async (name: string) => {
    const project = await createProject(name.trim())
    setProjects((prev) => [project, ...prev])
    setActiveProjectId(project.id)
    setTakes([])
    setBenchmarkId(null)
    setChallengerId(null)
    challengerUserDismissedRef.current = false
    return project
  }, [])

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()

      const takeRows =
        projectId === activeProjectIdRef.current
          ? takes.map((take) => ({
              id: take.id,
              filePath: take.filePath,
            }))
          : (await getTakesByProject(projectId)).map((row) => ({
              id: row.id,
              filePath: row.filePath,
            }))
      const libraryFileRows =
        projectId === activeProjectIdRef.current
          ? libraryItems.map((item) => ({ filePath: item.filePath }))
          : (await getLibraryItemsByProject(projectId)).map((row) => ({
              filePath: row.filePath,
            }))

      await deleteProject(projectId)
      setPracticeItemStates((current) =>
        current.filter((state) => state.projectId !== projectId),
      )
      setBestTakeHistory((current) =>
        current.filter((entry) => entry.projectId !== projectId),
      )

      for (const row of takeRows) {
        await deleteCachedTakeThumbnail(row.id)
        if (row.filePath) {
          await deleteTakeFile(row.filePath)
        }
      }
      for (const row of libraryFileRows) {
        if (row.filePath) {
          await deleteLibraryFile(row.filePath)
        }
      }

      const remaining = projects.filter((project) => project.id !== projectId)
      const deletingActive = activeProjectIdRef.current === projectId

      if (remaining.length === 0) {
        const created = await createProject(DEFAULT_PROJECT_NAME)
        setProjects([created])
        setActiveProjectId(created.id)
        setTakes([])
        setBenchmarkId(null)
        setChallengerId(null)
        setLibraryItems([])
        setBenchmarkBinding(null)
        return
      }

      setProjects(remaining)

      if (!deletingActive) return

      const next = remaining[0]
      setActiveProjectId(next.id)
      setTakes([])
      setBenchmarkId(null)
      setChallengerId(null)
      setLibraryItems([])
      setBenchmarkBinding(null)
      await reloadProjectTakes(next.id)
    },
    [
      libraryItems,
      pausePipVideos,
      projects,
      releaseAutoRecordSuppress,
      reloadProjectTakes,
      stopAutoPlaybackAudio,
      takes,
    ]
  )

  const prepareAudioTakePlayback = useCallback(async (takeId: string) => {
    const input = audioTakeReadinessInputRef.current.get(takeId)
    if (!input) return null

    setAudioTakeReadiness((current) => ({
      ...current,
      [takeId]: { status: 'preparing' },
    }))
    console.info('[TakeReadiness] playback-source-creation-started', {
      takeId,
      filePath: input.filePath,
      atMs: performance.now(),
    })

    try {
      const readiness = await prepareTakePlaybackReadiness(input)
      setTakes((current) =>
        current.map((take) =>
          take.id === takeId ? { ...take, videoUrl: readiness.playbackUrl } : take
        )
      )
      console.info('[TakeReadiness] playback-source-created', {
        takeId,
        playbackUrl: readiness.playbackUrl,
      })
      console.info('[TakeReadiness] media-ready', {
        takeId,
        durationSeconds: readiness.durationSeconds,
        event: 'loadedmetadata + canplay',
      })
      setAudioTakeReadiness((current) => ({
        ...current,
        [takeId]: { status: 'ready', durationSeconds: readiness.durationSeconds },
      }))
      console.info('[TakeReadiness] play-enabled', {
        takeId,
        atMs: performance.now(),
      })
      return readiness
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This take could not be prepared.'
      console.error('[TakeReadiness] preparation-failed', {
        takeId,
        message,
        error,
      })
      setAudioTakeReadiness((current) => ({
        ...current,
        [takeId]: { status: 'error', message },
      }))
      return null
    }
  }, [])

  const handleRetryAudioTakePreparation = useCallback(
    (takeId: string) => {
      void prepareAudioTakePlayback(takeId)
    },
    [prepareAudioTakePlayback],
  )

  const handleSaveTake = useCallback(
    (payload: RecordingCompletePayload) => {
      const {
        takeId,
        mimeType,
        filePath,
        videoUrl,
        blob,
        mediaType,
        durationSeconds,
        recordingOrientation,
        captureProfile,
        captureTrackSnapshot,
        autoPerformanceStartSeconds,
        mirrorPlayback,
        timelineOffsetMs,
        recordingBpm,
        performanceStartBeats,
        performanceStartOffsetBeats,
        referenceTrackId,
        referenceStartBeat,
        pitchSeries,
      } = payload

      void logRecordingOutputVerification({
        takeId,
        filePath,
        mimeType,
        durationSeconds,
        videoUrl,
        mediaType,
      })

      const timelineMarkers = consumePendingMarkers()
      if (timelineMarkers.length > 0) {
        saveTakeMarkers(takeId, timelineMarkers)
      }

      const shouldAutoPlay =
        pendingAutoPlaybackRef.current &&
        ((mediaType === 'audio' && recordingModeRef.current === 'audio') ||
          (mediaType === 'video' && recordingModeRef.current === 'video'))
      const playbackGainDb = resolveNativePlaybackGainDb(
        payload.captureDiagnostics?.playbackGainMetadata
      )

      const optimisticUrl =
        resolveTakePlaybackUrlFast(filePath, videoUrl) ??
        (videoUrl ? resolveMediaPlaybackSrc(videoUrl) : '')
      const projectId = activeProjectIdRef.current
      const focusedAtCapture = focusedPracticeRef.current
      const practiceSessionIdAtCapture = focusedPracticeSessionIdRef.current
      const practiceStateAtCapture = focusedAtCapture
        ? practiceItemStatesRef.current.find(
            (state) => state.projectId === focusedAtCapture.projectId,
          ) ?? null
        : null
      const intentionAtCapture =
        focusedAtCapture?.projectId === projectId
          ? practiceStateAtCapture?.pendingIntention.trim() ?? ''
          : ''
      const focusAreaAtCapture =
        focusedAtCapture?.projectId === projectId ? focusedAtCapture.focusArea.trim() : ''

      if (focusedAtCapture?.projectId === projectId) {
        setFocusedPostTakeId(takeId)
        setFocusedPostTakeReviewed(false)
        // The session remembers the room it was played in; resume restores it.
        if (liveDeskSnapshotRef.current) saveFocusDesk(projectId, liveDeskSnapshotRef.current)
      }

      if (mediaType === 'audio') {
        audioTakeReadinessInputRef.current.set(takeId, {
          filePath,
          fallbackUrl: optimisticUrl,
        })
        setAudioTakeReadiness((current) => ({
          ...current,
          [takeId]: { status: 'preparing' },
        }))
        console.info('[TakeReadiness] recording-stop-received', {
          takeId,
          filePath,
          durationSeconds,
          atMs: performance.now(),
        })
      }

      if (showTakeCardsRef.current || shouldAutoPlay) {
        challengerUserDismissedRef.current = false
        pendingChallengerIdRef.current = takeId
        setChallengerId(takeId)
      }

      setTakes((prev) => {
        const index = prev.length + 1
        const savedTake: Take = {
          ...createTake(takeId, index, optimisticUrl, filePath, mimeType, mediaType),
          duration: durationSeconds,
          recordingOrientation: recordingOrientation ?? 'portrait',
          ...(mirrorPlayback !== undefined ? { mirrorPlayback } : null),
          timelineOffsetMs,
          ...(recordingBpm !== undefined ? { recordingBpm } : null),
          ...(performanceStartBeats !== undefined ? { performanceStartBeats } : null),
          ...(performanceStartOffsetBeats !== undefined ? { performanceStartOffsetBeats } : null),
          ...(autoPerformanceStartSeconds !== undefined
            ? { performanceStartSeconds: autoPerformanceStartSeconds }
            : null),
          ...(focusedAtCapture?.projectId === projectId && practiceSessionIdAtCapture
            ? { practiceSessionId: practiceSessionIdAtCapture }
            : null),
          ...(intentionAtCapture ? { intention: intentionAtCapture } : null),
          ...(focusAreaAtCapture ? { focusArea: focusAreaAtCapture } : null),
          ...(referenceTrackId !== undefined ? { referenceTrackId } : null),
          ...(referenceStartBeat !== undefined ? { referenceStartBeat } : null),
          ...(pitchSeries?.length ? { pitchSeries } : null),
          ...(payload.captureDiagnostics?.playbackGainMetadata
            ? {
                playbackGainMetadata: payload.captureDiagnostics.playbackGainMetadata,
              }
            : null),
        }
        return [...prev, savedTake]
      })

      if (multitrackRecordingActiveRef.current) {
        multitrackRecordingActiveRef.current = false
        setMultitrackPendingRecordingTakeId(takeId)
      }

      if (shouldAutoPlay && mediaType === 'audio') {
        // Keep the hands-free turn-around intact, but do not hand a just-written
        // file to the native player before the same readiness validation as the card.
        setHandsFreePlaybackPending(true)
      } else if (shouldAutoPlay && mediaType === 'video') {
        pendingAutoPlaybackRef.current = false
        autoRecordStartSuppressedRef.current = true
        setAutoRecordStartSuppressed(true)
        setHandsFreePlaybackPending(true)
        setAutoPlaybackPlaying(false)
        setAutoPlaybackTakeId(takeId)
      } else if (shouldAutoPlay) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        releaseAutoRecordSuppress(0)
      }

      if (mediaType === 'audio') {
        setTakes((current) =>
          current.map((take) =>
            take.id === takeId ? { ...take, thumbnailUrl: AUDIO_TAKE_THUMBNAIL } : take
          )
        )
      }

      void (async () => {
        const safeVideoUrl = resolveMediaPlaybackSrc(
          optimisticUrl || (await resolveTakePlaybackUrl(filePath, videoUrl))
        )

        if (safeVideoUrl && safeVideoUrl !== optimisticUrl) {
          setTakes((current) =>
            current.map((take) => (take.id === takeId ? { ...take, videoUrl: safeVideoUrl } : take))
          )
        }

        let resolvedFilePath = filePath
        let playbackUrl = safeVideoUrl || optimisticUrl
        let normalizedBlob = blob

        if (mediaType === 'video' && recordingOrientation === 'landscape') {
          if (blob) {
            normalizedBlob = await normalizeLandscapeRecordingBlob(
              blob,
              mimeType,
              recordingOrientation
            )
            if (normalizedBlob !== blob) {
              if (playbackUrl.startsWith('blob:')) {
                URL.revokeObjectURL(playbackUrl)
              }
              playbackUrl = URL.createObjectURL(normalizedBlob)
            }
          } else if (filePath) {
            const normalized = await normalizeLandscapeTakeInPlace({
              id: takeId,
              filePath,
              videoUrl: playbackUrl,
              videoMimeType: mimeType,
              recordingOrientation,
            })
            if (normalized) {
              resolvedFilePath = normalized.filePath
              playbackUrl = await resolveTakePlaybackUrl(normalized.filePath, normalized.videoUrl)
            }
          }

          if (playbackUrl !== optimisticUrl || resolvedFilePath !== filePath) {
            setTakes((current) =>
              current.map((take) =>
                take.id === takeId
                  ? {
                      ...take,
                      videoUrl: playbackUrl,
                      filePath: resolvedFilePath,
                    }
                  : take
              )
            )
          }
        }

        if (projectId && resolvedFilePath) {
          const existing = await getTakesByProject(projectId)
          const takeIndex = existing.length + 1
          await saveTake({
            projectId,
            filePath: resolvedFilePath,
            duration: durationSeconds,
            takeId,
            mimeType,
            mediaType,
            recordingOrientation,
            timelineOffsetMs,
            practiceSessionId:
              focusedAtCapture?.projectId === projectId
                ? practiceSessionIdAtCapture ?? undefined
                : undefined,
            intention: intentionAtCapture,
            focusArea: focusAreaAtCapture,
            pitchSeries,
            performanceStartSeconds: autoPerformanceStartSeconds,
            // In a Focus session the take carries the focus: "mm. 12–20 · 4", not "Audio 4".
            name: focusAreaAtCapture
              ? `${focusAreaAtCapture} · ${takeIndex}`
              : mediaType === 'audio'
                ? `Audio ${takeIndex}`
                : `Take ${takeIndex}`,
          })

          if (intentionAtCapture) {
            const latestState = practiceItemStatesRef.current.find(
              (state) => state.projectId === projectId,
            )
            if (latestState?.pendingIntention.trim() === intentionAtCapture) {
              setPracticeItemStates((current) =>
                current.map((state) =>
                  state.projectId === projectId ? { ...state, pendingIntention: '' } : state,
                ),
              )
              void updatePracticeItemState(projectId, { pendingIntention: '' }).catch((error) => {
                console.warn('[FocusedPractice] note clear failed', error)
              })
            }
          }

          if (focusedAtCapture?.projectId === projectId && !pitchSeries?.length) {
            void analyzeTakeForFocusedPractice(resolvedFilePath)
              .then(async (analysis) => {
                if (!analysis) return
                await updateVaultTake(takeId, {
                  timelineOffsetMs: analysis.timelineOffsetMs,
                  pitchSeries: analysis.pitchSeries,
                  ...(analysis.performanceStartSeconds !== undefined
                    ? { performanceStartSeconds: analysis.performanceStartSeconds }
                    : null),
                })
                setTakes((current) =>
                  current.map((take) =>
                    take.id === takeId
                      ? {
                          ...take,
                          timelineOffsetMs: analysis.timelineOffsetMs,
                          pitchSeries: analysis.pitchSeries,
                          ...(analysis.performanceStartSeconds !== undefined
                            ? { performanceStartSeconds: analysis.performanceStartSeconds }
                            : null),
                        }
                      : take,
                  ),
                )
              })
              .catch((error) => {
                console.warn('[FocusedPractice] take analysis persistence failed', error)
              })
          }
        }

        if (mediaType === 'audio') {
          const fileExists = !resolvedFilePath || (await nativeDataFileExists(resolvedFilePath))
          console.info('[TakeReadiness] file-finalization-complete', {
            takeId,
            filePath: resolvedFilePath,
            fileExists,
            atMs: performance.now(),
          })
          audioTakeReadinessInputRef.current.set(takeId, {
            filePath: resolvedFilePath,
            fallbackUrl: playbackUrl,
          })

          let readiness = await prepareAudioTakePlayback(takeId)
          if (shouldAutoPlay) {
            // A cold start can fail this preflight once for reasons that clear
            // on their own a moment later — the just-written file not yet
            // visible to the filesystem bridge, the playback URL not resolvable
            // yet, or the metadata probe timing out on a WebView media stack
            // that has not warmed up. Hands-free used to take that single
            // failure as final and skip the replay entirely, which is why the
            // first take after opening the app played back silently and every
            // take after it was fine.
            for (let attempt = 0; !readiness && attempt < 3; attempt++) {
              await waitMs(220 * (attempt + 1))
              if (recordingModeRef.current !== 'audio') break
              console.info('[TakeReadiness] hands-free retry', { takeId, attempt: attempt + 1 })
              readiness = await prepareAudioTakePlayback(takeId)
            }

            if (readiness) {
              pendingAutoPlaybackRef.current = false
              playAutoTakeAudioRef.current(
                readiness.playbackUrl,
                takeId,
                autoPerformanceStartSeconds,
                resolvedFilePath,
                playbackGainDb
              )
            } else {
              console.warn('[TakeReadiness] hands-free playback skipped — take never became ready', {
                takeId,
              })
              pendingAutoPlaybackRef.current = false
              setHandsFreePlaybackPending(false)
              releaseAutoRecordSuppress(0)
            }
          }
        }

        // Bake the Audio Enhancer into the saved file (native offline render).
        // Non-blocking: playback of the take uses the live WebAudio enhancer
        // until enhancerBaked flips, so audio is never double-enhanced and
        // never un-enhanced. On any native failure the original file survives.
        if (audioEnhancerEnabledRef.current && isNativeCameraPlatform && resolvedFilePath) {
          void (async () => {
            try {
              // The bake swaps the file on disk (replaceItemAt). Hands-free
              // replays the take straight away — in camera mode the <video>
              // streams that very file through range requests, and having it
              // replaced mid-stream froze the decoder and aborted playback
              // back to record. Wait for the replay to finish first; the take
              // plays with the live enhancer in the meantime.
              const bakeHoldStartedAt = performance.now()
              while (
                (handsFreePlaybackBusyRef.current || pendingAutoPlaybackRef.current) &&
                performance.now() - bakeHoldStartedAt < 120_000
              ) {
                await waitMs(250)
              }
              const fileUri = await resolveNativeFileUri(resolvedFilePath)
              if (!fileUri) return
              await BestTakeAudioPlugin.enhanceTakeAudio({
                url: fileUri,
                mediaType: mediaType === 'audio' ? 'audio' : 'video',
                params: buildNativeEnhancerParams(audioEnhancerSettingsRef.current),
              })
              await setTakeEnhancerBaked(takeId, true)
              setTakes((current) =>
                current.map((take) =>
                  take.id === takeId ? { ...take, enhancerBaked: true } : take
                )
              )
              console.info('[AudioEnhancer] baked into take', takeId)
            } catch (error) {
              console.warn(
                '[AudioEnhancer] bake failed; take keeps live playback enhancement',
                error
              )
            }
          })()
        }

        let audioAnalysisSource: Blob | string | null = normalizedBlob ?? blob ?? null
        if (!audioAnalysisSource && resolvedFilePath) {
          const nativeUri = await resolveNativeFileUri(resolvedFilePath)
          if (nativeUri) audioAnalysisSource = nativeUri
        } else if (!audioAnalysisSource && playbackUrl) {
          audioAnalysisSource = playbackUrl
        }

        const captureDiagnostics =
          payload.captureDiagnostics ??
          (await buildRecordingCaptureDiagnostics(
            captureProfile ?? 'natural',
            captureTrackSnapshot ?? null,
            audioAnalysisSource
          ))
        logRecordingCaptureDiagnostics(takeId, captureDiagnostics)

        if (captureDiagnostics.playbackGainMetadata) {
          setTakes((current) =>
            current.map((take) =>
              take.id === takeId
                ? {
                    ...take,
                    playbackGainMetadata: captureDiagnostics.playbackGainMetadata ?? undefined,
                  }
                : take
            )
          )
        }

        pendingChallengerIdRef.current = null

        if (mediaType !== 'video') return

        const thumbnailTake: Take = {
          ...createTake(takeId, 1, playbackUrl, resolvedFilePath, mimeType, mediaType),
          recordingOrientation: recordingOrientation ?? 'portrait',
          ...(mirrorPlayback !== undefined ? { mirrorPlayback } : null),
        }

        const thumbnailPromise = normalizedBlob
          ? generateThumbnailFromBlob(
              normalizedBlob,
              thumbnailTake.mirrorPlayback === true,
              thumbnailTake.recordingOrientation
            ).then((dataUrl) =>
              persistTakeThumbnail(
                takeId,
                dataUrl,
                thumbnailTake.recordingOrientation ?? 'portrait'
              )
            )
          : captureAndPersistTakeThumbnail(thumbnailTake)

        void thumbnailPromise
          .then((thumbnailUrl) => {
            if (!thumbnailUrl) return
            setTakes((current) =>
              current.map((take) => (take.id === takeId ? { ...take, thumbnailUrl } : take))
            )
          })
          .catch(() => {
            /* vault falls back to placeholder until thumbnail is ready */
          })
      })().catch((error) => {
        console.error('[Recording] take finalization failed', {
          takeId,
          error,
        })
        if (mediaType !== 'audio') return
        const message = error instanceof Error ? error.message : 'This take could not be prepared.'
        setAudioTakeReadiness((current) => ({
          ...current,
          [takeId]: { status: 'error', message },
        }))
        if (shouldAutoPlay) {
          pendingAutoPlaybackRef.current = false
          setHandsFreePlaybackPending(false)
          releaseAutoRecordSuppress(0)
        }
      })
    },
    [prepareAudioTakePlayback, releaseAutoRecordSuppress]
  )

  useEffect(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
    prepareNewYoutubeReference({ autoplay: false })
    setYoutubeAutoPlayOnLoad(false)
    setYoutubeUrl(activeProjectId ? getSelectedReferenceUrl(activeProjectId) : null)
    setFocusPanel(null)
    setFocusedPractice(current => current?.projectId === activeProjectId ? current : null)
  }, [activeProjectId])

  youtubeUrlRef.current = youtubeUrl

  useEffect(() => subscribeYoutubePlayAlongUi(setYoutubePlayAlongUi), [])

  useEffect(() => {
    setYoutubeReferenceActive(Boolean(youtubeUrl))
    setYoutubeReferenceEnabled(Boolean(youtubeUrl))
    if (!youtubeUrl) {
      resetYoutubePlayAlongRouteFailure()
    }
  }, [youtubeUrl])

  const handleYoutubeHostChange = useCallback((el: HTMLDivElement | null) => {
    setYoutubeHostEl((current) => (current === el ? current : el))
  }, [])

  const pauseYoutubeReference = useCallback(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
  }, [])

  const resumeYoutubeReference = useCallback(() => {
    if (!youtubeUrlRef.current || focusedPracticeRef.current || !youtubeAutoPlayOnLoad) return
    startYoutubeProxyPlayback(youtubeIframeRef.current, 1)
  }, [youtubeAutoPlayOnLoad])

  const [cameraResumeNonce, setCameraResumeNonce] = useState(0)

  const handleBeforeForegroundRestart = useCallback(() => {
    pauseYoutubeReference()
    if (!(Capacitor.isNativePlatform() && recordingModeRef.current === 'video')) {
      setCameraResumeNonce((nonce) => nonce + 1)
    }
  }, [pauseYoutubeReference])

  const {
    previewRef,
    streamRef,
    streamGeneration,
    needsPermission: cameraNeedsPermission,
    permissionBlocked: cameraPermissionBlocked,
    permissionRequestInFlight: cameraPermissionRequestInFlight,
    requestCameraAccess,
    ready,
    simulatorCaptureAvailable,
    isRecording,
    isStopping,
    elapsed,
    recordingMode,
    changeRecordingMode,
    toggleRecording,
    startRecording,
    startAutoRecording,
    stopRecording,
    warmAutoRecording,
    disarmAutoRecording,
    tryMarkAutoPerformanceStart,
    isAutoPreRollCaptureActive,
    getAutoPreRollAgeMs,
    restartAutoPreRollCapture,
    refreshCameraSession,
    requestCameraPreviewResume,
    reacquireStreamForAudioRoute,
    releaseLiveStream,
    suspendCameraForBackground,
    suspendMicForPlayback,
    suspendAudioCaptureForPlayback,
    resumeMicAfterPlayback,
    isPreviewRecovering,
    nativeLivePreviewActive,
    nativeLivePreviewSeedUrl,
    acquireNativeVideoBridge,
    setSuppressNativeBridgeRecovery,
    isNativeAudioCaptureActive,
    registerHandsFreeMonitorRestart,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
    secondaryPreviewRef: splitPreviewRef,
    onBeforeForegroundRestart: handleBeforeForegroundRestart,
    onAfterForegroundRestart: resumeYoutubeReference,
    nativeCameraRecordingEnabled: isNativeCameraPlatform,
    micInputPreference: settings.micInputPreference,
  })
  refreshCameraSessionRef.current = refreshCameraSession
  suspendCameraForBackgroundRef.current = suspendCameraForBackground

  const liveStreamGenerationRef = useRef(streamGeneration)
  const tunerMicBackgroundGenerationRef = useRef<number | null>(null)
  liveStreamGenerationRef.current = streamGeneration

  const previousLabsRouteRef = useRef<LabsRoute | null>(labsRoute)
  useEffect(() => {
    const previous = previousLabsRouteRef.current
    previousLabsRouteRef.current = labsRoute
    const previousUsedLiveMic =
      previous === 'staff-jumper' || previous === 'balance' || previous === 'learn-instrument'
    if (previousUsedLiveMic && labsRoute !== previous) {
      releaseLiveStream()
    }
  }, [labsRoute, releaseLiveStream])

  useEffect(() => {
    const markTunerMicForForegroundRecovery = () => {
      tunerMicBackgroundGenerationRef.current = liveStreamGenerationRef.current
    }

    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, markTunerMicForForegroundRecovery)
    return () => {
      window.removeEventListener(APP_BACKGROUND_SUSPEND_EVENT, markTunerMicForForegroundRecovery)
    }
  }, [])

  const audioModePlaybackSuspendedCaptureRef = useRef(false)

  const handleAudioModeBeforePlaybackStart = useCallback(async () => {
    if (isRecording) {
      stopRecording()
      await waitMs(AUDIO_PLAYBACK_RECORDING_STOP_SETTLE_MS)
    }
    if (!Capacitor.isNativePlatform()) return
    // Native AVPlayer cannot share output with a live WebRTC mic session — release
    // capture before playback, then refresh after (speaker and headphones).
    console.info('[AudioModePlayback] releasing WebRTC capture before native AVPlayer playback')
    await suspendAudioCaptureForPlayback()
    audioModePlaybackSuspendedCaptureRef.current = true
  }, [isRecording, stopRecording, suspendAudioCaptureForPlayback])

  const handleAudioModePlaybackActiveChange = useCallback(
    (active: boolean) => {
      setAudioModeTakePlaying(active)
      if (active || !audioModePlaybackSuspendedCaptureRef.current) return
      audioModePlaybackSuspendedCaptureRef.current = false
      stabilizeViewportAfterMediaInteraction()
      window.requestAnimationFrame(() => {
        void refreshCameraSession()
      })
    },
    [refreshCameraSession]
  )

  useEffect(() => {
    registerYoutubeStereoGuard(
      () =>
        !maintainDuringRecording &&
        !autoPlaybackPlaying &&
        !audioModeTakePlaying &&
        !handsFreePlaybackPending
    )
  }, [audioModeTakePlaying, autoPlaybackPlaying, handsFreePlaybackPending])

  // Re-open WebKit capture so iOS applies the queued mic preference before getUserMedia.
  useEffect(() => {
    if (lastMicPreferenceRouteRef.current === settings.micInputPreference) return
    if (!ready) {
      lastMicPreferenceRouteRef.current = settings.micInputPreference
      return
    }
    if (isPlaybackRouteHoldActive()) return
    if (isRecording) return
    if (nativeLivePreviewActive && recordingMode === 'video') {
      lastMicPreferenceRouteRef.current = settings.micInputPreference
      return
    }
    if (nativeLivePreviewActive && recordingMode === 'audio') {
      lastMicPreferenceRouteRef.current = settings.micInputPreference
      return
    }
    lastMicPreferenceRouteRef.current = settings.micInputPreference
    void reacquireStreamForAudioRoute()
  }, [
    isRecording,
    nativeLivePreviewActive,
    recordingMode,
    reacquireStreamForAudioRoute,
    ready,
    settings.micInputPreference,
  ])

  useEffect(() => {
    if (isPlaybackRouteHoldActive()) return
    const youtubePlayAlongActive =
      isRecording && !shouldPauseYoutubeForRecording && Boolean(youtubeUrl)
    void syncNativeCameraSessionState({
      previewActive:
        (recordingMode === 'video' && (ready || nativeLivePreviewActive)) ||
        (recordingMode === 'audio' && nativeLivePreviewActive),
      recordingActive: isRecording,
      recordingMode,
      youtubePlayAlongActive,
    })
  }, [
    isRecording,
    nativeLivePreviewActive,
    ready,
    recordingMode,
    shouldPauseYoutubeForRecording,
    youtubeUrl,
  ])

  // Native live preview uses canvas frame bridge — WebView stays opaque (no passthrough).

  useEffect(() => {
    let firstTimer: number | null = null
    let secondTimer: number | null = null

    const clearTimers = () => {
      if (firstTimer !== null) {
        window.clearTimeout(firstTimer)
        firstTimer = null
      }
      if (secondTimer !== null) {
        window.clearTimeout(secondTimer)
        secondTimer = null
      }
    }

    const recoverAppAfterForeground = (event: Event) => {
      if (!isAppInForeground()) return
      clearTimers()

      const reason =
        event instanceof CustomEvent && typeof event.detail?.reason === 'string'
          ? event.detail.reason
          : 'foreground'

      void clearPlaybackRouteForLifecycle(`foreground:${reason}`)
      void resumePlaybackAudioContext()
      requestCameraPreviewLayoutRecovery(`foreground:${reason}`)

      firstTimer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 140)

      // Do NOT re-sync ownership state here with a manually-built payload:
      // this callback fires 720ms after being scheduled and closes over
      // `ready`/`recordingMode`/`isRecording` from whenever this effect
      // instance was created, not their live values. A stale `ready`
      // snapshot previously reported previewActive:false to native while
      // the camera bridge was genuinely live, which native read as "fully
      // idle" and used to deactivate the AVAudioSession moments after
      // `applicationDidBecomeActive` had just reactivated it. The dedicated
      // effect above (driven by `ready`/`nativeLivePreviewActive`/
      // `isRecording`/`recordingMode` as React deps) is the single source of
      // truth for native ownership sync and always runs with current values.
      secondTimer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 720)
    }

    window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, recoverAppAfterForeground)

    return () => {
      clearTimers()
      window.removeEventListener(APP_FOREGROUND_RECOVERY_EVENT, recoverAppAfterForeground)
    }
  }, [isRecording, ready, recordingMode, refreshCameraSession])

  useEffect(() => {
    if (recordingMode !== 'video') return
    const delayMs = youtubeUrl ? 200 : 0
    let timer: number | null = null
    const frameId = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        void refreshCameraSession()
      }, delayMs)
    })
    return () => {
      window.cancelAnimationFrame(frameId)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [isSplitView, refreshCameraSession, youtubeUrl])

  recordingModeRef.current = recordingMode
  cameraReadyRef.current = ready

  const autoPlaybackPlayingRef = useRef(autoPlaybackPlaying)
  autoPlaybackPlayingRef.current = autoPlaybackPlaying
  const previousAudioPracticeTabRef = useRef(audioPracticeTab)

  useEffect(() => {
    const previousTab = previousAudioPracticeTabRef.current
    previousAudioPracticeTabRef.current = audioPracticeTab
    if (previousTab === audioPracticeTab) return
    if (
      !pendingAutoPlaybackRef.current &&
      !autoPlaybackPlayingRef.current &&
      autoPlaybackTakeId === null
    ) {
      return
    }

    // A tab change can transfer the native mic/session while AVPlayer is
    // still starting. Cancel the replay as one transaction so the listening
    // state cannot remain stuck behind a lost start callback.
    finishAutoPlayback()
  }, [audioPracticeTab, autoPlaybackTakeId, finishAutoPlayback])

  useEffect(() => {
    registerTakePlaybackMicHandlers({
      suspendMic: suspendMicForPlayback,
      resumeMic: resumeMicAfterPlayback,
    })
    registerPlaybackCameraHandlers({
      suspend: () => {
        suspendCameraForBackground()
      },
      resume: () => {
        void refreshCameraSession()
      },
      hasLivePreview: () => cameraReadyRef.current && recordingModeRef.current === 'video',
    })
    installPlaybackRouteEndedListener(() => {
      void refreshCameraSession()
    })
    registerAutoPlaybackHold(
      () =>
        pendingAutoPlaybackRef.current || autoPlaybackPlayingRef.current || handsFreePlaybackPending
    )
    registerRecordingRouteRestoredHandler(() => {
      if (isPlaybackRouteHoldActive()) return
      stabilizeViewportAfterMediaInteraction()
      window.requestAnimationFrame(() => {
        void refreshCameraSession()
      })
    })
  }, [
    handsFreePlaybackPending,
    refreshCameraSession,
    resumeMicAfterPlayback,
    suspendCameraForBackground,
    suspendMicForPlayback,
  ])

  useEffect(() => {
    if (recordingMode === 'audio') return

    pendingAutoPlaybackRef.current = false
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
  }, [recordingMode, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('app-audio-mode', recordingMode === 'audio')
    return () => {
      document.documentElement.classList.remove('app-audio-mode')
    }
  }, [recordingMode])

  useEffect(() => {
    document.documentElement.classList.toggle('app-dark-mode', settings.darkMode)
    document.documentElement.style.colorScheme = settings.darkMode ? 'dark' : 'light'
    return () => {
      document.documentElement.classList.remove('app-dark-mode')
      document.documentElement.style.removeProperty('color-scheme')
    }
  }, [settings.darkMode])

  useEffect(() => {
    const audio = autoPlaybackAudioRef.current
    if (!audio) return

    const syncPlaying = () => {
      setAutoPlaybackPlaying(!audio.paused && !audio.ended)
    }

    audio.addEventListener('play', syncPlaying)
    audio.addEventListener('pause', syncPlaying)
    audio.addEventListener('ended', syncPlaying)

    return () => {
      audio.removeEventListener('play', syncPlaying)
      audio.removeEventListener('pause', syncPlaying)
      audio.removeEventListener('ended', syncPlaying)
    }
  }, [])

  // Native hands-free pre-roll intentionally stops the WebKit microphone. That
  // makes `ready` briefly false even though the native recorder is actively
  // listening; do not let the outer gate tear down that live pre-roll.
  const nativeHandsFreeCaptureActive = isNativeAudioCaptureActive()
  const autoMonitoringAllowed =
    !isVaultOpen &&
    !isSettingsOpen &&
    !isPracticeHubOpen &&
    focusPanel === null &&
    !isReviewOpen &&
    !isExperimentalOpen &&
    (ready || nativeHandsFreeCaptureActive)

  const { handsFreeRecording, handsFreeListeningReady, restartHandsFreeMonitor } =
    useAutoSoundRecording({
      enabled: settings.autoSoundRecording,
      monitoringAllowed: autoMonitoringAllowed,
      suppressStart: autoRecordStartSuppressed,
      isNativeAudioCaptureActive,
      monitoringPaused:
        handsFreePlaybackPending ||
        autoPlaybackPlaying ||
        audioModeTakePlaying ||
        benchmarkPipPlaying ||
        challengerPipPlaying ||
        isPreviewRecovering,
      ready,
      isRecording,
      streamRef,
      streamGeneration,
      silenceMs: settings.soundSilenceSeconds * 1000,
      volumeThreshold: settings.soundVolumeThreshold,
      startRecording: startAutoRecording,
      stopRecording,
      warmRecorder: () => {
        void warmAutoRecording()
      },
      disarmRecorder: () => {
        void disarmAutoRecording()
      },
      tryMarkAutoPerformance: tryMarkAutoPerformanceStart,
      isAutoPreRollCaptureActive,
      getAutoPreRollAgeMs,
      restartAutoPreRollCapture,
      onAutoRecordingFinished: () => {
        pendingAutoPlaybackRef.current = true
        autoRecordStartSuppressedRef.current = true
        setHandsFreePlaybackPending(true)
        setAutoRecordStartSuppressed(true)
      },
      onMonitorStalled: () => {
        if (!isAppInForeground()) return
        void refreshCameraSession()
      },
    })
  const restartHandsFreeMonitorRef = useRef(restartHandsFreeMonitor)
  restartHandsFreeMonitorRef.current = restartHandsFreeMonitor

  useEffect(() => {
    registerHandsFreeMonitorRestart(() => {
      restartHandsFreeMonitorRef.current()
    })
  }, [registerHandsFreeMonitorRestart])

  const autoSoundRecordingEnabledRef = useRef(settings.autoSoundRecording)
  autoSoundRecordingEnabledRef.current = settings.autoSoundRecording

  useEffect(() => {
    if (!isRecording) return
    teardownActiveAutoPlayback()
  }, [isRecording, teardownActiveAutoPlayback])

  useEffect(() => {
    const stream = streamRef.current
    if (!isRecording) {
      if (shouldPauseYoutubeForRecording && stream) {
        void tuneMusicRecordingStream(stream)
      }
      return
    }

    if (!shouldPauseYoutubeForRecording) return

    pauseYoutubeReference()

    if (stream && !focusedPracticeRef.current) {
      void tunePlaybackIsolationStream(stream)
    }
  }, [isRecording, pauseYoutubeReference, shouldPauseYoutubeForRecording, streamGeneration])

  useEffect(() => {
    const playAlongRecording =
      isRecording && !shouldPauseYoutubeForRecording && Boolean(youtubeUrlRef.current)

    if (playAlongRecording) {
      setYoutubeRecordingMaintain(true)
      resetYoutubePlayAlongRouteFailure()
      scheduleYoutubeRecordingMaintain(youtubeIframeRef.current, 1, {
        recordingActive: true,
      })
      startYoutubePlayAlongDiagnostics({
        recordingActive: true,
        getIframe: () => youtubeIframeRef.current,
        getRecordingElapsedMs: () => elapsed,
        getVideoId: () => parseYoutubeVideoId(youtubeUrlRef.current ?? ''),
        onStallResumeAttempt: () => {
          resumeYoutubePlayAlong(youtubeIframeRef.current)
        },
        postCommand: (func, args) => {
          const iframe = youtubeIframeRef.current
          if (!iframe?.contentWindow) return
          iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func, args: args ?? [] }),
            YOUTUBE_PROXY_ORIGIN
          )
        },
      })
    } else {
      setYoutubeRecordingMaintain(false)
      cancelYoutubeRecordingMaintain()
      stopYoutubePlayAlongDiagnostics()
    }

    return () => {
      setYoutubeRecordingMaintain(false)
      cancelYoutubeRecordingMaintain()
      stopYoutubePlayAlongDiagnostics()
    }
  }, [elapsed, isRecording, shouldPauseYoutubeForRecording, youtubeUrl])

  useEffect(() => {
    if (!isRecording || shouldPauseYoutubeForRecording || !youtubeUrl || !youtubeHostEl)
      return
    scheduleYoutubeRecordingMaintain(youtubeIframeRef.current, 1, {
      recordingActive: true,
    })
  }, [isRecording, shouldPauseYoutubeForRecording, youtubeHostEl, youtubeUrl])

  useEffect(() => {
    return () => {
      stopAutoPlaybackAudio()
      if (autoPlaybackReleaseTimerRef.current !== null) {
        window.clearTimeout(autoPlaybackReleaseTimerRef.current)
      }
    }
  }, [stopAutoPlaybackAudio])

  useEffect(() => {
    if (!autoRecordStartSuppressed) return

    const failsafe = window.setTimeout(() => {
      autoRecordStartSuppressedRef.current = false
      setAutoRecordStartSuppressed(false)
    }, 120000)

    return () => {
      window.clearTimeout(failsafe)
    }
  }, [autoRecordStartSuppressed])

  useEffect(() => {
    const recoverAfterForeground = () => {
      if (document.visibilityState !== 'visible') return

      void resumePlaybackAudioContext()
      if (!(Capacitor.isNativePlatform() && recordingModeRef.current === 'video')) {
        setCameraResumeNonce((nonce) => nonce + 1)
      }

      window.setTimeout(() => {
        // Camera foreground restart is handled inside useCameraSession lifecycle.
        // Only refresh here for audio mode or web, and to restart hands-free monitoring.
        const refresh =
          recordingModeRef.current === 'video' && Capacitor.isNativePlatform()
            ? Promise.resolve()
            : Promise.resolve(refreshCameraSessionRef.current())
        void refresh.finally(() => {
          if (autoSoundRecordingEnabledRef.current) {
            // Force past the "native capture already active" guard: coming back
            // from another app is exactly the case where that flag is stale.
            restartHandsFreeMonitorRef.current({ force: true })
          }
        })
      }, 400)
    }

    if (Capacitor.isNativePlatform()) {
      let removeListener: (() => void) | undefined
      void import('@capacitor/app').then(({ App }) => {
        void App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) recoverAfterForeground()
        }).then((sub) => {
          removeListener = () => {
            void sub.remove()
          }
        })
      })

      return () => {
        removeListener?.()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverAfterForeground()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const recoverCameraAfterSurfaceDismiss = useCallback(
    (reason: string) => {
      stabilizeViewportAfterMediaInteraction()
      scheduleAfterPaint(() => {
        if (recordingModeRef.current === 'video') {
          void requestCameraPreviewResume(reason)
          window.setTimeout(() => {
            void requestCameraPreviewResume(`${reason}-retry`)
          }, 650)
          return
        }

        void refreshCameraSession()
      })
    },
    [refreshCameraSession, requestCameraPreviewResume]
  )

  const wasVaultOpenRef = useRef(false)
  const vaultEnterLoadDoneRef = useRef(false)
  const vaultHydrateInFlightRef = useRef(false)
  /** Blocks ghost-tap reopen after sheet close (tuner tab has high-frequency pitch updates). */
  const overlayOpenSuppressUntilRef = useRef(0)
  const settingsOpenInFlightRef = useRef(false)

  const canOpenOverlaySheet = useCallback(() => {
    return performance.now() >= overlayOpenSuppressUntilRef.current
  }, [])

  const markOverlayClosed = useCallback(() => {
    overlayOpenSuppressUntilRef.current = performance.now() + 450
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    console.log(`[OverlayState] vaultOpen=${isVaultOpen} settingsOpen=${isSettingsOpen}`)
  }, [isVaultOpen, isSettingsOpen])

  useEffect(() => {
    if (!isVaultOpen) {
      vaultEnterLoadDoneRef.current = false
      vaultHydrateInFlightRef.current = false
    }
  }, [isVaultOpen])

  const loadVaultTakesFromFilesystem = useCallback(
    async (projectId: string) => {
      if (vaultHydrateInFlightRef.current) return
      vaultHydrateInFlightRef.current = true

      try {
        const rows = await getTakesByProject(projectId)
        const bestId = findBestTakeId(rows)
        const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null
        const loaded = await hydrateVaultTakeRowsProgressive(rows, {
          priorityIds: [bestId, defaultChallengerId].filter((id): id is string => Boolean(id)),
        })
        setTakes((current) => mergeHydratedTakes(current, loaded))
        setBenchmarkId(bestId)
        void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnails)
      } finally {
        vaultHydrateInFlightRef.current = false
      }
    },
    [applyTakeThumbnails]
  )

  useEffect(() => {
    if (wasVaultOpenRef.current && !isVaultOpen) {
      const timer = window.setTimeout(() => {
        recoverCameraAfterSurfaceDismiss('vault-close')
      }, 350)
      wasVaultOpenRef.current = isVaultOpen
      return () => window.clearTimeout(timer)
    }
    wasVaultOpenRef.current = isVaultOpen
  }, [isVaultOpen, recoverCameraAfterSurfaceDismiss])

  const wasSettingsOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasSettingsOpenRef.current
    wasSettingsOpenRef.current = isSettingsOpen
    const timers: number[] = []

    if (!wasOpen && isSettingsOpen) {
      timers.push(
        window.setTimeout(() => {
          sharedMetronomeEngine.reconcileAfterSurfaceTransition(recordingModeRef.current)
        }, 180)
      )
    } else if (wasOpen && !isSettingsOpen) {
      timers.push(
        window.setTimeout(() => {
          sharedMetronomeEngine.reconcileAfterSurfaceTransition(recordingModeRef.current)
        }, 280)
      )
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [isSettingsOpen])

  const wasReviewOpenRef = useRef(false)
  useEffect(() => {
    if (wasReviewOpenRef.current && !isReviewOpen) {
      void finalizeTakePlaybackCleanup()
      recoverCameraAfterSurfaceDismiss('review-close')
      wasReviewOpenRef.current = isReviewOpen
      return
    }
    wasReviewOpenRef.current = isReviewOpen
  }, [isReviewOpen, recoverCameraAfterSurfaceDismiss])

  const deferHudMediaPause = useCallback(() => {
    scheduleAfterPaint(() => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      audioModePlaybackControlsRef.pause?.()
    })
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const handleCloseVault = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[OverlayClose] vault close pressed')
    }
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsVaultOpen(false)
    if (import.meta.env.DEV) {
      console.log('[OverlayState] vaultOpen=false')
    }
  }, [markOverlayClosed, settings.hapticFeedback])

  const handleVaultEnterComplete = useCallback(() => {
    if (vaultEnterLoadDoneRef.current) return
    vaultEnterLoadDoneRef.current = true

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    void loadVaultTakesFromFilesystem(projectId)
  }, [loadVaultTakesFromFilesystem])

  const handleOpenSettings = useCallback(() => {
    if (!canOpenOverlaySheet() || isExperimentalOpen || settingsOpenInFlightRef.current) return
    const openSettings = () => {
      settingsOpenInFlightRef.current = false
      if (!canOpenOverlaySheet() || isExperimentalOpen) return
      setShowPitch(false)
      setIsVaultOpen(false)
      setIsSettingsOpen(true)
      deferHudMediaPause()
    }

    if (recordingModeRef.current === 'video' && isAutoPreRollCaptureActive()) {
      settingsOpenInFlightRef.current = true
      void disarmAutoRecording().finally(openSettings)
      return
    }

    openSettings()
  }, [
    canOpenOverlaySheet,
    deferHudMediaPause,
    disarmAutoRecording,
    isAutoPreRollCaptureActive,
    isExperimentalOpen,
  ])

  const handleRecordingModeChange = useCallback(
    (mode: RecordingMode) => {
      const modeChanged = mode !== recordingModeRef.current
      if (modeChanged) {
        if (isRecording) return
        // Tokens for Tools (`--audio-bg-base`) live on `html.app-audio-mode`.
        // Apply them before React paints the new overlay so the first frame is
        // already cream, not a black hole that then lerps.
        document.documentElement.classList.toggle('app-audio-mode', mode === 'audio')
        // Same sitting, different surface: the tool tab, the pitch overlay and
        // Take Cards are left exactly as the player had them.
        //
        // Deliberately no full-screen veil over the swap. A veil that fades in
        // after the surfaces have already changed is just a flash on top of a
        // finished transition — it read as a blink in both directions. The
        // grounds either side are opaque, so the swap carries itself.
        // Refresh the cached visual viewport before the audio layout mounts.
        // Otherwise iOS can paint one frame with the camera surface's stale
        // height and clip the bottom deck before its later recovery pass.
        stabilizeViewportAfterMediaInteraction()
        if (import.meta.env.DEV) {
          console.log(
            mode === 'video' ? '[ModeSwitch] entering camera' : '[ModeSwitch] entering audio'
          )
        }
      }
      changeRecordingMode(mode)
      if (modeChanged) {
        void forceNativeRecordingMode(mode)
        // The camera/audio session changes after the carousel state flips.
        // Recheck once that handoff settles so an active metronome survives it.
        const reconcileMetronomeAfterModeSwitch = () => {
          sharedMetronomeEngine.reconcileAfterModeSwitch(mode)
        }
        window.setTimeout(reconcileMetronomeAfterModeSwitch, 420)
        window.setTimeout(reconcileMetronomeAfterModeSwitch, 900)
        window.setTimeout(reconcileMetronomeAfterModeSwitch, 1500)
      }
      if (mode === 'audio') {
        // Acquiring the mic stalls the main thread, and running it on the same
        // tick as the surface rebuild is what made the crossing stutter. The
        // camera direction already waits for the paint; this now matches. The
        // Tools surface shows its own connecting state for the one frame it
        // costs.
        scheduleAfterPaint(() => {
          if (recordingModeRef.current !== 'audio') return
          requestCameraAccess('audio')
        })
      }
      if (mode === 'video') {
        scheduleAfterPaint(() => {
          void requestCameraPreviewResume('mode-switch')
        })
        window.setTimeout(() => {
          if (recordingModeRef.current !== 'video' || isRecording) return
          void requestCameraPreviewResume('mode-switch-retry')
        }, 360)
      }
    },
    [
      changeRecordingMode,
      isRecording,
      requestCameraAccess,
      requestCameraPreviewResume,
    ]
  )
  const handleRecordingModeChangeRef = useRef(handleRecordingModeChange)
  handleRecordingModeChangeRef.current = handleRecordingModeChange

  // Warm the floating-widget chunks once the app is idle. Toggling Drone or
  // Metronome in Workspace should show the widget on the same frame, not after
  // a network round trip.
  useEffect(() => scheduleIdle(() => {
    void importDroneWidget()
    void importMetronomeWidget()
    // Settings opens over a live camera; fetching its chunk at that moment is
    // what made the sheet arrive as a grey skeleton and then pop.
    void importSettingsDrawer()
  }, 1200), [])

  /* ---- The desk stays set ------------------------------------------------
   * Day two opens on the surface day one ended on. Camera is the hook's
   * default, so only an Audio ending needs the switch; it runs once, after
   * the first paint, so the camera session is not asked to change mid-boot. */
  const bootSurfaceAppliedRef = useRef(false)
  useEffect(() => {
    if (bootSurfaceAppliedRef.current) return
    bootSurfaceAppliedRef.current = true
    if (bootSurface.mode !== 'audio') return
    const frame = window.requestAnimationFrame(() => {
      handleRecordingModeChangeRef.current('audio')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    saveLastSurface({ mode: recordingMode, tab: audioPracticeTab })
  }, [audioPracticeTab, recordingMode])

  const handleReplayOnboardingTutorial = useCallback(() => {
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setIsPracticeHubOpen(false)
    setIsSplitView(false)
    setQuickSettingsOpen(false)
    setPracticeSessionActive(false)
    setTutorialTourEnabled(false)
    showTakeCardsRef.current = true
    updateSettings({
      autoSoundRecording: false,
      showTakeCards: true,
    })
    handleRecordingModeChange('video')
    scheduleAfterPaint(() => {
      setShowOnboardingTutorial(true)
    })
  }, [handleRecordingModeChange, updateSettings])

  const handleToggleRecord = useCallback(() => {
    if (recordingModeRef.current === 'audio' && !ready && !isRecording) {
      requestCameraAccess('audio')
      return
    }

    if (recordingModeRef.current === 'video' && isRecording && settings.autoSoundRecording) {
      updateSettings({ autoSoundRecording: false })
    }

    toggleRecording()
  }, [
    isRecording,
    ready,
    requestCameraAccess,
    settings.autoSoundRecording,
    toggleRecording,
    updateSettings,
  ])

  const handleFocusedPostTakeRetry = useCallback(() => {
    setFocusedCueOpen(false)
    setFocusedPostTakeId(null)
    setFocusedPostTakeReviewed(false)
    handleToggleRecord()
  }, [handleToggleRecord])

  const handleAutoSoundRecordingChange = useCallback(
    (enabled: boolean) => {
      autoSoundRecordingEnabledRef.current = enabled
      updateSettings({ autoSoundRecording: enabled })

      if (!enabled) {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(0)
        void disarmAutoRecording()
        return
      }

      // Camera startup and hands-free activation can overlap on a fresh launch.
      // Warm the existing pre-roll path now; its native bridge acquisition is
      // serialized so this safely joins an in-flight camera startup.
      void warmAutoRecording().finally(() => {
        if (autoSoundRecordingEnabledRef.current) {
          restartHandsFreeMonitorRef.current()
        }
      })
    },
    [
      disarmAutoRecording,
      releaseAutoRecordSuppress,
      stopAutoPlaybackAudio,
      updateSettings,
      warmAutoRecording,
    ]
  )

  /* ---- Desks: the whole room as one tap ---------------------------------- */
  const metronomeDeskState = useSyncExternalStore(
    sharedMetronomeEngine.subscribe,
    () => {
      const snapshot = sharedMetronomeEngine.getSnapshot()
      return `${snapshot.bpm}|${snapshot.meter}|${snapshot.subdivision}`
    },
    () => '',
  )
  const droneDeskState = useSyncExternalStore(subscribeDrone, getDroneSnapshot, getDroneSnapshot)

  const liveDeskSnapshot = useMemo<DeskSnapshot>(() => {
    const metronome = sharedMetronomeEngine.getSnapshot()
    return {
      mode: recordingMode,
      pitchTrackerEnabled: settings.pitchTrackerEnabled,
      showMetronome: settings.showMetronome,
      showDrone: settings.showDrone,
      showTakeCards: settings.showTakeCards,
      autoSoundRecording: settings.autoSoundRecording,
      audioEnhancerEnabled: settings.audioEnhancerEnabled,
      metronome: {
        bpm: Math.round(metronome.bpm),
        meter: metronome.meter,
        subdivision: metronome.subdivision,
      },
      drone: {
        pitchClass: droneDeskState.activeNotes[0] ?? droneDeskState.lastPitchClass,
        octave: droneDeskState.octave,
      },
      soundSilenceSeconds: settings.soundSilenceSeconds,
    }
    // metronomeDeskState is the subscription key for the engine snapshot read above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    droneDeskState,
    metronomeDeskState,
    recordingMode,
    settings.audioEnhancerEnabled,
    settings.autoSoundRecording,
    settings.pitchTrackerEnabled,
    settings.showDrone,
    settings.showMetronome,
    settings.showTakeCards,
    settings.soundSilenceSeconds,
  ])
  liveDeskSnapshotRef.current = liveDeskSnapshot

  const activeDeskId = useMemo(
    () => workspaceDesks.find((desk) => deskMatchesSnapshot(desk, liveDeskSnapshot))?.id ?? null,
    [liveDeskSnapshot, workspaceDesks],
  )
  const liveDeskSummary = useMemo(
    () => summarizeDesk(liveDeskSnapshot, settings.tunerTransposition),
    [liveDeskSnapshot, settings.tunerTransposition],
  )

  const applyDeskSnapshot = useCallback(
    (desk: DeskSnapshot) => {
      updateSettings({
        pitchTrackerEnabled: desk.pitchTrackerEnabled,
        showMetronome: desk.showMetronome,
        showDrone: desk.showDrone,
        showTakeCards: desk.showTakeCards,
        audioEnhancerEnabled: desk.audioEnhancerEnabled,
        soundSilenceSeconds: desk.soundSilenceSeconds,
      })
      showTakeCardsRef.current = desk.showTakeCards
      if (desk.autoSoundRecording !== autoSoundRecordingEnabledRef.current) {
        handleAutoSoundRecordingChange(desk.autoSoundRecording)
      }
      sharedMetronomeEngine.setMeter(desk.metronome.meter)
      sharedMetronomeEngine.setSubdivision(desk.metronome.subdivision)
      sharedMetronomeEngine.setBpm(desk.metronome.bpm)
      if (desk.showDrone) {
        applyDroneFromDesk(desk.drone.pitchClass, desk.drone.octave)
      } else {
        applyDroneFromDesk(null, desk.drone.octave)
      }
      if (desk.mode !== recordingModeRef.current) {
        handleRecordingModeChangeRef.current(desk.mode)
      }
    },
    [handleAutoSoundRecordingChange, updateSettings],
  )

  const handleApplyDesk = useCallback(
    (deskId: string) => {
      const desk = workspaceDesks.find((item) => item.id === deskId)
      if (!desk) return
      triggerLightHaptic(settings.hapticFeedback)
      applyDeskSnapshot(desk)
    },
    [applyDeskSnapshot, settings.hapticFeedback, workspaceDesks],
  )

  const handleSaveDesk = useCallback(
    (name: string) => {
      setWorkspaceDesks((current) => {
        const next = upsertWorkspaceDesk(current, name, liveDeskSnapshotRef.current ?? liveDeskSnapshot)
        saveWorkspaceDesks(next)
        return next
      })
    },
    [liveDeskSnapshot],
  )

  const handleDeleteDesk = useCallback((deskId: string) => {
    setWorkspaceDesks((current) => {
      const next = current.filter((desk) => desk.id !== deskId)
      saveWorkspaceDesks(next)
      return next
    })
  }, [])

  /** Focus picks the piece; the desk it was last played on comes with it. */
  const restoreFocusDesk = useCallback(
    (projectId: string) => {
      const desk = loadFocusDesk(projectId)
      if (desk) applyDeskSnapshot({ ...desk, showTakeCards: true })
    },
    [applyDeskSnapshot],
  )

  /* ---- Share from the card ----------------------------------------------
   * One verb for both kinds of take: the system sheet. It carries Messages,
   * Files and AirDrop, and for a video it is also where "Save Video" lives —
   * so Share never means a silent write to Photos the player did not ask for.
   */
  const handleShareTake = useCallback((take: Take) => {
    void shareTakeToSystem(take).then((result) => {
      if (result.ok) return
      const isVideo = getTakeMediaType(take) === 'video'
      showAlertOutsideTree({
        message:
          result.reason === 'missing_file'
            ? `That take’s ${isVideo ? 'video' : 'audio'} file is missing, so it can’t be shared.`
            : 'Sharing didn’t go through. Try again.',
        tone: 'error',
      })
    })
  }, [])


  const handleCloseSettings = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[OverlayClose] settings close pressed')
    }
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsSettingsOpen(false)
    if (import.meta.env.DEV) {
      console.log('[OverlayState] settingsOpen=false')
    }
  }, [markOverlayClosed, settings.hapticFeedback])

  const handleOpenQuickTunerFromSettings = useCallback(() => {
    setIsSettingsOpen(false)
    requestQuickFunctionFromApp('tuner', 'inAppSettings')
  }, [])

  const handleOpenQuickMetronomeFromSettings = useCallback(() => {
    setIsSettingsOpen(false)
    requestQuickFunctionFromApp('metronome', 'inAppSettings')
  }, [])

  const handleOpenPracticeHome = useCallback(() => {
    if (isRecording || isStopping) return
    if (!canOpenOverlaySheet() || isExperimentalOpen) return
    setShowPitch(false)
    setQuickSettingsOpen(false)
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
    setIsPracticeHubOpen(true)
    deferHudMediaPause()
  }, [
    canOpenOverlaySheet,
    deferHudMediaPause,
    isExperimentalOpen,
    isRecording,
    isStopping,
  ])

  /** Today from a running step — close a game first so the hub is allowed up. */
  const handleOpenRoutineToday = useCallback(() => {
    if (isRecording || isStopping) return
    setLabsRoute(null)
    setShowPitch(false)
    setQuickSettingsOpen(false)
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
    setIsPracticeHubOpen(true)
    deferHudMediaPause()
  }, [deferHudMediaPause, isRecording, isStopping])

  /**
   * Leaving Practice Home lands the finger on the live HUD underneath, so borrow
   * the same close suppression the vault/settings sheets use.
   */
  const dismissPracticeHub = useCallback(() => {
    markOverlayClosed()
    setIsPracticeHubOpen(false)
  }, [markOverlayClosed])

  const handleOpenQuickPractice = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    const sessionId = focusedPracticeSessionIdRef.current
    if (sessionId) void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Could not close this sitting. Your takes are still saved.'))
    setFocusedPractice(null)
    setFocusedReferenceTakeId(null)
    setFocusedPracticeSessionId(null)
    focusedPreviousChallengerRef.current = null
    dismissPracticeHub()
  }, [dismissPracticeHub, settings.hapticFeedback])

  /**
   * Closing the sheet resumes whatever context is already live — it never
   * fabricates a focus the musician did not choose, or the deck pill starts
   * lying about the session.
   */
  const handleClosePracticeHub = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    dismissPracticeHub()
  }, [dismissPracticeHub, settings.hapticFeedback])

  /**
   * Resolve what a new take in this session is measured against. A pinned
   * reference recording always wins (returning null lets the existing
   * project-benchmark binding show through); otherwise it's whichever take
   * currently holds Best within this session.
   */
  const resolveSessionReference = useCallback(
    async (projectId: string): Promise<string | null> => {
      const binding = await getProjectBenchmarkBinding(projectId)
      if (binding?.source === 'library') return null
      const rows = await getTakesByProject(projectId)
      return findBestTakeId(rows)
    },
    [],
  )

  const prepareFocusedComparisonAnalysis = useCallback((projectId: string) => {
    void (async () => {
      const rows = await getTakesByProject(projectId)
      const bestId = findBestTakeId(rows)
      const candidates = [
        rows.find((row) => row.id === bestId),
        ...rows.slice(0, 2),
      ]
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .filter(
          (row, index, all) =>
            all.findIndex((candidate) => candidate.id === row.id) === index &&
            (!row.pitchSeries || row.pitchSeries.length === 0),
        )

      for (const row of candidates) {
        const analysis = await analyzeTakeForFocusedPractice(row.filePath)
        if (!analysis) continue
        await updateVaultTake(row.id, {
          timelineOffsetMs: analysis.timelineOffsetMs,
          pitchSeries: analysis.pitchSeries,
          ...(analysis.performanceStartSeconds !== undefined
            ? { performanceStartSeconds: analysis.performanceStartSeconds }
            : null),
        })
        if (activeProjectIdRef.current !== projectId) continue
        setTakes((current) =>
          current.map((take) =>
            take.id === row.id
              ? {
                  ...take,
                  timelineOffsetMs: analysis.timelineOffsetMs,
                  pitchSeries: analysis.pitchSeries,
                  ...(analysis.performanceStartSeconds !== undefined
                    ? { performanceStartSeconds: analysis.performanceStartSeconds }
                    : null),
                }
              : take,
          ),
        )
      }
    })().catch((error) => {
      console.warn('[FocusedPractice] comparison analysis backfill failed', error)
    })
  }, [])

  const handleStartFocusedPractice = useCallback(
    async (projectId: string) => {
      if (focusedPracticeSessionIdRef.current) await endPracticeSession(focusedPracticeSessionIdRef.current)
      focusedPreviousChallengerRef.current = null
      if (projectId !== activeProjectIdRef.current) {
        await handleSelectProject(projectId)
      }
      if (!showTakeCardsRef.current) {
        showTakeCardsRef.current = true
        updateSettings({ showTakeCards: true })
      }
      const focusArea = (await listProjects()).find((project) => project.id === projectId)?.name ?? ''
      pauseYoutubeProxy(youtubeIframeRef.current)
      prepareNewYoutubeReference({ autoplay: false })
      setYoutubeAutoPlayOnLoad(false)
      setYoutubeUrl(getSelectedReferenceUrl(projectId))
      const referenceTakeId = await resolveSessionReference(projectId)
      prepareFocusedComparisonAnalysis(projectId)
      const { session, state } = await startPracticeSession({
        projectId,
        focusArea,
        comparison: 'current-best',
      })
      setPracticeItemStates((current) => [
        state,
        ...current.filter((item) => item.projectId !== state.projectId),
      ])
      setFocusedPracticeSessionId(session.id)
      setFocusedReferenceTakeId(referenceTakeId)
      setFocusedPostTakeId(null)
      setFocusedPostTakeReviewed(false)
      triggerLightHaptic(settings.hapticFeedback)
      setFocusedPractice({ projectId, focusArea })
      restoreFocusDesk(projectId)
      dismissPracticeHub()
    },
    [
      dismissPracticeHub,
      handleSelectProject,
      prepareFocusedComparisonAnalysis,
      projects,
      resolveSessionReference,
      restoreFocusDesk,
      settings.hapticFeedback,
      updateSettings,
    ],
  )

  const handleResumeFocusedPractice = handleStartFocusedPractice

  /**
   * Games sit on top of whatever is live. A focused sitting is suspended, not
   * ended: hands-free monitoring is already gated off while the overlay is
   * open, and the strip is back the moment the game closes.
   */
  const handleOpenPracticeGames = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    dismissPracticeHub()
    handleRecordingModeChange('audio')
    setLabsRoute('menu')
    deferHudMediaPause()
  }, [
    deferHudMediaPause,
    dismissPracticeHub,
    handleRecordingModeChange,
    settings.hapticFeedback,
  ])

  const handleOpenFullPracticeTool = useCallback(
    (tab: 'metronome' | 'tuner') => {
      triggerLightHaptic(settings.hapticFeedback)
      dismissPracticeHub()
      setIsSettingsOpen(false)
      setIsVaultOpen(false)
      setQuickSettingsOpen(false)
      setShowPitch(false)
      setLabsRoute(null)
      handleRecordingModeChange('audio')
      handleAudioPracticeTabChange(tab)
      deferHudMediaPause()
    },
    [
      deferHudMediaPause,
      dismissPracticeHub,
      handleAudioPracticeTabChange,
      handleRecordingModeChange,
      settings.hapticFeedback,
    ],
  )

  const handleOpenFullTunerFromPracticeHub = useCallback(() => {
    handleOpenFullPracticeTool('tuner')
  }, [handleOpenFullPracticeTool])

  const handleOpenFullMetronomeFromPracticeHub = useCallback(() => {
    handleOpenFullPracticeTool('metronome')
  }, [handleOpenFullPracticeTool])

  const handleOpenVaultFromPracticeHub = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setIsPracticeHubOpen(false)
    setIsSettingsOpen(false)
    setIsVaultOpen(true)
    deferHudMediaPause()
  }, [deferHudMediaPause, settings.hapticFeedback])

  const handleOpenMultitrack = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setLabsRoute(null)
    setShowPitch(false)
    setMultitrackOpen(true)
    // While multitrack owns the camera, a failed take must never tear down
    // the live bridge preview (black stage) — recovery is suppressed until close.
    setSuppressNativeBridgeRecovery(true)
    deferHudMediaPause()
  }, [
    deferHudMediaPause,
    markOverlayClosed,
    setSuppressNativeBridgeRecovery,
    settings.hapticFeedback,
  ])

  const handleMultitrackOpenRecordingStage = useCallback(() => {
    handleRecordingModeChange('video')
    if (isNativeCameraPlatform) {
      // Warm the native camera bridge immediately on tap so the panel shows a
      // live preview right away, instead of only once "Record" is pressed.
      void acquireNativeVideoBridge()
      return
    }
    void requestCameraAccess('video')
  }, [
    acquireNativeVideoBridge,
    handleRecordingModeChange,
    isNativeCameraPlatform,
    requestCameraAccess,
  ])

  /** Tap-to-reactivate from multitrack: rebuild the capture session from scratch. */
  const handleMultitrackWakeCamera = useCallback(async () => {
    handleRecordingModeChange('video')
    await refreshCameraSession()
    if (isNativeCameraPlatform) {
      await acquireNativeVideoBridge()
      return
    }
    await requestCameraAccess('video')
  }, [
    acquireNativeVideoBridge,
    handleRecordingModeChange,
    isNativeCameraPlatform,
    refreshCameraSession,
    requestCameraAccess,
  ])

  const handleMultitrackStartRecording = useCallback((): Promise<boolean> => {
    multitrackRecordingActiveRef.current = true
    if (shouldPauseYoutubeForRecording) {
      pauseYoutubeReference()
    }
    pausePipVideos()
    return startRecording()
  }, [pausePipVideos, pauseYoutubeReference, startRecording, shouldPauseYoutubeForRecording])

  const handleMultitrackStopRecording = useCallback(
    (options?: MultitrackRecordingStopOptions) => {
      // No isRecording gate: the serialized native stop is safe at any instant
      // (it awaits an in-flight start), and the old stale-state gate could
      // silently no-op a legitimate Stop.
      stopRecording(options)
    },
    [stopRecording]
  )

  const handleClearMultitrackPendingRecording = useCallback(() => {
    setMultitrackPendingRecordingTakeId(null)
  }, [])

  const handleMultitrackRecordingComplete = useCallback(() => {
    multitrackRecordingActiveRef.current = false
  }, [])

  const handleSaveRenderedMultitrackToVault = useCallback(async ({
    path,
    durationSeconds,
  }: {
    path: string
    durationSeconds: number
  }) => {
    const projectId = activeProjectIdRef.current
    if (!projectId) throw new Error('No active project is available for the Take Vault.')

    const takeId = crypto.randomUUID()
    const persisted = await persistRenderedTakeVideo(path, takeId)
    const safeVideoUrl = await resolveTakePlaybackUrl(persisted.filePath, persisted.videoUrl)
    const existing = await getTakesByProject(projectId)
    const renderedTake: Take = {
      ...createTake(
        takeId,
        takesRef.current.length + 1,
        safeVideoUrl,
        persisted.filePath,
        NATIVE_VIDEO_MIME,
        'video',
      ),
      name: `Multitrack ${existing.length + 1}`,
      duration: Math.max(0, durationSeconds),
      recordingOrientation: 'portrait',
    }

    try {
      await saveTake({
        projectId,
        filePath: persisted.filePath,
        duration: renderedTake.duration ?? 0,
        takeId,
        mimeType: NATIVE_VIDEO_MIME,
        mediaType: 'video',
        recordingOrientation: 'portrait',
        name: renderedTake.name,
      })
    } catch (error) {
      await deleteTakeFile(persisted.filePath)
      throw error
    }

    setTakes((current) => [...current, renderedTake])
    void captureAndPersistTakeThumbnail(renderedTake)
      .then((thumbnailUrl) => {
        if (!thumbnailUrl) return
        setTakes((current) =>
          current.map((take) => (take.id === takeId ? { ...take, thumbnailUrl } : take)),
        )
      })
      .catch(() => {
        /* the vault can show its normal video placeholder until a later refresh */
      })
  }, [])

  const handleCloseMultitrack = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    if (isRecording) stopRecording()
    multitrackRecordingActiveRef.current = false
    setMultitrackPendingRecordingTakeId(null)
    setMultitrackOpen(false)
    setSuppressNativeBridgeRecovery(false)
    recoverCameraAfterSurfaceDismiss('multitrack-close')
  }, [
    isRecording,
    recoverCameraAfterSurfaceDismiss,
    setSuppressNativeBridgeRecovery,
    settings.hapticFeedback,
    stopRecording,
  ])

  const handleCloseLabs = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setLabsRoute(null)
    if (audioPracticeTab === 'games') setAudioPracticeTab('audio')
    recoverCameraAfterSurfaceDismiss('labs-close')
  }, [audioPracticeTab, recoverCameraAfterSurfaceDismiss, setAudioPracticeTab, settings.hapticFeedback])

  const handleLabsNavigate = useCallback((route: LabsRoute) => {
    setLabsRoute(route)
  }, [])

  const micStreamIsLiveForTuner = useCallback(() => {
    if (isNativeCaptureSessionActive()) return true
    return Boolean(
      streamRef.current?.active &&
        streamRef.current
          .getAudioTracks()
          .some((track) => track.readyState === 'live' && track.enabled && !track.muted)
    )
  }, [])

  /**
   * Floor between unforced capture-session rebuilds for the tuner.
   *
   * Rebuilding is hardware work, and every caller here is a retry of some
   * kind. Without a floor a caller that retries on a timer can pin the app to
   * a continuous AVCaptureSession rebuild, which is what crashed a long tuner
   * sitting. Forced recovery (returning from the background, the Reactivate
   * button) goes down a different branch and is not throttled.
   */
  const lastTunerMicRebuildAtRef = useRef(0)
  const claimTunerMicRebuild = useCallback(() => {
    const now = performance.now()
    if (now - lastTunerMicRebuildAtRef.current < TUNER_MIC_REBUILD_FLOOR_MS) return false
    lastTunerMicRebuildAtRef.current = now
    return true
  }, [])

  const handleRequestTunerMicStream = useCallback(
    async (options?: { forceRecovery?: boolean }): Promise<boolean> => {
      if (isRecording) return false

      if (
        Capacitor.isNativePlatform() &&
        Capacitor.getPlatform() === 'ios' &&
        isNativeCaptureSessionActive()
      ) {
        tunerMicBackgroundGenerationRef.current = null
        return true
      }

      const backgroundGeneration = tunerMicBackgroundGenerationRef.current
      const hasFreshForegroundStream =
        backgroundGeneration !== null &&
        liveStreamGenerationRef.current > backgroundGeneration &&
        micStreamIsLiveForTuner()

      if (hasFreshForegroundStream) {
        tunerMicBackgroundGenerationRef.current = null
        return true
      }

      if (backgroundGeneration !== null && !options?.forceRecovery) {
        // The shared camera lifecycle gets first ownership of foreground recovery.
        // A delayed tuner fallback forces a fresh stream only if that rebuild
        // never produces a newer generation.
        return false
      }

      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios') {
        if (options?.forceRecovery) {
          if (backgroundGeneration !== null) {
            for (let attempt = 0; attempt < 4; attempt += 1) {
              await waitMs(180)
              if (
                liveStreamGenerationRef.current > backgroundGeneration &&
                micStreamIsLiveForTuner()
              ) {
                tunerMicBackgroundGenerationRef.current = null
                return true
              }
            }
          }

          const recovered = await reacquireStreamForAudioRoute({
            liveCapture: true,
          })
          if (recovered) {
            tunerMicBackgroundGenerationRef.current = null
          }
          return recovered
        }

        if (!micStreamIsLiveForTuner() && !isNativeCaptureSessionActive()) {
          if (!claimTunerMicRebuild()) return false
          requestCameraAccess('audio')
          return false
        }
        return true
      }

      if (!micStreamIsLiveForTuner()) {
        if (!claimTunerMicRebuild()) return false
        requestCameraAccess('audio')
        return false
      }
      return true
    },
    [claimTunerMicRebuild, isRecording, micStreamIsLiveForTuner, reacquireStreamForAudioRoute, requestCameraAccess]
  )

  /**
   * The games get the tuner's recovery-capable request, not a bare permission
   * prompt.
   *
   * They used to call `requestCameraAccess('audio')` once and never again,
   * which is why a game came back from the background detecting nothing: the
   * stream was dead, and nothing asked for a new one. This is the same entry
   * point the tuner uses, so `forceRecovery` waits for the shared camera
   * lifecycle before forcing a rebuild and cannot open a competing mic.
   */
  const handleRequestLabsMicStream = handleRequestTunerMicStream

  const schedulePitchTrackerCommit = useCallback(
    (enabled: boolean) => {
      if (pitchCommitTimerRef.current !== null) {
        window.clearTimeout(pitchCommitTimerRef.current)
      }

      setPendingPitchTrackerEnabled(enabled)

      pitchCommitTimerRef.current = window.setTimeout(() => {
        pitchCommitTimerRef.current = null
        setPendingPitchTrackerEnabled(null)
        startTransition(() => {
          updateSettings({ pitchTrackerEnabled: enabled })
        })
      }, PITCH_ENGINE_COMMIT_DELAY_MS)
    },
    [updateSettings]
  )

  const hudQuickSettings = useMemo(
    () => ({
      ...pickHudQuickSettings(settings),
      pitchTrackerEnabled: pendingPitchTrackerEnabled ?? settings.pitchTrackerEnabled,
    }),
    [
      pendingPitchTrackerEnabled,
      settings.audioEnhancerEnabled,
      settings.pitchTrackerEnabled,
      settings.showDrone,
      settings.showMetronome,
      settings.showTakeCards,
    ]
  )

  const pitchTrackerActive = pendingPitchTrackerEnabled ?? settings.pitchTrackerEnabled

  const handlePitchTrackerSettingChange = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setShowPitch(false)
      } else {
        // Enabling the tuner from the long-press menu is an explicit request
        // to show it. Availability of a mic/camera source is not.
        setShowPitch(true)
      }
      if (recordingModeRef.current === 'audio') {
        schedulePitchTrackerCommit(enabled)
        return
      }
      if (pitchCommitTimerRef.current !== null) {
        window.clearTimeout(pitchCommitTimerRef.current)
        pitchCommitTimerRef.current = null
      }
      setPendingPitchTrackerEnabled(null)
      updateSettings({ pitchTrackerEnabled: enabled })
    },
    [schedulePitchTrackerCommit, updateSettings]
  )

  const handleShowTakeCardsSettingChange = useCallback(
    (show: boolean) => {
      updateSettings({ showTakeCards: show })
    },
    [updateSettings]
  )

  const handleShowMetronomeSettingChange = useCallback(
    (show: boolean) => {
      updateSettings({ showMetronome: show })
    },
    [updateSettings]
  )

  const handleAudioEnhancerSettingChange = useCallback(
    (enabled: boolean) => {
      startTransition(() => {
        updateSettings({ audioEnhancerEnabled: enabled })
      })
    },
    [updateSettings]
  )

  const handleResetSettings = useCallback(() => {
    if (pitchCommitTimerRef.current !== null) {
      window.clearTimeout(pitchCommitTimerRef.current)
      pitchCommitTimerRef.current = null
    }
    setPendingPitchTrackerEnabled(null)
    setShowPitch(false)
    resetSettings()
  }, [resetSettings])

  useEffect(() => {
    return () => {
      if (pitchCommitTimerRef.current !== null) {
        window.clearTimeout(pitchCommitTimerRef.current)
      }
    }
  }, [])

  const handleQuickSettingsOpenChange = useCallback((open: boolean) => {
    if (!open && focusedPracticeRef.current && liveDeskSnapshotRef.current) {
      saveFocusDesk(focusedPracticeRef.current.projectId, liveDeskSnapshotRef.current)
    }
    startTransition(() => {
      setQuickSettingsOpen(open)
    })
  }, [])

  const suspendPipPlayback =
    isVaultOpen || isReviewOpen || isSettingsOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  const handsFreeBackgroundTake = useMemo(() => {
    if (!autoPlaybackTakeId || recordingMode !== 'video') return null
    return takes.find((take) => take.id === autoPlaybackTakeId) ?? null
  }, [autoPlaybackTakeId, recordingMode, takes])

  const handsFreeBackgroundPlaybackSrc = useMemo(() => {
    if (!handsFreeBackgroundTake?.videoUrl) return null
    return resolveMediaPlaybackSrc(handsFreeBackgroundTake.videoUrl)
  }, [handsFreeBackgroundTake])

  const resolvedBenchmark = useMemo(
    () =>
      focusedPractice && focusedReferenceTakeId
        ? resolveBenchmarkPlayback(null, focusedReferenceTakeId, takes, libraryItems)
        : resolveBenchmarkPlayback(benchmarkBinding, benchmarkId, takes, libraryItems),
    [
      benchmarkBinding,
      benchmarkId,
      focusedPractice,
      focusedReferenceTakeId,
      libraryItems,
      takes,
    ],
  )

  const benchmarkTake = resolvedBenchmark.take
  const libraryBenchmarkPlayback = resolvedBenchmark.libraryPlayback

  const challengerTake = useMemo(
    () => takes.find((t) => t.id === challengerId) ?? null,
    [takes, challengerId]
  )

  takesRef.current = takes

  const refreshStaleTakeThumbnails = useCallback(() => {
    void (async () => {
      invalidateThumbnailCacheIndex()
      const snapshot = takesRef.current
      const videoTakes = snapshot.filter((take) => take.filePath && take.mediaType !== 'audio')
      if (videoTakes.length === 0) return

      const updates = new Map<string, string>()
      await Promise.all(
        videoTakes.map(async (take) => {
          const refreshed = await reResolveCachedTakeThumbnail(
            take.id,
            take.recordingOrientation ?? 'portrait'
          )
          if (refreshed && refreshed !== take.thumbnailUrl) {
            updates.set(take.id, refreshed)
          }
        })
      )

      if (updates.size > 0) {
        applyTakeThumbnails(updates)
      }
    })()
  }, [applyTakeThumbnails])

  const refreshStaleTakePlaybackUrls = useCallback(() => {
    void (async () => {
      const snapshot = takesRef.current
      const activeIds = new Set(
        [benchmarkId, challengerId].filter((id): id is string => Boolean(id))
      )
      const targets = snapshot.filter(
        (take) => take.filePath && (activeIds.has(take.id) || !take.videoUrl)
      )
      if (targets.length === 0) return

      const refreshed = await Promise.all(
        targets.map(async (take) => {
          const resolved = await resolveTakePlaybackUrl(take.filePath, take.videoUrl)
          const safe = resolveMediaPlaybackSrc(resolved)
          return safe && safe !== take.videoUrl ? { ...take, videoUrl: safe } : take
        })
      )

      if (!refreshed.some((take, index) => take !== targets[index])) return

      const refreshedById = new Map(refreshed.map((take) => [take.id, take]))
      setTakes((current) => current.map((take) => refreshedById.get(take.id) ?? take))
    })()
  }, [benchmarkId, challengerId])
  const refreshStaleTakeThumbnailsRef = useRef(refreshStaleTakeThumbnails)
  refreshStaleTakeThumbnailsRef.current = refreshStaleTakeThumbnails
  const refreshStaleTakePlaybackUrlsRef = useRef(refreshStaleTakePlaybackUrls)
  refreshStaleTakePlaybackUrlsRef.current = refreshStaleTakePlaybackUrls
  const resumeYoutubeReferenceRef = useRef(resumeYoutubeReference)
  resumeYoutubeReferenceRef.current = resumeYoutubeReference

  useEffect(() => {
    let debounceTimer: number | null = null
    let youtubeTimer: number | null = null

    const runRecovery = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        refreshStaleTakePlaybackUrlsRef.current()
        refreshStaleTakeThumbnailsRef.current()
        if (youtubeTimer !== null) {
          window.clearTimeout(youtubeTimer)
        }
        youtubeTimer = window.setTimeout(() => {
          youtubeTimer = null
          if (!isYoutubeDialogOpen()) {
            resumeYoutubeReferenceRef.current()
          }
        }, 700)
      }, 400)
    }

    if (!Capacitor.isNativePlatform()) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          runRecovery()
        }
      }
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        document.removeEventListener('visibilitychange', onVisible)
        if (debounceTimer !== null) window.clearTimeout(debounceTimer)
        if (youtubeTimer !== null) window.clearTimeout(youtubeTimer)
      }
    }

    let removeListener: (() => void) | undefined
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) runRecovery()
      }).then((sub) => {
        removeListener = () => {
          void sub.remove()
        }
      })
    })

    return () => {
      removeListener?.()
      if (debounceTimer !== null) window.clearTimeout(debounceTimer)
      if (youtubeTimer !== null) window.clearTimeout(youtubeTimer)
    }
  }, [])

  const mainAudioPitchSource = useMemo((): MainAudioPitchSource | null => {
    // Audio mode uses the dedicated Tuner tab — no floating pitch overlay.
    return null
  }, [])

  const mainVideoPitchSource = useMemo(() => {
    if (!pitchTrackerActive || recordingMode !== 'video') return null
    if (!ready && !isRecording) return null

    return {
      mediaRef: liveMicPlaceholderRef,
      isPlaying: true,
      mediaKey: 'main-video-live',
    }
  }, [pitchTrackerActive, recordingMode, ready, isRecording])

  const pitchHudSuspended =
    isVaultOpen || isSettingsOpen || isReviewOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  const showMainPitchWidget = mainAudioPitchSource !== null || mainVideoPitchSource !== null

  const showMetronomeWidget = settings.showMetronome

  const metronomePlaying = useSyncExternalStore(
    sharedMetronomeEngine.subscribe,
    () => sharedMetronomeEngine.getSnapshot().playing,
    () => false
  )

  useEffect(() => {
    if (!metronomePlaying) return
    if (recordingMode === 'video' && !nativeLivePreviewActive) return
    sharedMetronomeEngine.reconcileAfterModeSwitch(recordingMode)
  }, [recordingMode, nativeLivePreviewActive, metronomePlaying])

  const metronomeHudSuspended =
    isVaultOpen || isSettingsOpen || isReviewOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  // Desk widgets live on the record surfaces. The Tools tabs are where the
  // full tools are, so the widgets step aside there and are back on return.
  const onRecordSurface = recordingMode === 'video' || audioPracticeTab === 'audio'
  const showFloatingMetronomeWidget = showMetronomeWidget && onRecordSurface

  const metronomeWidgetInteractive = showFloatingMetronomeWidget && !metronomeHudSuspended

  const showFloatingDroneWidget = settings.showDrone && onRecordSurface
  const droneWidgetInteractive = showFloatingDroneWidget && !metronomeHudSuspended

  /*
   * First-run placement for the desk widgets. Camera keeps the take tiles
   * pinned near the top and Tools has the tab strip there, so a widget that
   * spawned at the default offset landed on top of both. These clear them;
   * once dragged, the saved position wins.
   */
  const deskWidgetTopOffset = recordingMode === 'audio' ? 138 : 196

  // Full-screen hands-free presence layer. Uses the same resolver as the control
  // deck carousel so the stage and the record button can never disagree, and
  // stands down whenever a sheet, review or the tutorial owns the screen.
  const handsFreeStagePhase = resolveHandsFreePhase({
    autoSoundRecording: settings.autoSoundRecording,
    isRecording,
    handsFreePlaybackPending: handsFreePlaybackPending || autoPlaybackPlaying,
    handsFreeListeningReady,
    dragDeleteActive: pipDragState.isDragging && !isRecording,
    finishingTake: isStopping && recordingMode === 'video',
  })
  const handsFreeStageVisiblePhase =
    hudModalState === 'idle' && !showOnboardingTutorial ? handsFreeStagePhase : null
  // Camera and the tuner leave the middle of the screen open, so they get the
  // large free-floating copy. Every other Tools tab packs controls from top to
  // bottom and needs the compact backed pill instead.
  const handsFreeStagePlacement =
    recordingMode === 'audio' && audioPracticeTab !== 'tuner' ? 'chip' : 'center'

  const takePlaybackActive =
    autoPlaybackPlaying ||
    audioModeTakePlaying ||
    benchmarkPipPlaying ||
    challengerPipPlaying ||
    reviewPlaybackPlaying
  const shouldHoldCameraPreviewForTakePlayback =
    recordingMode === 'video' &&
    !isRecording &&
    // Inline Best Take / Current Take previews use the coexistent playback
    // route and must leave the live camera visible behind their small player.
    // Only hands-free and full review playback need exclusive preview ownership.
    (autoPlaybackPlaying || handsFreePlaybackPending || isReviewOpen || reviewPlaybackPlaying)
  const nativeSessionPlaybackActive =
    autoPlaybackPlaying ||
    (recordingMode === 'video' && takePlaybackActive) ||
    (recordingMode === 'audio' && audioModeTakePlaying)
  const nativeExperimentalRecordingActive =
    isRecording &&
    (recordingMode === 'video' || (recordingMode === 'audio' && isNativeCameraPlatform))
  const handsFreeBackgroundPlaybackActive =
    recordingMode === 'video' && autoPlaybackTakeId !== null && autoPlaybackPlaying
  const handsFreeAudioBackgroundPlaybackActive =
    recordingMode === 'audio' && autoPlaybackTakeId !== null && autoPlaybackPlaying
  // Both audio and camera hands-free begin with a hidden native pre-roll.
  // While it owns AVAudioSession, React must not reconfigure that session.
  const nativeHandsFreeSessionCaptureActive = isNativeAudioCaptureActive()
  const shouldDeferNativeExperimentalAudioMode =
    handsFreeBackgroundPlaybackActive ||
    handsFreeAudioBackgroundPlaybackActive ||
    nativeHandsFreeSessionCaptureActive ||
    (isRecording && recordingMode === 'audio')

  useEffect(() => {
    registerInlineTakePlaybackPreviewHold(() => shouldHoldCameraPreviewForTakePlayback)
    return () => registerInlineTakePlaybackPreviewHold(() => false)
  }, [shouldHoldCameraPreviewForTakePlayback])

  const selectedAudioEngine = settings.audioEnhancerEnabled ? 'Native + Enhanced' : 'Native'

  useEffect(() => {
    console.info(`[AudioEngine] selected=${selectedAudioEngine}`)
  }, [selectedAudioEngine])

  useEffect(() => {
    // A native hands-free pre-roll owns AVCapture and AVAudioSession directly.
    if (shouldDeferNativeExperimentalAudioMode) return
    void applyNativeExperimentalAudioMode({
      enabled: true,
      selectedAudioEngine,
      micInputPreference: settings.micInputPreference,
      recordingActive: nativeExperimentalRecordingActive,
      playbackActive: nativeSessionPlaybackActive,
    })
  }, [
    nativeExperimentalRecordingActive,
    nativeSessionPlaybackActive,
    audioModeTakePlaying,
    selectedAudioEngine,
    settings.micInputPreference,
    shouldDeferNativeExperimentalAudioMode,
    isNativeCameraPlatform,
  ])

  useAppShellPolicies({
    keepAwake: isRecording || isReviewOpen || takePlaybackActive,
    hudSurface: hudModalState,
    lightStatusBarSurface: recordingMode === 'audio' && !settings.darkMode,
  })

  useEffect(() => {
    // Re-applied on launch as well as on change, so a takes directory recreated
    // by a restore picks the preference back up.
    void applyTakesBackupPreference(settings.backUpTakesToIcloud)
  }, [settings.backUpTakesToIcloud])

  useEffect(() => {
    // A take whose file already has the enhancement baked in (native offline
    // render after recording) must NOT also pass through the live WebAudio
    // enhancer — that would double-process. When any take likely to be
    // playing right now is baked, bypass the live chain; unbaked/legacy takes
    // keep the live preview enhancement.
    const bakedTakeActive =
      handsFreeBackgroundTake?.enhancerBaked === true ||
      (autoPlaybackTakeId !== null &&
        takes.find((take) => take.id === autoPlaybackTakeId)?.enhancerBaked === true) ||
      challengerTake?.enhancerBaked === true
    const liveChainEnabled = settings.audioEnhancerEnabled && !bakedTakeActive
    setTakePlaybackEnhancerState(
      liveChainEnabled,
      liveChainEnabled ? settings.audioEnhancerSettings : undefined
    )
  }, [
    autoPlaybackTakeId,
    challengerTake,
    handsFreeBackgroundTake,
    settings.audioEnhancerEnabled,
    settings.audioEnhancerSettings,
    takes,
  ])

  useEffect(() => {
    setActiveCaptureProfile('natural')
  }, [])

  const audioPracticeSheetOpen = isVaultOpen || isSettingsOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  const isAudioPracticeMetronomeTab = recordingMode === 'audio' && audioPracticeTab === 'metronome'

  const isAudioPracticeTunerTab = recordingMode === 'audio' && audioPracticeTab === 'tuner'

  const isAudioPracticeRecordTab = recordingMode === 'audio' && audioPracticeTab === 'audio'

  const isAudioPracticeTunerActive =
    isAudioPracticeTunerTab && !audioPracticeSheetOpen && !isReviewOpen

  const isAudioPracticeTimelineTab = recordingMode === 'audio' && audioPracticeTab === 'practice'

  const isAudioPracticeGamesTab = recordingMode === 'audio' && audioPracticeTab === 'games'

  useEffect(() => {
    if (!isAudioPracticeTimelineTab) {
      setPracticeSessionActive(false)
    }
  }, [isAudioPracticeTimelineTab])

  useEffect(() => {
    if (!practiceSessionActive) {
      setPracticeRecordingControlsExpanded(false)
    }
  }, [practiceSessionActive])

  const isAudioPracticeToolTab =
    isAudioPracticeMetronomeTab ||
    isAudioPracticeTunerTab ||
    isAudioPracticeTimelineTab ||
    isAudioPracticeGamesTab

  useEffect(() => {
    if (!isAudioPracticeTunerActive || quickSettingsOpen || isRecording) return

    handleRequestTunerMicStream()
  }, [
    handleRequestTunerMicStream,
    isAudioPracticeTunerActive,
    isRecording,
    quickSettingsOpen,
    streamGeneration,
    nativeLivePreviewActive,
  ])

  const pitchAudioHudLock =
    showPitch &&
    recordingMode === 'audio' &&
    mainAudioPitchSource !== null &&
    hudModalState === 'idle' &&
    !pitchHudSuspended

  const metronomeAudioHudLock =
    recordingMode === 'audio' &&
    audioPracticeTab === 'metronome' &&
    hudModalState === 'idle' &&
    !metronomeHudSuspended

  const audioToolHudLock =
    isAudioPracticeToolTab && hudModalState === 'idle' && !audioPracticeSheetOpen && !isReviewOpen

  const overlayPointerCapture =
    !audioPracticeSheetOpen &&
    (pitchAudioHudLock || metronomeAudioHudLock || audioToolHudLock || showOnboardingTutorial)

  const metronomeStageActive = false

  const isAudioPracticeMainTab = recordingMode !== 'audio' || audioPracticeTab === 'audio'

  const showFloatingMainPitch =
    showPitch && mainAudioPitchSource !== null && !isAudioPracticeTunerTab

  useEffect(() => {
    if (!pitchTrackerActive) {
      setShowPitch(false)
    }
  }, [pitchTrackerActive])

  const handleClosePitch = useCallback(() => {
    setShowPitch(false)
  }, [])

  const handleCloseMetronome = useCallback(() => {
    handleShowMetronomeSettingChange(false)
  }, [handleShowMetronomeSettingChange])

  const handleShowDroneSettingChange = useCallback(
    (show: boolean) => {
      updateSettings({ showDrone: show })
      if (!show) applyDroneFromDesk(null, getDroneSnapshot().octave)
    },
    [updateSettings],
  )

  const handleCloseDrone = useCallback(() => {
    handleShowDroneSettingChange(false)
  }, [handleShowDroneSettingChange])

  /* ---- "Again": one breath of Record when Current finishes playing back --- */
  const currentPlaybackActive = autoPlaybackPlaying || challengerPipPlaying
  const currentPlaybackWasActiveRef = useRef(currentPlaybackActive)
  useEffect(() => {
    const wasActive = currentPlaybackWasActiveRef.current
    currentPlaybackWasActiveRef.current = currentPlaybackActive
    if (!wasActive || currentPlaybackActive || isRecording) return
    setAgainPulse(true)
    const timer = window.setTimeout(() => setAgainPulse(false), 950)
    return () => window.clearTimeout(timer)
  }, [currentPlaybackActive, isRecording])

  /** The session name plus take count, for the line at the top of the desk. */
  // `takes` is the active project's list; a Focus session is always the active project.
  const focusedTakeCount =
    focusedPractice && focusedPractice.projectId === activeProjectId ? takes.length : 0

  /** What Practice Home shows under the Focus card: the desk that session restores. */
  const focusDeskSummary = useMemo(() => {
    if (!isPracticeHubOpen) return null
    const projectId =
      focusedPractice?.projectId ?? practiceItemStates[0]?.projectId ?? activeProjectId ?? null
    if (!projectId) return null
    const desk = loadFocusDesk(projectId)
    return desk ? summarizeDesk(desk, settings.tunerTransposition) : null
  }, [
    activeProjectId,
    focusedPractice?.projectId,
    isPracticeHubOpen,
    practiceItemStates,
    settings.tunerTransposition,
  ])

  useEffect(() => {
    if (!settings.showTakeCards) {
      if (!autoPlaybackTakeId && !autoPlaybackPlaying && !handsFreePlaybackPending) {
        setChallengerId(null)
      }
      return
    }

    setChallengerId((current) => {
      if (current && takes.some((take) => take.id === current)) return current

      const pendingId = pendingChallengerIdRef.current
      if (pendingId && takes.some((take) => take.id === pendingId)) {
        challengerUserDismissedRef.current = false
        return pendingId
      }

      if (challengerUserDismissedRef.current) return null

      const candidate = takes.find((take) => take.id !== benchmarkId)
      return candidate?.id ?? null
    })
  }, [
    settings.showTakeCards,
    takes,
    benchmarkId,
    autoPlaybackTakeId,
    autoPlaybackPlaying,
    handsFreePlaybackPending,
  ])

  const sortedTakes = useMemo(() => sortTakes(takes, sortMode), [takes, sortMode])

  const refreshBestTakeHistory = useCallback(() => {
    void listBestTakeHistory()
      .then(setBestTakeHistory)
      .catch((error) => console.warn('[BestTakeHistory] refresh failed', error))
  }, [])

  const handlePinBenchmark = useCallback(
    (id: string) => {
      triggerBestTakeHaptic(settings.hapticFeedback)
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setYoutubeUrl(null)
      if (activeProjectIdRef.current) {
        try { selectPracticeReference(activeProjectIdRef.current, null) }
        catch { setTakeDeleteError('Your reference selection could not be remembered.') }
      }
      setBenchmarkBinding({ source: 'take', refId: id })
      setBenchmarkId((prevBenchmark) => {
        setChallengerId((current) => {
          if (current === id) {
            if (prevBenchmark && prevBenchmark !== id) {
              return prevBenchmark
            }
            const sorted = sortTakes(takes, sortMode)
            const pinnedIndex = sorted.findIndex((take) => take.id === id)
            if (pinnedIndex >= 0 && pinnedIndex < sorted.length - 1) {
              return sorted[pinnedIndex + 1].id
            }
            return null
          }
          if (current && current !== id) return current
          const other = takes.find((take) => take.id !== id)
          return other?.id ?? null
        })
        return id
      })
      // A pinned reference recording takes priority — don't clobber it with
      // the newly-starred take.
      if (focusedPractice && benchmarkBinding?.source !== 'library') {
        setFocusedReferenceTakeId(id)
      }
      if (activeProjectIdRef.current) {
        void setProjectBestTake(activeProjectIdRef.current, id).then(refreshBestTakeHistory)
      }
    },
    [
      pausePipVideos,
      benchmarkBinding?.source,
      focusedPractice,
      refreshBestTakeHistory,
      releaseAutoRecordSuppress,
      settings.hapticFeedback,
      sortMode,
      stopAutoPlaybackAudio,
      takes,
    ]
  )

  const handleSetLibraryReference = useCallback(
    (itemId: string) => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setYoutubeUrl(null)
      if (activeProjectIdRef.current) {
        try { selectPracticeReference(activeProjectIdRef.current, null) }
        catch { setTakeDeleteError('Your reference selection could not be remembered.') }
      }
      setBenchmarkBinding({ source: 'library', refId: itemId })
      if (activeProjectIdRef.current) {
        void setProjectLibraryBenchmark(activeProjectIdRef.current, itemId)
      }
    },
    [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio]
  )

  const handleClearLibraryReference = useCallback(() => {
    teardownPipMedia(benchmarkPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setBenchmarkPipPlaying(false)
    setBenchmarkBinding(null)
    if (activeProjectIdRef.current) {
      void setProjectBenchmarkBinding(activeProjectIdRef.current, null)
    }
  }, [teardownPipMedia])

  const handleImportLibraryAudio = useCallback(async (file: File) => {
    const projectId = activeProjectIdRef.current
    if (!projectId) return

    const itemId = crypto.randomUUID()
    const mimeType = normalizeLibraryAudioMime(file.type)
    const duration = await probeAudioDurationSeconds(file)
    const persisted = await persistLibraryAudio(file, itemId, mimeType)
    const row = await saveLibraryAudioItem({
      projectId,
      filePath: persisted.filePath,
      mimeType,
      duration,
      name: file.name.replace(/\.[^.]+$/, ''),
      itemId,
    })

    const hydrated = await hydrateLibraryItems([
      {
        id: row.id,
        projectId: row.projectId,
        kind: row.kind,
        name: row.name,
        createdAt: row.createdAt,
        filePath: row.filePath,
        mimeType: row.mimeType,
        duration: row.duration,
      },
    ])
    const item = hydrated[0]
    if (item && persisted.playbackUrl) {
      item.playbackUrl = persisted.playbackUrl
    }
    if (item) {
      setLibraryItems((current) => [item, ...current])
    }
  }, [])

  const handleRenameLibraryItem = useCallback((itemId: string, name: string) => {
    void updateLibraryItemName(itemId, name)
    setLibraryItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, name } : item))
    )
  }, [])

  const handleDeleteLibraryItem = useCallback(
    async (itemId: string) => {
      const item = libraryItems.find((entry) => entry.id === itemId)
      if (!item) return

      if (benchmarkBinding?.source === 'library' && benchmarkBinding.refId === itemId) {
        handleClearLibraryReference()
      }

      await deleteLibraryItem(itemId)
      if (item.filePath) {
        await deleteLibraryFile(item.filePath)
      }
      setLibraryItems((current) => current.filter((entry) => entry.id !== itemId))
    },
    [benchmarkBinding, handleClearLibraryReference, libraryItems]
  )

  const handlePinChallenger = useCallback(
    (id: string) => {
      pausePipVideos()
      challengerUserDismissedRef.current = false
      setChallengerId(id)
    },
    [pausePipVideos]
  )

  const handleOpenVaultTake = useCallback(
    (take: Take) => {
      const index = sortedTakes.findIndex((entry) => entry.id === take.id)
      markOverlayClosed()
      setVaultReviewIndex(index >= 0 ? index : 0)
      setReviewContext('vault')
      setReviewSlot('benchmark')
      setIsVaultOpen(false)
      deferHudMediaPause()
    },
    [deferHudMediaPause, markOverlayClosed, sortedTakes]
  )

  const handleOpenCompareReview = useCallback(
    (slot: ReviewSlot) => {
      setReviewContext('compare')
      setReviewSlot(slot)
      deferHudMediaPause()
    },
    [deferHudMediaPause]
  )

  const handleFocusedPostTakeReview = useCallback(() => {
    if (!focusedPostTakeId) return
    challengerUserDismissedRef.current = false
    pendingChallengerIdRef.current = focusedPostTakeId
    setChallengerId(focusedPostTakeId)
    setFocusedPostTakeReviewed(true)
    if (youtubeUrlRef.current) {
      showTakeCardsRef.current = true
      updateSettings({ showTakeCards: true })
      if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
      deferHudMediaPause()
      setIsSplitView(true)
    } else handleOpenCompareReview('challenger')
  }, [deferHudMediaPause, focusedPostTakeId, handleAudioPracticeTabChange, handleOpenCompareReview, updateSettings])

  const handleCloseReview = useCallback(() => {
    startTransition(() => {
      setReviewSlot(null)
      setReviewContext((context) => {
        if (context === 'vault') {
          setIsVaultOpen(true)
        }
        return 'compare'
      })
    })
    pausePipVideos()
    stopAutoPlaybackAudio()
    audioModePlaybackControlsRef.pause?.()
    releaseAutoRecordSuppress(0)
    window.setTimeout(() => {
      recoverCameraAfterSurfaceDismiss('review-close-button')
    }, 350)
  }, [
    pausePipVideos,
    recoverCameraAfterSurfaceDismiss,
    releaseAutoRecordSuppress,
    reviewContext,
    stopAutoPlaybackAudio,
  ])

  const handleUploadBenchmark = useCallback(
    (file: File) => {
      pausePipVideos()

      void (async () => {
        const takeId = crypto.randomUUID()
        const mimeType = file.type || NATIVE_VIDEO_MIME
        const mediaType = inferMediaTypeFromMime(mimeType)
        const persisted = await persistUploadedVideo(file, takeId, mimeType)
        const safeVideoUrl = await resolveTakePlaybackUrl(persisted.filePath, persisted.videoUrl)

        const uploadedTake: Take = {
          ...createTake(
            takeId,
            takes.length + 1,
            safeVideoUrl,
            persisted.filePath,
            mimeType,
            mediaType
          ),
          name: mediaType === 'audio' ? 'Uploaded Audio' : 'Uploaded Best Take',
          mirrorPlayback: false,
          thumbnailUrl: mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : '',
        }

        const projectId = activeProjectIdRef.current
        if (projectId && persisted.filePath) {
          await saveTake({
            projectId,
            filePath: persisted.filePath,
            duration: 0,
            takeId,
            mimeType,
            mediaType,
            name: uploadedTake.name,
          })
          await setProjectBestTake(projectId, takeId)
          refreshBestTakeHistory()
        }

        setTakes((prev) => [...prev, uploadedTake])

        setBenchmarkId(takeId)

        if (mediaType === 'audio') return

        void captureAndPersistTakeThumbnail(uploadedTake)
          .then((thumbnailUrl) => {
            if (!thumbnailUrl) return
            setTakes((current) =>
              current.map((take) => (take.id === takeId ? { ...take, thumbnailUrl } : take))
            )
          })
          .catch(() => {
            /* PiP shows placeholder until thumbnail is ready */
          })
      })()
    },
    [pausePipVideos, refreshBestTakeHistory, takes.length]
  )

  const handleUpdateTake = useCallback((id: string, updates: TakeUpdate) => {
    setTakes((prev) => prev.map((take) => (take.id === id ? { ...take, ...updates } : take)))
    void updateVaultTake(id, updates)
  }, [])

  /** Rate step of the record/reflect loop — one tap, right after the take. */
  const handleFocusedPostTakeRate = useCallback(
    (rating: number) => {
      if (!focusedPostTakeId) return
      triggerLightHaptic(settings.hapticFeedback)
      handleUpdateTake(focusedPostTakeId, { rating })
    },
    [focusedPostTakeId, handleUpdateTake, settings.hapticFeedback],
  )

  const handleDeleteTakes = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return

      const idSet = new Set(ids)
      if (autoPlaybackTakeId && idSet.has(autoPlaybackTakeId)) {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(0)
      }
      audioModePlaybackControlsRef.pause?.()

      if (ids.some((id) => id === benchmarkId || id === challengerId)) {
        pausePipVideos()
      }

      const requestedTakes = takesRef.current.filter((take) => idSet.has(take.id))
      setTakeDeleteError(null)

      const outcomes = await Promise.all(
        requestedTakes.map(async (take) => {
          if (take.filePath) {
            const fileDeleted = await deleteTakeFile(take.filePath)
            if (!fileDeleted) {
              return { id: take.id, removed: false, cleanupWarning: false }
            }
          } else if (take.videoUrl.startsWith('blob:')) {
            URL.revokeObjectURL(take.videoUrl)
          }

          let cleanupWarning = false
          try {
            await deleteVaultTake(take.id)
          } catch (error) {
            cleanupWarning = true
            console.error('[TakeDelete] Media removed but database cleanup failed', {
              takeId: take.id,
              error,
            })
          }

          await deleteCachedTakeThumbnail(take.id).catch((error) => {
            console.warn('[TakeDelete] Thumbnail cleanup failed', {
              takeId: take.id,
              error,
            })
          })
          return { id: take.id, removed: true, cleanupWarning }
        })
      )

      const removedIds = new Set(
        outcomes.filter((outcome) => outcome.removed).map((outcome) => outcome.id)
      )
      if (removedIds.size > 0) {
        setTakes((prev) => prev.filter((take) => !removedIds.has(take.id)))
        setBestTakeHistory((current) =>
          current.filter((entry) => !removedIds.has(entry.takeId)),
        )
        setFocusedReferenceTakeId((current) =>
          current && removedIds.has(current) ? null : current,
        )
        setBenchmarkId((current) => (current && removedIds.has(current) ? null : current))
        setChallengerId((current) => (current && removedIds.has(current) ? null : current))
      }

      if (outcomes.some((outcome) => !outcome.removed)) {
        setTakeDeleteError(
          'A take could not be deleted and remains in your library. Please try again.'
        )
      } else if (outcomes.some((outcome) => outcome.cleanupWarning)) {
        setTakeDeleteError(
          'The take was removed, but library cleanup did not finish. BestTake will reconcile it when the app restarts.'
        )
      }
    },
    [
      autoPlaybackTakeId,
      benchmarkId,
      challengerId,
      pausePipVideos,
      releaseAutoRecordSuppress,
      stopAutoPlaybackAudio,
    ]
  )

  const handleDragDeleteTake = useCallback(
    (id: string) => {
      triggerWarningHaptic(settings.hapticFeedback)
      pausePipVideos()
      void handleDeleteTakes([id])
    },
    [handleDeleteTakes, pausePipVideos, settings.hapticFeedback]
  )

  const handleDeleteTake = useCallback(
    (id: string) => {
      void handleDeleteTakes([id])
    },
    [handleDeleteTakes]
  )

  const handleClearAllTakes = useCallback(() => {
    const ids = takesRef.current.map((take) => take.id)
    if (ids.length === 0) return
    void handleDeleteTakes(ids)
  }, [handleDeleteTakes])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )

  const focusedPracticeState = useMemo(
    () =>
      focusedPractice
        ? practiceItemStates.find((state) => state.projectId === focusedPractice.projectId) ?? null
        : null,
    [focusedPractice, practiceItemStates],
  )

  const focusedPostTakeRating = useMemo(
    () =>
      focusedPostTakeId ? takes.find((take) => take.id === focusedPostTakeId)?.rating ?? 0 : 0,
    [focusedPostTakeId, takes],
  )

  useEffect(() => {
    if (focusedPractice) return
    const sessionId = focusedPracticeSessionIdRef.current
    if (sessionId) {
      setFocusedPracticeSessionId(null)
      void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Could not close this practice sitting. Your takes are still saved.'))
    }
    setFocusedCueOpen(false)
    setFocusedPostTakeId(null)
    setFocusedPostTakeReviewed(false)
  }, [focusedPractice])

  useEffect(() => {
    if (!focusedPostTakeId) return
    if (takes.some((take) => take.id === focusedPostTakeId)) return
    setFocusedPostTakeId(null)
    setFocusedPostTakeReviewed(false)
  }, [focusedPostTakeId, takes])

  const handleFocusedPracticeIntentionChange = useCallback(
    (pendingIntention: string) => {
      const projectId = focusedPracticeRef.current?.projectId
      if (!projectId) return
      setPracticeItemStates((current) =>
        current.map((state) =>
          state.projectId === projectId ? { ...state, pendingIntention } : state,
        ),
      )
      void updatePracticeItemState(projectId, { pendingIntention }).catch((error) => {
        console.warn('[FocusedPractice] note persistence failed', error)
      })
    },
    [],
  )

  const handleFocusedLoopRangeChange = useCallback(
    (loopStartSeconds: number | null, loopEndSeconds: number | null) => {
      const projectId = focusedPracticeRef.current?.projectId
      if (!projectId) return
      setPracticeItemStates((current) =>
        current.map((state) =>
          state.projectId === projectId
            ? { ...state, loopStartSeconds, loopEndSeconds }
            : state,
        ),
      )
      void updatePracticeItemState(projectId, {
        loopStartSeconds,
        loopEndSeconds,
      }).catch((error) => {
        console.warn('[FocusedPractice] loop persistence failed', error)
      })
    },
    [],
  )

  const clearBenchmarkTake = useCallback(
    (takeId: string) => {
      audioModePlaybackControlsRef.pause?.()
      teardownPipMedia(benchmarkPipVideoRef.current)
      void releaseTakePlaybackAudio()
      stabilizeViewportAfterMediaInteraction()
      setBenchmarkPipPlaying(false)
      setBenchmarkBinding((current) =>
        current?.source === 'take' && current.refId === takeId ? null : current,
      )
      setBenchmarkId((current) => (current === takeId ? null : current))
      if (activeProjectIdRef.current) {
        void clearProjectBestTake(activeProjectIdRef.current, takeId)
      }
    },
    [teardownPipMedia],
  )

  const handleUnpinBenchmark = useCallback(() => {
    if (!benchmarkTake?.id) return
    clearBenchmarkTake(benchmarkTake.id)
  }, [benchmarkTake?.id, clearBenchmarkTake])

  const handleMoveBenchmarkToCurrent = useCallback(
    (takeId: string) => {
      handlePinChallenger(takeId)
      clearBenchmarkTake(takeId)
    },
    [clearBenchmarkTake, handlePinChallenger],
  )

  const handleUnpinChallenger = useCallback(() => {
    audioModePlaybackControlsRef.pause?.()
    if (challengerId && autoPlaybackTakeId === challengerId) {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
    }
    teardownPipMedia(challengerPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setChallengerPipPlaying(false)
    challengerUserDismissedRef.current = true
    pendingChallengerIdRef.current = null
    setChallengerId(null)
  }, [
    autoPlaybackTakeId,
    challengerId,
    releaseAutoRecordSuppress,
    stopAutoPlaybackAudio,
    teardownPipMedia,
  ])

  const handleClearAudioBenchmark = useCallback(() => {
    audioModePlaybackControlsRef.pause?.()
    if (libraryBenchmarkPlayback) {
      handleClearLibraryReference()
    }
    pausePipVideos()
    teardownPipMedia(benchmarkPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setBenchmarkPipPlaying(false)
    setBenchmarkBinding(null)
    setBenchmarkId(null)
    if (activeProjectIdRef.current) {
      void setProjectBenchmarkBinding(activeProjectIdRef.current, null)
    }
  }, [handleClearLibraryReference, libraryBenchmarkPlayback, pausePipVideos, teardownPipMedia])

  const handleClearAudioChallenger = useCallback(() => {
    handleUnpinChallenger()
  }, [handleUnpinChallenger])

  const handleReviewSlotChange = useCallback((slot: ReviewSlot) => {
    setReviewContext('compare')
    setReviewSlot(slot)
  }, [])

  const handlePipDragStateChange = useCallback((state: PipDragUiState) => {
    setPipDragState((prev) => {
      if (
        prev.isDragging === state.isDragging &&
        prev.isArming === state.isArming &&
        prev.overDelete === state.overDelete
      ) {
        return prev
      }
      return state
    })
  }, [])

  const handleExpandBenchmark = useMemo(
    () =>
      libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake)
        ? () => handleOpenCompareReview('benchmark')
        : undefined,
    [benchmarkTake, handleOpenCompareReview, libraryBenchmarkPlayback]
  )

  const handleExpandChallenger = useMemo(
    () =>
      takeHasPlaybackMedia(challengerTake)
        ? () => handleOpenCompareReview('challenger')
        : undefined,
    [challengerTake, handleOpenCompareReview]
  )

  const prevBenchmarkIdRef = useRef<string | null>(null)
  const prevChallengerIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const benchmarkChanged = benchmarkId !== prevBenchmarkIdRef.current
    const challengerChanged = challengerId !== prevChallengerIdRef.current
    const prevBenchmark = prevBenchmarkIdRef.current
    const prevChallenger = prevChallengerIdRef.current
    prevBenchmarkIdRef.current = benchmarkId
    prevChallengerIdRef.current = challengerId

    if (benchmarkChanged && prevBenchmark !== null && benchmarkId !== null) {
      resetVideoPlayback(benchmarkPipVideoRef.current)
    }

    if (
      challengerChanged &&
      prevChallenger !== null &&
      challengerId !== null &&
      autoPlaybackTakeId === null
    ) {
      resetVideoPlayback(challengerPipVideoRef.current)
    }
  }, [autoPlaybackTakeId, benchmarkId, challengerId])

  const handleHandsFreeBackgroundPlaybackChange = useCallback(
    (playing: boolean) => {
      if (!autoPlaybackTakeId) return
      if (playing) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        setAutoPlaybackPlaying(true)
      } else {
        setAutoPlaybackPlaying(false)
      }
    },
    [autoPlaybackTakeId]
  )

  const handleChallengerAutoPlayComplete = useCallback(() => {
    finishAutoPlayback()
  }, [finishAutoPlayback])

  const handleChallengerPlaybackChange = useCallback((playing: boolean) => {
    setChallengerPipPlaying(playing)
  }, [])

  const handleSubmitYoutube = useCallback((embedUrl: string) => {
    if (activeProjectIdRef.current) {
      try { selectPracticeReference(activeProjectIdRef.current, embedUrl) }
      catch { setTakeDeleteError('Reference loaded, but it could not be remembered for this focus.') }
    }
    setFocusedReferenceTakeId(null)
    if (focusedPracticeRef.current) {
      showTakeCardsRef.current = true
      updateSettings({ showTakeCards: true })
      if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
    }
    pausePipVideos()
    prepareNewYoutubeReference({ autoplay: !focusedPracticeRef.current })
    setYoutubeAutoPlayOnLoad(!focusedPracticeRef.current)
    setYoutubeUrl(embedUrl)
    setYoutubeReferenceEnabled(true)
    setYoutubeHeadphonesTipNonce((current) => current + 1)
    setShowYoutubeHeadphonesTip(!focusedPracticeRef.current)
    setYoutubeExpandTipNonce((current) => current + 1)
    setShowYoutubeExpandTip(!focusedPracticeRef.current)
  }, [handleAudioPracticeTabChange, pausePipVideos, updateSettings])

  const handleClearYoutube = useCallback(() => {
    if (activeProjectIdRef.current) {
      try { selectPracticeReference(activeProjectIdRef.current, null) }
      catch { setTakeDeleteError('The reference could not be forgotten. Please try again.') }
    }
    pauseYoutubeProxy(youtubeIframeRef.current)
    prepareNewYoutubeReference()
    setYoutubeUrl(null)
    setYoutubeHostEl(null)
    setShowYoutubeHeadphonesTip(false)
    setShowYoutubeExpandTip(false)
    setYoutubeReferenceEnabled(false)
    resetYoutubePlayAlongRouteFailure()
    stopYoutubePlayAlongDiagnostics()
    stabilizeViewportAfterMediaInteraction()
  }, [])

  /* ---- Daily routine engine ----------------------------------------------
   * Starting a step is the one place that turns a checklist line into a room:
   * the desk is applied, the surface opens, and the reference is fetched. */

  const ensureRoutineDay = useCallback((target: Routine): RoutineDay => {
    const current = routineDayRef.current
    if (current && current.date === todayKey() && current.routineId === target.id) return current
    return freshRoutineDay(target.id)
  }, [])

  // The card is for today. Opening the hub on a new day starts a fresh one.
  useEffect(() => {
    if (!isPracticeHubOpen) return
    const target = routineRef.current
    if (!target) return
    const next = ensureRoutineDay(target)
    if (next !== routineDayRef.current) setRoutineDay(next)
  }, [ensureRoutineDay, isPracticeHubOpen])

  const handleSaveRoutine = useCallback(
    (next: Routine) => {
      triggerLightHaptic(settings.hapticFeedback)
      for (const step of next.steps) {
        const previous = routineRef.current?.steps.find(item => item.id === step.id)
        if (step.projectId && step.desk && JSON.stringify(previous?.desk) !== JSON.stringify(step.desk)) {
          saveFocusDesk(step.projectId, step.desk)
        }
      }
      setRoutine(next)
      setRoutineDay((current) => {
        const base =
          current && current.date === todayKey() && current.routineId === next.id
            ? current
            : freshRoutineDay(next.id)
        return reconcileDay(base, next)
      })
      setRoutineBuilderRequest(null)
    },
    [settings.hapticFeedback],
  )

  const handleDeleteRoutine = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setRoutine(null)
    setRoutineDay(null)
    setRoutineBuilderRequest(null)
    setRoutineFocusRequest(null)
  }, [settings.hapticFeedback])

  const handleOpenRoutineBuilder = useCallback(
    (mode: RoutineBuilderMode) => {
      setRoutineBuilderRequest(mode)
      if (!isPracticeHubOpen) handleOpenPracticeHome()
    },
    [handleOpenPracticeHome, isPracticeHubOpen],
  )

  /** A saved choice restores automatically; a new reference needs a deliberate choice. */
  const autoLoadRoutineReference = useCallback(
    async (projectId: string, query: string) => {
      if (!query.trim() || getSelectedReferenceUrl(projectId)) return
      if (activeProjectIdRef.current === projectId) setFocusPanel('references')
    },
    [],
  )

  const handleStartRoutineStep = useCallback(
    async (stepId: string) => {
      const target = routineRef.current
      const step = target?.steps.find((item) => item.id === stepId)
      if (!target || !step) return
      triggerLightHaptic(settings.hapticFeedback)

      const day = ensureRoutineDay(target)
      const now = Date.now()
      setRoutineDay({
        ...day,
        activeStepId: step.id,
        activeStepStartedAt: day.activeStepId === step.id ? day.activeStepStartedAt ?? now : now,
        startedAt: day.startedAt ?? now,
        doneStepIds: day.doneStepIds.filter((id) => id !== step.id),
        skippedStepIds: day.skippedStepIds.filter((id) => id !== step.id),
        completedAt: null,
      })
      setRoutineBarExpanded(false)
      setRoutineFocusRequest(null)

      setIsSettingsOpen(false)
      setIsVaultOpen(false)
      setQuickSettingsOpen(false)
      setShowPitch(false)

      if (focusedPracticeRef.current && liveDeskSnapshotRef.current) {
        saveFocusDesk(focusedPracticeRef.current.projectId, liveDeskSnapshotRef.current)
      }
      // Every exercise shares a durable practice item, whichever tool it opens.
      let itemProjectId = step.projectId
      if (step.kind !== 'game' && step.kind !== 'free') {
        const available = await listProjects()
        const existing = available.find(project => project.id === itemProjectId)
          ?? available.find(project => project.name.trim().toLocaleLowerCase() === step.title.trim().toLocaleLowerCase())
        const project = existing ?? await createProject(step.title)
        itemProjectId = project.id
        if (!existing) setProjects(current => [project, ...current])
        if (step.projectId !== project.id) {
          const updated = { ...target, updatedAt: Date.now(), steps: target.steps.map(item => item.id === step.id ? { ...item, projectId: project.id } : item) }
          saveRoutine(updated)
          routineRef.current = updated
          setRoutine(updated)
        }
        if (!loadFocusDesk(project.id) && step.desk) saveFocusDesk(project.id, step.desk)
        await handleStartFocusedPractice(project.id)
      }

      switch (step.kind) {
        case 'tune':
        case 'metro': {
          setLabsRoute(null)
          handleRecordingModeChange('audio')
          handleAudioPracticeTabChange(step.kind === 'tune' ? 'tuner' : 'metronome')
          const desk = itemProjectId ? loadFocusDesk(itemProjectId) : step.desk
          if (desk) applyDeskSnapshot({ ...desk, mode: 'audio' })
          break
        }
        case 'record': {
          setLabsRoute(null)
          if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
          break
        }
        case 'focus': {
          setLabsRoute(null)
          if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
          break
        }
        case 'game': {
          handleOpenQuickPractice()
          setFocusedPostTakeId(null)
          handleRecordingModeChange('audio')
          setLabsRoute(step.gameRoute ?? 'menu')
          break
        }
        case 'free':
          handleOpenQuickPractice()
          setFocusedPostTakeId(null)
          break
      }

      // The click runs when the step asks for it, and stops when it does not.
      const runningDesk = itemProjectId ? loadFocusDesk(itemProjectId) : step.desk
      if (runningDesk && step.kind !== 'game' && step.kind !== 'free') {
        if (runningDesk.showMetronome) void sharedMetronomeEngine.start()
        else sharedMetronomeEngine.stop()
      }

      dismissPracticeHub()
      deferHudMediaPause()
      if (itemProjectId && step.referenceQuery) void autoLoadRoutineReference(itemProjectId, step.referenceQuery)
    },
    [
      applyDeskSnapshot,
      autoLoadRoutineReference,
      deferHudMediaPause,
      dismissPracticeHub,
      ensureRoutineDay,
      handleAudioPracticeTabChange,
      handleOpenPracticeHome,
      handleOpenQuickPractice,
      handleRecordingModeChange,
      handleStartFocusedPractice,
      isPracticeHubOpen,
      projects,
      settings.hapticFeedback,
    ],
  )

  /** A focus step meets its practice item for the first time. */
  const handleBindRoutineFocus = useCallback(
    async (projectId: string) => {
      const request = routineFocusRequest
      if (!request) return
      setRoutineFocusRequest(null)
      setRoutine((current) => {
        if (!current) return current
        return {
          ...current,
          updatedAt: Date.now(),
          steps: current.steps.map((step) =>
            step.id === request.stepId ? { ...step, projectId } : step,
          ),
        }
      })
      // The ref is read by handleStartRoutineStep; make sure it sees the binding.
      const target = routineRef.current
      if (target) {
        routineRef.current = {
          ...target,
          steps: target.steps.map((step) =>
            step.id === request.stepId ? { ...step, projectId } : step,
          ),
        }
      }
      await handleStartRoutineStep(request.stepId)
    },
    [handleStartRoutineStep, routineFocusRequest],
  )

  const settleRoutineStep = useCallback(
    (stepId: string, outcome: 'done' | 'skipped') => {
      const target = routineRef.current
      if (!target) return
      const day = ensureRoutineDay(target)
      const doneStepIds = day.doneStepIds.filter((id) => id !== stepId)
      const skippedStepIds = day.skippedStepIds.filter((id) => id !== stepId)
      if (outcome === 'done') doneStepIds.push(stepId)
      else skippedStepIds.push(stepId)
      const nextDay: RoutineDay = {
        ...day,
        doneStepIds,
        skippedStepIds,
        activeStepId: null,
        activeStepStartedAt: null,
        startedAt: day.startedAt ?? Date.now(),
      }
      const next = nextOpenStep(target, nextDay, stepId)
      if (!next) {
        if (focusedPracticeRef.current && liveDeskSnapshotRef.current) saveFocusDesk(focusedPracticeRef.current.projectId, liveDeskSnapshotRef.current)
        const sessionId = focusedPracticeSessionIdRef.current
        setFocusedPractice(null)
        setFocusedPracticeSessionId(null)
        setFocusedPostTakeId(null)
        if (sessionId) void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Your takes are saved. Could not close the practice sitting.'))
        nextDay.completedAt = Date.now()
        setRoutineDay(nextDay)
        sharedMetronomeEngine.stop()
        // The board shows the summary; the recorder stays as it was.
        if (!isPracticeHubOpen) handleOpenRoutineToday()
        return
      }
      setRoutineDay(nextDay)
      void handleStartRoutineStep(next.id).catch(() => {
        setTakeDeleteError('Could not open the next item. Your progress is saved; try again from Today.')
        handleOpenRoutineToday()
      })
    },
    [ensureRoutineDay, handleOpenRoutineToday, handleStartRoutineStep, isPracticeHubOpen],
  )

  const handleCompleteRoutineStep = useCallback(
    (stepId: string) => {
      triggerSuccessHaptic(settings.hapticFeedback)
      settleRoutineStep(stepId, 'done')
    },
    [settings.hapticFeedback, settleRoutineStep],
  )

  const handleSkipRoutineStep = useCallback(
    (stepId: string) => {
      triggerLightHaptic(settings.hapticFeedback)
      settleRoutineStep(stepId, 'skipped')
    },
    [settings.hapticFeedback, settleRoutineStep],
  )

  /** Tapping the circle on the board: check or uncheck without opening anything. */
  const handleToggleRoutineStep = useCallback(
    (stepId: string) => {
      const target = routineRef.current
      if (!target) return
      triggerLightHaptic(settings.hapticFeedback)
      const day = ensureRoutineDay(target)
      const wasDone = day.doneStepIds.includes(stepId)
      const doneStepIds = wasDone
        ? day.doneStepIds.filter((id) => id !== stepId)
        : [...day.doneStepIds, stepId]
      const skippedStepIds = day.skippedStepIds.filter((id) => id !== stepId)
      const nextDay: RoutineDay = {
        ...day,
        doneStepIds,
        skippedStepIds,
        activeStepId: day.activeStepId === stepId ? null : day.activeStepId,
        activeStepStartedAt: day.activeStepId === stepId ? null : day.activeStepStartedAt,
        startedAt: day.startedAt ?? (wasDone ? null : Date.now()),
      }
      nextDay.completedAt = routineProgress(target, nextDay).complete ? nextDay.completedAt ?? Date.now() : null
      setRoutineDay(nextDay)
    },
    [ensureRoutineDay, settings.hapticFeedback],
  )

  /** Leave the routine where it is; the step stays checkable from the board. */
  const handlePauseRoutine = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setRoutineDay((current) =>
      current ? { ...current, activeStepId: null, activeStepStartedAt: null } : current,
    )
  }, [settings.hapticFeedback])

  const routineActiveStep = useMemo(() => {
    if (!routine || !routineDay?.activeStepId) return null
    return routine.steps.find((step) => step.id === routineDay.activeStepId) ?? null
  }, [routine, routineDay?.activeStepId])

  const routineNextStep = useMemo(() => {
    if (!routine || !routineActiveStep) return null
    return nextOpenStep(routine, routineDay, routineActiveStep.id)
  }, [routine, routineActiveStep, routineDay])

  const routineStepIndex = routine && routineActiveStep
    ? routine.steps.findIndex((step) => step.id === routineActiveStep.id) + 1
    : 0

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((current) => {
      const next = !current
      if (next && youtubeUrlRef.current) {
        window.requestAnimationFrame(() => {
          wakeYoutubeReference(youtubeIframeRef.current, {
            attemptPlay: false,
            uiVolume: 1,
          })
        })
      }
      if (next && isNativeCameraPlatform && recordingModeRef.current === 'video') {
        void acquireNativeVideoBridge()
      }
      if (!next) {
        window.requestAnimationFrame(() => {
          recoverCameraAfterSurfaceDismiss('split-close')
        })
      }
      return next
    })
  }, [acquireNativeVideoBridge, isNativeCameraPlatform, recoverCameraAfterSurfaceDismiss])

  const handleExitSplitView = useCallback(() => {
    setIsSplitView(false)
    window.requestAnimationFrame(() => {
      recoverCameraAfterSurfaceDismiss('split-exit')
    })
  }, [recoverCameraAfterSurfaceDismiss])

  const showPinCurrentAsBest = Boolean(
    takeHasPlaybackMedia(challengerTake) &&
      challengerId &&
      challengerId !== benchmarkId
  )

  const handlePinCurrentAsBest = useCallback(() => {
    if (!challengerId) return
    handlePinBenchmark(challengerId)
  }, [challengerId, handlePinBenchmark])

  const pipScaleStyle = {
  } as React.CSSProperties

  const tutorialSignals = useMemo(
    () => ({
      isRecording,
      hasCurrentTake: Boolean(challengerId && challengerTake),
      isReviewOpen,
      isVaultOpen,
      isSettingsOpen,
      isSplitView,
      autoSoundRecording: settings.autoSoundRecording,
      recordingMode,
      audioPracticeTab,
    }),
    [
      audioPracticeTab,
      challengerId,
      challengerTake,
      isRecording,
      isReviewOpen,
      isSettingsOpen,
      isSplitView,
      isVaultOpen,
      recordingMode,
      settings.autoSoundRecording,
    ]
  )

  return (
    <PracticeReferenceContext.Provider value={{ projectId: activeProjectId ?? undefined, query: routineActiveStep?.referenceQuery || activeProject?.name || '', autoSearch: Boolean(routineActiveStep?.referenceQuery) }}>
    <TutorialProvider
      active={showOnboardingTutorial || isPracticeHubOpen}
      enabled={tutorialTourEnabled}
      signals={tutorialSignals}
      onComplete={() => setTutorialTourEnabled(false)}
    >
      <ActionSheetProvider>
        <MetronomeProvider
          isTakePlaying={takePlaybackActive}
          muteDuringPlayback={settings.muteMetronomeDuringPlayback}
        >
          <AudioModePlaybackProvider
            onBeforePlay={handleAudioModeBeforePlaybackStart}
            onPlaybackActiveChange={handleAudioModePlaybackActiveChange}
          >
            <div
              ref={appShellRef}
              className={`app-shell${recordingMode === 'audio' ? ' app-shell--audio-mode' : ''}${
                isSplitView ? ' app-shell--split-open' : ''
              }`}
            >
              <audio
                ref={autoPlaybackAudioRef}
                className="sr-only"
                preload="none"
                playsInline
                {...({
                  'webkit-playsinline': 'true',
                } as React.AudioHTMLAttributes<HTMLAudioElement>)}
              />

              {focusPanel === 'references' && <YoutubeUrlDialog open onClose={() => setFocusPanel(null)} onSubmit={handleSubmitYoutube} />}
              {focusPanel === 'history' && focusedPractice && <FocusedPracticeHistory
                name={focusedPractice.focusArea} takes={takes}
                onClose={() => setFocusPanel(null)}
                onListen={(take) => {
                  setFocusPanel(null)
                  handleOpenVaultTake(take)
                }}
                onCompare={(takeId, referenceId) => {
                  setFocusPanel(null)
                  pauseYoutubeProxy(youtubeIframeRef.current)
                  setYoutubeUrl(null)
                  setFocusedReferenceTakeId(referenceId)
                  challengerUserDismissedRef.current = false
                  setChallengerId(takeId)
                  handleOpenCompareReview('challenger')
                }}
              />}
              <PracticeHub
                isOpen={isPracticeHubOpen}
                projects={projects}
                activeProject={activeProject}
                takes={takes}
                bestTakeHistory={bestTakeHistory}
                focusedPractice={focusedPractice}
                practiceItemStates={practiceItemStates}
                focusDeskSummary={focusDeskSummary}
                tunerInstrument={settings.tunerInstrument}
                tunerTransposition={settings.tunerTransposition}
                hapticFeedback={settings.hapticFeedback}
                onClose={handleClosePracticeHub}
                onOpenQuickPractice={() => { handlePauseRoutine(); handleOpenQuickPractice() }}
                onStartFocusedPractice={(projectId) => { handlePauseRoutine(); return handleStartFocusedPractice(projectId) }}
                onResumeFocusedPractice={(projectId) => { handlePauseRoutine(); return handleResumeFocusedPractice(projectId) }}
                onCreatePracticeItem={handleCreateProject}
                onOpenGames={handleOpenPracticeGames}
                onOpenVault={handleOpenVaultFromPracticeHub}
                onOpenTuner={handleOpenFullTunerFromPracticeHub}
                onOpenMetronome={handleOpenFullMetronomeFromPracticeHub}
                routine={routine}
                routineDay={routineDay}
                routineBuilderRequest={routineBuilderRequest}
                routineFocusRequest={routineFocusRequest}
                instrumentId={preferredInstrumentId}
                liveDeskSnapshot={liveDeskSnapshot}
                onStartRoutineStep={handleStartRoutineStep}
                onToggleRoutineStep={handleToggleRoutineStep}
                onOpenRoutineBuilder={handleOpenRoutineBuilder}
                onCloseRoutineBuilder={() => setRoutineBuilderRequest(null)}
                onSaveRoutine={handleSaveRoutine}
                onDeleteRoutine={handleDeleteRoutine}
                onBindRoutineFocus={handleBindRoutineFocus}
                onCancelRoutineFocus={() => setRoutineFocusRequest(null)}
              />

              {routine &&
                routineActiveStep &&
                !isPracticeHubOpen &&
                !isReviewOpen &&
                !isVaultOpen &&
                !isSettingsOpen &&
                focusPanel === null &&
                !showOnboardingTutorial &&
                !isRecording &&
                !isStopping && (
                  <RoutineBar
                    step={routineActiveStep}
                    stepIndex={routineStepIndex}
                    stepCount={routine.steps.length}
                    nextStep={routineNextStep}
                    startedAt={routineDay?.activeStepStartedAt ?? null}
                    expanded={routineBarExpanded}
                    audioSurface={recordingMode === 'audio' && !isLabsOpen}
                    overLabs={isLabsOpen}
                    tunerTransposition={settings.tunerTransposition}
                    hapticFeedback={settings.hapticFeedback}
                    onExpandedChange={setRoutineBarExpanded}
                    onDone={() => handleCompleteRoutineStep(routineActiveStep.id)}
                    onSkip={() => handleSkipRoutineStep(routineActiveStep.id)}
                    onOpenToday={handleOpenRoutineToday}
                    onPause={handlePauseRoutine}
                    onReferences={focusedPractice ? () => { deferHudMediaPause(); setFocusPanel('references') } : undefined}
                    onHistory={focusedPractice ? () => { deferHudMediaPause(); setFocusPanel('history') } : undefined}
                    onAdjustment={focusedPractice ? () => setFocusedCueOpen(true) : undefined}
                  />
                )}

              {focusedPractice &&
                focusedPracticeState &&
                !isPracticeHubOpen &&
                focusPanel === null &&
                !isReviewOpen &&
                !isExperimentalOpen &&
                !isRecording &&
                !isStopping && (
                  <FocusedPracticeCue
                    open={focusedCueOpen}
                    value={focusedPracticeState.pendingIntention}
                    hapticFeedback={settings.hapticFeedback}
                    onOpenChange={(open) => {
                      setFocusedCueOpen(open)
                      // Closing the note attaches it to the take you just heard —
                      // a reflection, not just a cue queued for next time.
                      if (!open && focusedPostTakeId) {
                        const reflection = focusedPracticeState.pendingIntention.trim()
                        if (reflection) handleUpdateTake(focusedPostTakeId, { notes: reflection })
                      }
                    }}
                    onChange={handleFocusedPracticeIntentionChange}
                  />
                )}

              {takeDeleteError && (
                <div
                  role="alert"
                  className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[220] flex w-[min(92vw,24rem)] -translate-x-1/2 items-start gap-3 rounded-md border border-white/15 bg-black/95 px-4 py-3 text-left text-sm text-white shadow-2xl"
                >
                  <span className="min-w-0 flex-1 leading-5">{takeDeleteError}</span>
                  <button
                    type="button"
                    onClick={() => setTakeDeleteError(null)}
                    className="min-h-11 shrink-0 px-2 font-semibold text-white/80"
                    aria-label="Dismiss message"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {youtubeUrl && (
                <YoutubeBenchmarkPlayer
                  embedUrl={youtubeUrl}
                  autoPlayOnLoad={youtubeAutoPlayOnLoad}
                  hostEl={youtubeHostEl}
                  iframeRef={youtubeIframeRef}
                />
              )}

              <AnimatePresence>
                {(showYoutubeHeadphonesTip || (showYoutubeExpandTip && !isSplitView)) && (
                  <motion.div
                    key="youtube-tips-stack"
                    className="youtube-tips-stack pointer-events-none fixed inset-0 z-[130] flex flex-col items-center justify-center gap-2 px-4"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={iosHudDim}
                    style={motionGpuLayer}
                  >
                    {showYoutubeHeadphonesTip && (
                      <motion.div
                        key={`youtube-headphones-tip-${youtubeHeadphonesTipNonce}`}
                        className="youtube-headphones-tip pointer-events-none flex w-full justify-center"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={iosHudDim}
                      >
                        <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-[rgba(255,255,255,0.24)] bg-[rgba(20,24,31,0.86)] px-4 py-3 text-white shadow-[0_18px_36px_rgba(8,10,14,0.24)] backdrop-blur-xl">
                          <div className="mt-0.5 rounded-full bg-white/12 p-2">
                            <Headphones className="h-4 w-4" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-white/72">
                              YouTube Tip
                            </p>
                            <p className="mt-1 text-sm leading-snug text-white/92">
                              Headphones work best for YouTube play-alongs.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              triggerLightHaptic()
                              setShowYoutubeHeadphonesTip(false)
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/72"
                            aria-label="Dismiss YouTube tip"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {showYoutubeExpandTip && !isSplitView && (
                      <motion.div
                        key={`youtube-expand-tip-${youtubeExpandTipNonce}`}
                        className="youtube-expand-tip pointer-events-none flex w-full justify-center"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={iosHudDim}
                      >
                        <div className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-[rgba(255,255,255,0.24)] bg-[rgba(20,24,31,0.86)] px-4 py-3 text-white shadow-[0_18px_36px_rgba(8,10,14,0.24)] backdrop-blur-xl">
                          <div className="mt-0.5 rounded-full bg-white/12 p-2">
                            <Maximize2 className="h-4 w-4" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-white/72">
                              YouTube Tip
                            </p>
                            <p className="mt-1 text-sm leading-snug text-white/92">
                              Expand view is recommended for YouTube play-along.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              triggerLightHaptic()
                              setShowYoutubeExpandTip(false)
                            }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/72"
                            aria-label="Dismiss expand view tip"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isRecording &&
                  (youtubePlayAlongUi.showTapToResume ||
                    youtubePlayAlongUi.routeFailureMessage) && (
                    <motion.div
                      key="youtube-play-along-recording-ui"
                      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[125] flex justify-center px-4"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={iosHudDim}
                    >
                      <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
                        {youtubePlayAlongUi.routeFailureMessage && (
                          <div className="rounded-2xl border border-amber-300/30 bg-[rgba(28,22,12,0.9)] px-4 py-3 text-sm leading-snug text-amber-50/95 shadow-[0_18px_36px_rgba(8,10,14,0.24)] backdrop-blur-xl">
                            {youtubePlayAlongUi.routeFailureMessage}
                          </div>
                        )}
                        {youtubePlayAlongUi.showTapToResume && (
                          <button
                            type="button"
                            onClick={() => {
                              triggerLightHaptic()
                              resumeYoutubePlayAlong(youtubeIframeRef.current)
                            }}
                            className="rounded-2xl border border-white/20 bg-[rgba(20,24,31,0.92)] px-4 py-3 text-sm font-medium text-white shadow-[0_18px_36px_rgba(8,10,14,0.24)] backdrop-blur-xl"
                          >
                            Tap to resume play-along
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>

              {isAudioPracticeMetronomeTab && (
                <div className="audio-practice-metronome-scrim pointer-events-none" aria-hidden />
              )}

              <LiveCameraBackground
                previewRef={previewRef}
                streamRef={streamRef}
                streamGeneration={streamGeneration}
                recordingMode={recordingMode}
                isRecording={isRecording}
                holdPreviewForTakePlayback={shouldHoldCameraPreviewForTakePlayback}
                resumeNonce={cameraResumeNonce}
                modePreparing={
                  isPreviewRecovering || (!ready && !isRecording && !cameraNeedsPermission)
                }
                pitchStageActive={
                  isAudioPracticeTunerTab || (showPitch && mainVideoPitchSource !== null)
                }
                metronomeStageActive={metronomeStageActive}
                audioPracticeOverlayActive={
                  isAudioPracticeToolTab ||
                  (recordingMode === 'audio' && audioPracticeTab === 'audio' && !isSplitView)
                }
                visuallySuppressed={isSplitView}
                nativeLivePreviewActive={nativeLivePreviewActive}
                pauseNativePreviewUpdates={hudModalState === 'review' || isVaultOpen}
                nativeCameraBridgeEnabled={isNativeCameraPlatform}
                nativeLivePreviewSeedUrl={nativeLivePreviewSeedUrl}
                handsFreePlaybackTakeId={handsFreeBackgroundTake?.id ?? null}
                handsFreePlaybackSrc={handsFreeBackgroundPlaybackSrc}
                handsFreePlaybackPerformanceStartSeconds={
                  handsFreeBackgroundTake?.performanceStartSeconds
                }
                handsFreePlaybackTailSkipSeconds={settings.soundSilenceSeconds}
                onHandsFreePlaybackPlayingChange={handleHandsFreeBackgroundPlaybackChange}
                onHandsFreePlaybackComplete={handleChallengerAutoPlayComplete}
              />

              {cameraNeedsPermission && !SKIP_MEDIA_PERMISSION_GATE && (
                <CameraPermissionPrompt
                  recordingMode={recordingMode}
                  requesting={cameraPermissionRequestInFlight}
                  blocked={cameraPermissionBlocked}
                  onRequestPermission={requestCameraAccess}
                  onOpenSettings={() => {
                    void BestTakeAudioPlugin.openAppSettings().catch((error) => {
                      console.warn('Could not open iOS Settings', error)
                    })
                  }}
                />
              )}

              <div
                className={`pitch-display-layer${
                  pitchHudSuspended ? ' floating-widget-layer--inert' : ''
                }`}
                aria-hidden={!showFloatingMainPitch || pitchHudSuspended}
              >
                {showMainPitchWidget && (
                  <Suspense fallback={null}>
                    <AnimatePresence>
                      {showFloatingMainPitch && (
                        <DraggablePitchWidget
                          boundaryRef={appShellRef}
                          mediaRef={mainAudioPitchSource.mediaRef}
                          enabled={pitchTrackerActive && !pitchHudSuspended}
                          isPlaying={mainAudioPitchSource.isPlaying}
                          mediaKey={mainAudioPitchSource.mediaKey}
                          takeName={mainAudioPitchSource.take?.name}
                          label={mainAudioPitchSource.liveMicOnly ? 'Live Tuner' : 'Live Pitch'}
                          isAudioMode
                          liveMicEnabled={
                            (settings.liveMicTunerEnabled ||
                              mainAudioPitchSource.liveMicOnly === true) &&
                            !handsFreePlaybackPending &&
                            !autoPlaybackPlaying
                          }
                          micStreamRef={streamRef}
                          layoutRegion="main"
                          liveMicOnly={mainAudioPitchSource.liveMicOnly === true}
                          tunerInstrument={settings.tunerInstrument}
                          tunerTransposition={settings.tunerTransposition}
                          onClose={handleClosePitch}
                        />
                      )}
                    </AnimatePresence>
                  </Suspense>
                )}
              </div>

              <div
                className={`metronome-display-layer${
                  metronomeWidgetInteractive ? '' : ' floating-widget-layer--inert'
                }`}
                aria-hidden={!metronomeWidgetInteractive}
              >
                {showFloatingMetronomeWidget && (
                  <Suspense fallback={null}>
                    <AnimatePresence>
                      {/* One mount, one position, both surfaces. Keying these by
                          recording mode tore the widget down and built it again on
                          every Camera ↔ Tools crossing: it replayed its entry spring
                          at a different saved position while the surface underneath
                          was still rebuilding, which is what read as lag. Staying put
                          is also what the desk is supposed to do. */}
                      <DraggableMetronomeWidget
                        boundaryRef={appShellRef}
                        positionId="desk-metronome"
                        defaultTopOffset={deskWidgetTopOffset}
                        isTakePlaying={takePlaybackActive}
                        muteDuringPlayback={settings.muteMetronomeDuringPlayback}
                        onClose={handleCloseMetronome}
                      />
                    </AnimatePresence>
                  </Suspense>
                )}
              </div>

              <div
                className={`drone-display-layer${
                  droneWidgetInteractive ? '' : ' floating-widget-layer--inert'
                }`}
                aria-hidden={!droneWidgetInteractive}
              >
                {showFloatingDroneWidget && (
                  <Suspense fallback={null}>
                    <AnimatePresence>
                      <DraggableDroneWidget
                        boundaryRef={appShellRef}
                        positionId="desk-drone"
                        defaultTopOffset={deskWidgetTopOffset + 158}
                        droneWaveform={settings.droneWaveform}
                        tunerTransposition={settings.tunerTransposition}
                        hapticFeedback={settings.hapticFeedback}
                        isTakePlaying={takePlaybackActive}
                        muteDuringPlayback={settings.muteMetronomeDuringPlayback}
                        onClose={handleCloseDrone}
                      />
                    </AnimatePresence>
                  </Suspense>
                )}
              </div>

              {/* Sibling of the rotator, not a child: `.app-ui-rotator` is a
                  positioned z-10 element, so anything nested inside it is
                  clamped to that plane and the z-36 metronome layer would paint
                  over the hands-free overlay. */}
              <HandsFreeStage
                phase={handsFreeStageVisiblePhase}
                elapsed={elapsed}
                onLightBackground={recordingMode === 'audio'}
                placement={handsFreeStagePlacement}
                onTapForSettings={() => setHandsFreeCardOpen(true)}
              />
              <HandsFreeSettingsCard
                open={handsFreeCardOpen && hudModalState === 'idle'}
                silenceSeconds={settings.soundSilenceSeconds}
                volumeThreshold={settings.soundVolumeThreshold}
                hapticFeedback={settings.hapticFeedback}
                onSilenceSecondsChange={(soundSilenceSeconds) =>
                  updateSettings({ soundSilenceSeconds })
                }
                onVolumeThresholdChange={(soundVolumeThreshold) =>
                  updateSettings({ soundVolumeThreshold })
                }
                onClose={() => setHandsFreeCardOpen(false)}
              />
              <div id={PHYSICAL_UI_ROOT_ID} className="app-ui-rotator">
                {showMainPitchWidget && mainVideoPitchSource && (
                  <Suspense fallback={null}>
                    <AnimatePresence>
                      {showPitch && mainVideoPitchSource && (
                        <div
                          className={
                            pitchHudSuspended
                              ? 'floating-widget-layer--inert fixed inset-0 z-[5]'
                              : 'contents'
                          }
                        >
                          <DraggablePitchWidget
                            boundaryRef={appShellRef}
                            mediaRef={mainVideoPitchSource.mediaRef}
                            enabled={pitchTrackerActive && !pitchHudSuspended}
                            isPlaying={mainVideoPitchSource.isPlaying}
                            mediaKey={mainVideoPitchSource.mediaKey}
                            label="Live Pitch"
                            pitchSource="microphone"
                            micStreamRef={streamRef}
                            layoutRegion="main"
                            positionId="main-pitch-video"
                            tunerInstrument={settings.tunerInstrument}
                            tunerTransposition={settings.tunerTransposition}
                            onClose={handleClosePitch}
                          />
                        </div>
                      )}
                    </AnimatePresence>
                  </Suspense>
                )}

                <motion.div
                  className={`app-ui-overlay ${
                    recordingMode === 'audio' ? 'app-ui-overlay--audio-mode' : ''
                  } ${pitchAudioHudLock ? 'app-ui-overlay--pitch-hud-lock' : ''} ${
                    metronomeAudioHudLock ? 'app-ui-overlay--metronome-hud-lock' : ''
                  } ${audioToolHudLock ? 'app-ui-overlay--audio-tool-hud-lock' : ''} ${
                    quickSettingsOpen ? 'app-ui-overlay--quick-settings' : ''
                  } ${showOnboardingTutorial ? 'app-ui-overlay--tutorial' : ''} ${
                    audioPracticeSheetOpen ? 'app-ui-overlay--sheet-open' : ''
                  } ${isReviewOpen ? 'app-ui-overlay--review-open' : ''} ${
                    isSplitView ? 'app-ui-overlay--split-open' : ''
                  } ${multitrackOpen ? 'app-ui-overlay--multitrack-open' : ''
                  } ${
                    isAudioPracticeMetronomeTab ? 'app-ui-overlay--audio-practice-metronome' : ''
                  } ${isAudioPracticeTunerTab ? 'app-ui-overlay--audio-practice-tuner' : ''} ${
                    isAudioPracticeRecordTab && !isSplitView
                      ? 'app-ui-overlay--audio-practice-record'
                      : ''
                  } ${
                    isAudioPracticeTunerTab && !showTunerTakePills
                      ? 'app-ui-overlay--tuner-takes-hidden'
                      : ''
                  } ${
                    isAudioPracticeTimelineTab
                      ? 'app-ui-overlay--audio-practice-timeline app-ui-overlay--audio-practice-metronome'
                      : ''
                  } ${practiceSessionActive ? 'app-ui-overlay--practice-session-active' : ''} ${
                    practiceSessionActive && practiceRecordingControlsExpanded
                      ? 'app-ui-overlay--practice-recorder-expanded'
                      : ''
                  }`}
                  aria-hidden={hudModalState === 'review'}
                  animate={{
                    opacity: hudModalState === 'review' ? 0 : 1,
                    scale: hudModalState === 'review' ? 0.94 : 1,
                  }}
                  transition={iosHudDim}
                  style={{
                    ...motionGpuLayer,
                    pointerEvents: audioPracticeSheetOpen
                      ? 'none'
                      : overlayPointerCapture
                      ? 'auto'
                      : hudModalState !== 'idle' && !showOnboardingTutorial
                      ? 'none'
                      : undefined,
                  }}
                >
                  {focusedPractice && isRecording && !isSplitView && !quickSettingsOpen && (
                    <div className="session-line" aria-live="polite">
                      <span className="session-line__pill">
                        <span className="session-line__focus">{focusedPractice.focusArea}</span>
                        <span className="session-line__take">
                          {focusedTakeCount === 0 ? 'first take' : `take ${focusedTakeCount}`}
                        </span>
                      </span>
                    </div>
                  )}

                  {recordingMode === 'audio' && !practiceSessionActive && !isSplitView && (
                    <div data-tutorial="audio-mode-tabs">
                      <AudioPracticeTopTabs
                        activeTab={audioPracticeTab}
                        onTabChange={handleAudioPracticeTabChange}
                      />
                    </div>
                  )}

                  {recordingMode === 'audio' && !isSplitView && (
                    <div className="relative flex min-h-0 flex-1 overflow-hidden">
                      <AnimatedTabPanel
                        panelKey="audio-practice-metronome-layer"
                        active={audioPracticeTab === 'metronome'}
                        className="audio-practice-metronome-layer flex min-h-0 flex-1 flex-col"
                        dataTutorial="audio-metronome-tab"
                      >
                        <AudioMetronomeTab
                          key="audio-metronome-tab"
                          onOpenProgram={handleOpenProgram}
                        />
                      </AnimatedTabPanel>

                      <AnimatedTabPanel
                        panelKey="audio-practice-timeline-layer"
                        active={isAudioPracticeTimelineTab}
                        className="audio-practice-timeline-layer flex min-h-0 flex-1 flex-col"
                        dataTutorial="audio-practice-tab"
                      >
                        <PracticeTimelineView
                          isRecording={isRecording}
                          onStartRecording={toggleRecording}
                          onStopRecording={toggleRecording}
                          onPracticeSessionActiveChange={setPracticeSessionActive}
                        />
                      </AnimatedTabPanel>

                      <AnimatedTabPanel
                        panelKey="audio-practice-tuner-layer"
                        active={isAudioPracticeTunerTab}
                        className="audio-practice-tuner-layer flex min-h-0 flex-1 flex-col"
                        dataTutorial="audio-tuner-tab"
                      >
                        <AudioTunerTab
                          active={isAudioPracticeTunerActive}
                          streamRef={streamRef}
                          streamGeneration={streamGeneration}
                          nativeLivePreviewActive={nativeLivePreviewActive}
                          ready={ready}
                          permissionRequestInFlight={cameraPermissionRequestInFlight}
                          isRecording={isRecording}
                          tunerInstrument={settings.tunerInstrument}
                          tunerTransposition={settings.tunerTransposition}
                          onTunerTranspositionChange={(tunerTransposition) =>
                            updateSettings({ tunerTransposition })
                          }
                          onTunerInstrumentChange={(tunerInstrument) =>
                            updateSettings({ tunerInstrument })
                          }
                          droneWaveform={settings.droneWaveform}
                          hapticFeedback={settings.hapticFeedback}
                          micInputPreference={settings.micInputPreference}
                          handsFreeEnabled={settings.autoSoundRecording}
                          onRequestMicStream={handleRequestTunerMicStream}
                        />
                      </AnimatedTabPanel>

                      <AnimatedTabPanel
                        panelKey="audio-mode-home-layer"
                        active={audioPracticeTab === 'audio' && !isSplitView}
                        className="audio-mode-home-layer min-h-0 flex-1"
                      >
                        <div data-tutorial="audio-take-cards">
                          <AudioModeHome
                            isRecording={isRecording}
                            elapsed={elapsed}
                            ready={ready}
                            streamRef={streamRef}
                            streamGeneration={streamGeneration}
                            benchmarkTake={benchmarkTake}
                            libraryBenchmarkPlayback={libraryBenchmarkPlayback}
                            challengerTake={challengerTake}
                            takeReadiness={audioTakeReadiness}
                            onRetryTakePreparation={handleRetryAudioTakePreparation}
                            onExpandBenchmark={handleExpandBenchmark}
                            onExpandChallenger={handleExpandChallenger}
                            onPinCurrentAsBest={handlePinCurrentAsBest}
                            onClearBenchmark={handleClearAudioBenchmark}
                            onClearChallenger={handleClearAudioChallenger}
                            onShareBenchmark={
                              benchmarkTake ? () => handleShareTake(benchmarkTake) : undefined
                            }
                            onShareChallenger={
                              challengerTake ? () => handleShareTake(challengerTake) : undefined
                            }
                            hapticFeedback={settings.hapticFeedback}
                          />
                        </div>
                      </AnimatedTabPanel>
                    </div>
                  )}

                  {settings.showTakeCards &&
                    isSplitView &&
                    isAudioPracticeMainTab && (
                      <div
                        className={`split-compare-host pointer-events-auto min-h-0 flex-1${
                          recordingMode === 'audio' ? ' px-2 pb-1.5 pt-0' : ' px-0 pb-0 pt-0'
                        }`}
                        style={pipScaleStyle}
                      >
                        <SplitCompareLayout
                          splitRatio={splitRatio}
                          onSplitRatioChange={setSplitRatio}
                          benchmarkTake={benchmarkTake}
                          libraryBenchmarkPlayback={libraryBenchmarkPlayback}
                          challengerTake={challengerTake}
                          youtubeEmbedUrl={youtubeUrl}
                          suspendPipPlayback={suspendPipPlayback}
                          benchmarkPipVideoRef={benchmarkPipVideoRef}
                          challengerPipVideoRef={challengerPipVideoRef}
                          splitPreviewRef={splitPreviewRef}
                          streamRef={streamRef}
                          streamGeneration={streamGeneration}
                          cameraNeedsPermission={cameraNeedsPermission}
                          recordingMode={recordingMode}
                          isRecording={isRecording}
                          cameraReady={ready}
                          cameraResumeNonce={cameraResumeNonce}
                          nativeLivePreviewActive={nativeLivePreviewActive}
                          nativeCameraBridgeEnabled={isNativeCameraPlatform}
                          nativeLivePreviewSeedUrl={nativeLivePreviewSeedUrl}
                          holdPreviewForTakePlayback={false}
                          pitchStageActive={
                            showPitch &&
                            (mainAudioPitchSource !== null || mainVideoPitchSource !== null)
                          }
                          metronomeStageActive={metronomeStageActive}
                          onUnpinBenchmark={handleUnpinBenchmark}
                          onClearLibraryReference={handleClearLibraryReference}
                          onUnpinChallenger={handleUnpinChallenger}
                          onClearYoutube={handleClearYoutube}
                          onSubmitYoutube={handleSubmitYoutube}
                          onUploadBenchmark={handleUploadBenchmark}
                          onToggleSplitView={handleExitSplitView}
                          onExpandBenchmark={handleExpandBenchmark}
                          onExpandChallenger={handleExpandChallenger}
                          onBenchmarkPlaybackChange={setBenchmarkPipPlaying}
                          onChallengerPlaybackChange={handleChallengerPlaybackChange}
                          onChallengerAutoPlayComplete={handleChallengerAutoPlayComplete}
                          showPinCurrentAsBest={showPinCurrentAsBest}
                          onPinCurrentAsBest={handlePinCurrentAsBest}
                          onYoutubeHostChange={handleYoutubeHostChange}
                          youtubeIframeRef={youtubeIframeRef}
                          deleteDropRef={recordDeleteDropRef}
                          onPinBenchmark={handlePinBenchmark}
                          onMoveBenchmarkToCurrent={handleMoveBenchmarkToCurrent}
                          onDeleteTake={handleDragDeleteTake}
                          onDragStateChange={handlePipDragStateChange}
                          hapticFeedback={settings.hapticFeedback}
                        />
                      </div>
                    )}

                  <div className="app-hud-bottom pointer-events-none flex flex-col shrink-0">
                    {((isAudioPracticeTunerTab && showTunerTakePills) ||
                      (isAudioPracticeTimelineTab &&
                        practiceSessionActive &&
                        practiceRecordingControlsExpanded &&
                        settings.showTakeCards)) && (
                        <motion.div
                          key={
                            isAudioPracticeTimelineTab && practiceSessionActive
                              ? 'practice-take-pills'
                              : 'tuner-take-pills'
                          }
                          className={`audio-tuner-take-pills-wrap pointer-events-auto w-full ${
                            isAudioPracticeTunerTab ||
                            (isAudioPracticeTimelineTab && practiceSessionActive)
                              ? 'audio-tuner-take-pills-wrap--compact'
                              : ''
                          }`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={iosHudDim}
                          style={motionGpuLayer}
                        >
                          <TunerTakePillRow
                            compact={
                              isAudioPracticeTunerTab ||
                              (isAudioPracticeTimelineTab && practiceSessionActive)
                            }
                            ariaLabel="Takes"
                            benchmarkTake={benchmarkTake}
                            libraryBenchmarkPlayback={libraryBenchmarkPlayback}
                            challengerTake={challengerTake}
                            onExpandBenchmark={handleExpandBenchmark}
                            onExpandChallenger={handleExpandChallenger}
                            onPinCurrentAsBest={handlePinCurrentAsBest}
                            onClearBenchmark={handleClearAudioBenchmark}
                            onClearChallenger={handleClearAudioChallenger}
                          />
                        </motion.div>
                      )}

                    {settings.showTakeCards &&
                      !isSplitView &&
                      recordingMode !== 'audio' && (
                        <motion.div
                          key="pip-row"
                          className={`app-pip-row-wrap app-pip-row-wrap--camera pointer-events-auto w-full ${
                            cameraTakeCardsExpanded ? '' : 'app-pip-row-wrap--compact'
                          }`}
                          data-tutorial="review-mode-button"
                          initial={false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={iosHudDim}
                          style={{ ...motionGpuLayer, ...pipScaleStyle }}
                        >
                          <PipCompareRow
                            compact={!cameraTakeCardsExpanded}
                            boundaryRef={appShellRef}
                            benchmarkTake={benchmarkTake}
                            libraryBenchmarkPlayback={libraryBenchmarkPlayback}
                            challengerTake={challengerTake}
                            youtubeEmbedUrl={youtubeUrl}
                            suspendPipPlayback={suspendPipPlayback}
                            benchmarkPipVideoRef={benchmarkPipVideoRef}
                            challengerPipVideoRef={challengerPipVideoRef}
                            deleteDropRef={recordDeleteDropRef}
                            onPinBenchmark={handlePinBenchmark}
                            onMoveBenchmarkToCurrent={handleMoveBenchmarkToCurrent}
                            onDeleteTake={handleDragDeleteTake}
                            onUnpinBenchmark={handleUnpinBenchmark}
                            onClearLibraryReference={handleClearLibraryReference}
                            onUnpinChallenger={handleUnpinChallenger}
                            onUploadBenchmark={handleUploadBenchmark}
                            onSubmitYoutube={handleSubmitYoutube}
                            onClearYoutube={handleClearYoutube}
                            onToggleSplitView={handleToggleSplitView}
                            onShareBenchmark={
                              benchmarkTake && !youtubeUrl && !libraryBenchmarkPlayback
                                ? () => handleShareTake(benchmarkTake)
                                : undefined
                            }
                            onShareChallenger={
                              challengerTake ? () => handleShareTake(challengerTake) : undefined
                            }
                            onExpandBenchmark={handleExpandBenchmark}
                            onExpandChallenger={handleExpandChallenger}
                            onDragStateChange={handlePipDragStateChange}
                            onBenchmarkPlaybackChange={setBenchmarkPipPlaying}
                            onChallengerPlaybackChange={handleChallengerPlaybackChange}
                            onChallengerAutoPlayComplete={handleChallengerAutoPlayComplete}
                            showPinCurrentAsBest={showPinCurrentAsBest}
                            onPinCurrentAsBest={handlePinCurrentAsBest}
                            onYoutubeHostChange={handleYoutubeHostChange}
                            youtubeIframeRef={youtubeIframeRef}
                            hapticFeedback={settings.hapticFeedback}
                          />
                        </motion.div>
                      )}

                    {!isAudioPracticeMetronomeTab &&
                      !(
                        isAudioPracticeTimelineTab &&
                        !practiceSessionActive &&
                        !quickSettingsOpen
                      ) && (
                      <ControlDeck
                        isRecording={isRecording}
                        isStopping={isStopping}
                        elapsed={elapsed}
                        ready={ready || simulatorCaptureAvailable}
                        recordingMode={recordingMode}
                        onRecordingModeChange={handleRecordingModeChange}
                        onToggleRecord={handleToggleRecord}
                        onOpenHome={handleOpenPracticeHome}
                        onOpenSettings={handleOpenSettings}
                        expandViewActive={isSplitView}
                        onToggleExpandView={handleToggleSplitView}
                        onOpenMultitrack={handleOpenMultitrack}
                        focusedPracticeName={focusedPractice?.focusArea}
                        routineStepActive={Boolean(routineActiveStep)}
                        focusedAttemptCount={takes.filter(take => take.practiceSessionId || take.focusArea).length}
                        onOpenFocusReferences={() => { deferHudMediaPause(); setFocusPanel('references') }}
                        onOpenFocusHistory={() => { deferHudMediaPause(); setFocusPanel('history') }}
                        focusedPostTakeActive={Boolean(focusedPostTakeId)}
                        focusedPostTakeReviewed={focusedPostTakeReviewed}
                        focusedPostTakeHasNote={Boolean(
                          focusedPracticeState?.pendingIntention.trim(),
                        )}
                        focusedPostTakeRating={focusedPostTakeRating}
                        focusedRecordingGoal={
                          focusedPracticeState?.pendingIntention.trim() ?? ''
                        }
                        onFocusedPostTakeReview={handleFocusedPostTakeReview}
                        onFocusedPostTakeNote={() => setFocusedCueOpen(true)}
                        onFocusedPostTakeRate={handleFocusedPostTakeRate}
                        onFocusedPostTakeRetry={handleFocusedPostTakeRetry}
                        onFocusedPostTakeDismiss={() => {
                          if (routineActiveStep) {
                            handleCompleteRoutineStep(routineActiveStep.id)
                            return
                          }
                          // Decide: done for now — closes this sitting for real.
                          const sessionId = focusedPracticeSessionId
                          if (focusedPractice && liveDeskSnapshotRef.current) saveFocusDesk(focusedPractice.projectId, liveDeskSnapshotRef.current)
                          setFocusedPractice(null)
                          setFocusedPracticeSessionId(null)
                          setFocusedPostTakeId(null)
                          setFocusedPostTakeReviewed(false)
                          setIsPracticeHubOpen(true)
                          deferHudMediaPause()
                          if (sessionId) {
                            void endPracticeSession(sessionId).catch((error) => {
                              console.warn('[FocusedPractice] ending sitting failed', error)
                            })
                          }
                        }}
                        handsFreeRecording={handsFreeRecording}
                        handsFreeListeningReady={handsFreeListeningReady}
                        handsFreePlaybackPending={handsFreePlaybackPending || autoPlaybackPlaying}
                        autoSoundRecording={settings.autoSoundRecording}
                        onAutoSoundRecordingChange={handleAutoSoundRecordingChange}
                        recordDropRef={recordDeleteDropRef}
                        dragDeleteActive={pipDragState.isDragging}
                        dragOverDelete={pipDragState.overDelete}
                        pitchTrackerEnabled={hudQuickSettings.pitchTrackerEnabled}
                        pitchToggleVisible={recordingMode === 'video'}
                        showTakeCards={hudQuickSettings.showTakeCards}
                        onPitchTrackerChange={handlePitchTrackerSettingChange}
                        onShowTakeCardsChange={handleShowTakeCardsSettingChange}
                        showMetronome={hudQuickSettings.showMetronome}
                        metronomeToggleVisible={onRecordSurface}
                        onShowMetronomeChange={handleShowMetronomeSettingChange}
                        showDrone={hudQuickSettings.showDrone}
                        droneToggleVisible={onRecordSurface}
                        onShowDroneChange={handleShowDroneSettingChange}
                        desks={workspaceDesks}
                        activeDeskId={activeDeskId}
                        liveDeskSummary={liveDeskSummary}
                        onApplyDesk={handleApplyDesk}
                        onSaveDesk={handleSaveDesk}
                        onDeleteDesk={handleDeleteDesk}
                        againPulse={againPulse}
                        audioEnhancerEnabled={hudQuickSettings.audioEnhancerEnabled}
                        onAudioEnhancerChange={handleAudioEnhancerSettingChange}
                        settingsLayoutMode={
                          isAudioPracticeTunerTab
                            ? 'tuner'
                            : recordingMode === 'audio'
                            ? 'audio'
                            : 'camera'
                        }
                        tunerTakePillsVisible={showTunerTakePills}
                        tunerTakePillsToggleVisible={isAudioPracticeTunerTab}
                        onTunerTakePillsChange={setShowTunerTakePills}
                        settingsBranchDisabled={
                          isSettingsOpen ||
                          isVaultOpen ||
                          isReviewOpen ||
                          isExperimentalOpen ||
                          isPracticeHubOpen
                        }
                        onBranchOpenChange={handleQuickSettingsOpenChange}
                        hapticFeedback={settings.hapticFeedback}
                        collapsible={
                          isAudioPracticeTunerTab ||
                          isAudioPracticeMetronomeTab ||
                          (isAudioPracticeTimelineTab && practiceSessionActive)
                        }
                        collapseKey={
                          isAudioPracticeTunerTab
                            ? 'tuner'
                            : isAudioPracticeMetronomeTab
                            ? 'metronome'
                            : isAudioPracticeTimelineTab && practiceSessionActive
                            ? 'practice'
                            : undefined
                        }
                        onExpandedChange={
                          isAudioPracticeTimelineTab && practiceSessionActive
                            ? setPracticeRecordingControlsExpanded
                            : undefined
                        }
                      />
                    )}
                  </div>
                </motion.div>

                <Suspense fallback={null}>
                  <AnimatePresence>
                    {isReviewOpen && (
                      <ReviewModeOverlay
                        key="review-mode"
                        context={reviewContext}
                        activeSlot={reviewSlot ?? 'benchmark'}
                        vaultTakes={sortedTakes}
                        vaultIndex={vaultReviewIndex}
                        onVaultIndexChange={setVaultReviewIndex}
                        benchmarkSrc={
                          libraryBenchmarkPlayback?.playbackUrl ?? benchmarkTake?.videoUrl ?? null
                        }
                        challengerSrc={challengerTake?.videoUrl ?? null}
                        benchmarkTake={libraryBenchmarkPlayback ? null : benchmarkTake}
                        challengerTake={challengerTake}
                        benchmarkFilePath={
                          libraryBenchmarkPlayback?.filePath ?? benchmarkTake?.filePath
                        }
                        challengerFilePath={challengerTake?.filePath}
                        benchmarkName={libraryBenchmarkPlayback?.name ?? benchmarkTake?.name}
                        challengerName={challengerTake?.name}
                        benchmarkMimeType={
                          libraryBenchmarkPlayback?.mimeType ??
                          benchmarkTake?.videoMimeType ??
                          (benchmarkTake?.mediaType === 'audio'
                            ? NATIVE_AUDIO_MIME
                            : NATIVE_VIDEO_MIME)
                        }
                        challengerMimeType={
                          challengerTake?.videoMimeType ??
                          (challengerTake?.mediaType === 'audio'
                            ? NATIVE_AUDIO_MIME
                            : NATIVE_VIDEO_MIME)
                        }
                        benchmarkMediaType={
                          libraryBenchmarkPlayback ? 'audio' : benchmarkTake?.mediaType
                        }
                        challengerMediaType={challengerTake?.mediaType}
                        benchmarkMirror={
                          libraryBenchmarkPlayback ? false : benchmarkTake?.mirrorPlayback === true
                        }
                        challengerMirror={challengerTake?.mirrorPlayback === true}
                        benchmarkRecordingOrientation={benchmarkTake?.recordingOrientation}
                        challengerRecordingOrientation={challengerTake?.recordingOrientation}
                        liveMicTunerEnabled={settings.liveMicTunerEnabled}
                        tunerInstrument={settings.tunerInstrument}
                        tunerTransposition={settings.tunerTransposition}
                        micStreamRef={streamRef}
                        isOpen
                        onClose={handleCloseReview}
                        onSlotChange={handleReviewSlotChange}
                        onUpdateTake={handleUpdateTake}
                        onDeleteTake={handleDeleteTake}
                        onFavoriteTake={handlePinBenchmark}
                        onPlaybackActiveChange={setReviewPlaybackPlaying}
                        focusedPractice={Boolean(focusedPractice)}
                        initialLoopStartSeconds={focusedPracticeState?.loopStartSeconds}
                        initialLoopEndSeconds={focusedPracticeState?.loopEndSeconds}
                        onLoopRangeChange={handleFocusedLoopRangeChange}
                      />
                    )}
                  </AnimatePresence>
                </Suspense>

                <Suspense fallback={null}>
                  <TakeVaultDrawer
                    isOpen={isVaultOpen}
                    onClose={handleCloseVault}
                    projects={projects}
                    activeProject={activeProject}
                    onSelectProject={handleSelectProject}
                    onCreateProject={async (name) => {
                      await handleCreateProject(name)
                    }}
                    onDeleteProject={handleDeleteProject}
                    takes={takes}
                    bestTakeHistory={bestTakeHistory}
                    sortedTakes={sortedTakes}
                    sortMode={sortMode}
                    onSortChange={setSortMode}
                    benchmarkId={benchmarkId}
                    benchmarkBinding={benchmarkBinding}
                    challengerId={challengerId}
                    libraryItems={libraryItems}
                    onImportLibraryAudio={(file) => {
                      void handleImportLibraryAudio(file)
                    }}
                    onRenameLibraryItem={handleRenameLibraryItem}
                    onDeleteLibraryItem={(itemId) => {
                      void handleDeleteLibraryItem(itemId)
                    }}
                    onSetLibraryReference={handleSetLibraryReference}
                    onPinBenchmark={handlePinBenchmark}
                    onPinChallenger={handlePinChallenger}
                    onBeforePin={pausePipVideos}
                    onUpdateTake={handleUpdateTake}
                    onDeleteTake={handleDeleteTake}
                    onDeleteTakes={handleDeleteTakes}
                    onClearAllTakes={handleClearAllTakes}
                    onOpenTake={handleOpenVaultTake}
                    onBeforeExport={() => {
                      stopAutoPlaybackAudio()
                      pausePipVideos()
                    }}
                    preferredMediaFilter={recordingMode === 'audio' ? 'audio' : 'all'}
                    recordingMode={recordingMode}
                    onEnterComplete={handleVaultEnterComplete}
                  />

                  <SettingsDrawer
                    isOpen={isSettingsOpen}
                    onClose={handleCloseSettings}
                    settings={settings}
                    hudQuickSettings={hudQuickSettings}
                    onUpdate={updateSettings}
                    onAudioEnhancerChange={handleAudioEnhancerSettingChange}
                    onReset={handleResetSettings}
                    onReplayTutorial={handleReplayOnboardingTutorial}
                    onOpenQuickTuner={handleOpenQuickTunerFromSettings}
                    onOpenQuickMetronome={handleOpenQuickMetronomeFromSettings}
                  />

                  <LabsOverlay
                    isOpen={isLabsOpen}
                    route={labsRoute ?? 'menu'}
                    streamRef={streamRef}
                    streamGeneration={streamGeneration}
                    tunerInstrument={settings.tunerInstrument}
                    tunerTransposition={settings.tunerTransposition}
                    hapticFeedback={settings.hapticFeedback}
                    micPermissionBlocked={cameraPermissionBlocked}
                    micPermissionPending={cameraPermissionRequestInFlight}
                    onClose={handleCloseLabs}
                    onNavigate={handleLabsNavigate}
                    onRequestMicStream={handleRequestLabsMicStream}
                    onReleaseMicStream={releaseLiveStream}
                  />

                  <MultitrackOverlay
                    isOpen={multitrackOpen}
                    takes={sortedTakes}
                    streamRef={streamRef}
                    streamGeneration={streamGeneration}
                    tunerInstrument={settings.tunerInstrument}
                    hapticFeedback={settings.hapticFeedback}
                    isRecording={isRecording}
                    isStopping={isStopping}
                    elapsed={elapsed}
                    nativeLivePreviewActive={nativeLivePreviewActive}
                    nativeCameraBridgeEnabled={isNativeCameraPlatform}
                    onClose={handleCloseMultitrack}
                    onStartRecording={handleMultitrackStartRecording}
                    onStopRecording={handleMultitrackStopRecording}
                    onRecordingComplete={handleMultitrackRecordingComplete}
                    onDeleteTakes={handleDeleteTakes}
                    pendingRecordingTakeId={multitrackPendingRecordingTakeId}
                    onClearPendingRecording={handleClearMultitrackPendingRecording}
                    onOpenRecordingStage={handleMultitrackOpenRecordingStage}
                    onWakeCamera={handleMultitrackWakeCamera}
                    onSaveRenderedTakeToVault={handleSaveRenderedMultitrackToVault}
                  />
                </Suspense>

                <Suspense fallback={null}>
                  <AnimatePresence>
                    {showOnboardingTutorial && (
                      <OnboardingTutorial
                        key="onboarding-tutorial"
                        onComplete={handleCompleteOnboardingTutorial}
                        onSkip={handleSkipOnboardingTutorial}
                        onSelectInstrument={handleSelectOnboardingInstrument}
                        onChooseRoutine={handleOnboardingRoutineChoice}
                        hapticFeedback={settings.hapticFeedback}
                      />
                    )}
                  </AnimatePresence>
                  <CoachMark />
                </Suspense>
              </div>
            </div>
          </AudioModePlaybackProvider>
        </MetronomeProvider>
      </ActionSheetProvider>
    </TutorialProvider>
    </PracticeReferenceContext.Provider>
  )
}
