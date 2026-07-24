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
import { ChevronDown, ChevronUp, Headphones, Maximize2, X } from 'lucide-react'
import LiveCameraBackground from './components/LiveCameraBackground'
import CameraPermissionPrompt from './components/CameraPermissionPrompt'
import HudHeader from './components/HudHeader'
import PipCompareRow from './components/PipCompareRow'
import SplitCompareLayout from './components/SplitCompareLayout'
import YoutubeBenchmarkPlayer from './components/YoutubeBenchmarkPlayer'
import Pressable from './components/ui/Pressable'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import type { LabsRoute } from './components/labs/LabsOverlay'
import { useCameraSession } from './hooks/useCameraSession'
import { usePhysicalOrientation } from './hooks/usePhysicalOrientation'
import { useAppSettings } from './hooks/useAppSettings'
import { useAppShellPolicies } from './hooks/useAppShellPolicies'
import { useAudioPracticeTab } from './hooks/useAudioPracticeTab'
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
import { AUDIO_TAKE_THUMBNAIL, inferMediaTypeFromMime } from './utils/mediaType'
import { scheduleViewportSync } from './utils/viewportSync'
import { applyDarkHudStatusBar } from './utils/nativeStatusBar'
import { registerRecordingRouteRestoredHandler } from './utils/stereoPlaybackRoute'
import { lockPortraitOrientation, syncAppOrientationLock } from './utils/lockPortraitOrientation'
import { PHYSICAL_UI_ROOT_ID } from './utils/physicalUiPortal'
import { scheduleAfterPaint, scheduleIdle } from './utils/scheduleDeferred'
import { sharedMetronomeEngine } from './metronome/sharedMetronomeEngine'
import { iosFade, iosHudDim, motionGpuLayer } from './utils/motionPresets'
import { isOnboardingComplete, markAllCoachMarksSeen } from './utils/onboardingTutorial'
import { ActionSheetProvider } from './context/ActionSheetContext'
import { MetronomeProvider } from './context/MetronomeContext'
import { TutorialProvider } from './context/TutorialContext'
import {
  deleteCachedTakeThumbnail,
  invalidateThumbnailCacheIndex,
  persistTakeThumbnail,
  reResolveCachedTakeThumbnail,
} from './utils/takeThumbnailCache'
import {
  createProject,
  DEFAULT_PROJECT_NAME,
  deleteProject,
  deleteLibraryItem,
  deleteVaultTake,
  findBestTakeId,
  getLibraryItemsByProject,
  getProjectBenchmarkBinding,
  getTakesByProject,
  initVaultDatabase,
  listProjects,
  saveLibraryAudioItem,
  saveTake,
  setProjectBenchmarkBinding,
  setProjectBestTake,
  setProjectLibraryBenchmark,
  setTakeEnhancerBaked,
  uiTakesFromVaultRowsFast,
  hydrateVaultTakeRowsProgressive,
  updateLibraryItemName,
  updateVaultTake,
  type Project,
} from './db'
import { hasBenchmarkReference, resolveBenchmarkPlayback } from './utils/benchmarkReference'
import { hydrateLibraryItems, type HydratedLibraryItem } from './utils/libraryBridge'
import {
  triggerBestTakeHaptic,
  triggerLightHaptic,
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
import { setTakePlaybackEnhancerState, setSpeakerLoudnessPreset } from './utils/takePlaybackSpeaker'
import BestTakeAudioPlugin, { applyNativeExperimentalAudioMode } from './utils/audioSessionRoute'
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
  isNativeCameraPreviewActive,
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
import { AudioModePlaybackProvider, audioModePlaybackControlsRef } from './context/AudioModePlaybackContext'
import type { AudioPracticeTab } from './types/audioPractice'

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
const DraggableMetronomeWidget = lazy(() => import('./components/DraggableMetronomeWidget'))
const TakeVaultDrawer = lazy(() => import('./components/TakeVaultDrawer'))
const SettingsDrawer = lazy(() => import('./components/SettingsDrawer'))
const OnboardingTutorial = lazy(() => import('./components/OnboardingTutorial'))
const CoachMark = lazy(() => import('./components/CoachMark'))
const CreatorStudio = lazy(() => import('./components/creatorStudio/CreatorStudio'))
const LabsOverlay = lazy(() => import('./components/labs/LabsOverlay'))
const CreatorStudioTakePicker = lazy(() => import('./components/labs/CreatorStudioTakePicker'))
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
  }
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true)
  const [bootSnapshot, setBootSnapshot] = useState<AppBootSnapshot | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

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
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [reviewContext, setReviewContext] = useState<ReviewContext>('compare')
  const [vaultReviewIndex, setVaultReviewIndex] = useState(0)
  const [creatorStudioTake, setCreatorStudioTake] = useState<Take | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [labsRoute, setLabsRoute] = useState<LabsRoute | null>(null)
  const [multitrackOpen, setMultitrackOpen] = useState(false)
  const [multitrackPendingRecordingTakeId, setMultitrackPendingRecordingTakeId] = useState<string | null>(null)
  const multitrackRecordingActiveRef = useRef(false)
  const [isCreatorStudioPickerOpen, setIsCreatorStudioPickerOpen] = useState(false)
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
  const [audioTakeReadiness, setAudioTakeReadiness] = useState<Record<string, AudioTakeReadiness>>({})
  const [showPitch, setShowPitch] = useState(false)
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false)
  const [pendingPitchTrackerEnabled, setPendingPitchTrackerEnabled] = useState<boolean | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null)
  const [showYoutubeHeadphonesTip, setShowYoutubeHeadphonesTip] = useState(false)
  const [youtubeHeadphonesTipNonce, setYoutubeHeadphonesTipNonce] = useState(0)
  const [showYoutubeExpandTip, setShowYoutubeExpandTip] = useState(false)
  const [youtubeExpandTipNonce, setYoutubeExpandTipNonce] = useState(0)
  const [youtubePlayAlongUi, setYoutubePlayAlongUi] = useState(getYoutubePlayAlongUiState)
  const [isSplitView, setIsSplitView] = useState(false)
  const isSplitViewRef = useRef(false)
  const [splitRatio, setSplitRatio] = useState(56)
  const [cameraTakeCardsExpanded, setCameraTakeCardsExpanded] = useState(false)
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false)
  const [tutorialTourEnabled, setTutorialTourEnabled] = useState(false)
  const [practiceSessionActive, setPracticeSessionActive] = useState(false)
  const [showTunerTakePills, setShowTunerTakePills] = useState(false)

  const { settings, updateSettings, resetSettings } = useAppSettings()
  const {
    activeTab: audioPracticeTab,
    setActiveTab: setAudioPracticeTab,
    resetToAudioTab,
  } = useAudioPracticeTab()
  const handleAudioPracticeTabChange = useCallback(
    (tab: AudioPracticeTab) => {
      if (tab === 'tuner' && audioPracticeTab !== 'tuner') {
        setShowTunerTakePills(false)
      }
      setAudioPracticeTab(tab)
    },
    [audioPracticeTab, setAudioPracticeTab],
  )
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
  const audioTakeReadinessInputRef = useRef(new Map<string, { filePath: string; fallbackUrl: string }>())
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
      playbackGainDb?: number,
    ) => void
  >(() => {})
  const refreshCameraSessionRef = useRef<() => Promise<void>>(async () => {})
  const suspendCameraForBackgroundRef = useRef<() => void>(() => {})
  const recordDeleteDropRef = useRef<HTMLDivElement>(null)
  const [autoRecordStartSuppressed, setAutoRecordStartSuppressed] = useState(false)
  const [handsFreePlaybackPending, setHandsFreePlaybackPending] = useState(false)
  const autoRecordStartSuppressedRef = useRef(autoRecordStartSuppressed)
  autoRecordStartSuppressedRef.current = autoRecordStartSuppressed
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


  const isReviewOpen = reviewSlot !== null
  const isLabsOpen = labsRoute !== null
  const isExperimentalOpen =
    isLabsOpen || isCreatorStudioPickerOpen || creatorStudioTake !== null || multitrackOpen
  const hudModalState: 'idle' | 'sheet' | 'review' = isReviewOpen
    ? 'review'
    : isVaultOpen || isSettingsOpen || isExperimentalOpen
    ? 'sheet'
    : 'idle'

  useEffect(() => {
    if (!isExperimentalOpen) return
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
  }, [isExperimentalOpen])

  useLayoutEffect(() => {
    return scheduleViewportSync(() => {})
  }, [])

  useEffect(() => {
    if (isOnboardingComplete()) return
    const timer = window.setTimeout(() => {
      setShowOnboardingTutorial(true)
    }, BOOT_REVEAL_DELAY_MS + 240)
    return () => window.clearTimeout(timer)
  }, [])

  const handleCompleteOnboardingTutorial = useCallback(() => {
    setShowOnboardingTutorial(false)
    setTutorialTourEnabled(true)
  }, [])

  const handleSkipOnboardingTutorial = useCallback(() => {
    markAllCoachMarksSeen()
    setShowOnboardingTutorial(false)
    setTutorialTourEnabled(false)
  }, [])

  const handleReplayOnboardingTutorial = useCallback(() => {
    setIsSettingsOpen(false)
    setTutorialTourEnabled(false)
    scheduleAfterPaint(() => {
      setShowOnboardingTutorial(true)
    })
  }, [])

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
    void finalizeTakePlaybackCleanup().finally(() => {
      stopAutoPlaybackAudio()
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
      playbackGainDb?: number,
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
        Capacitor.isNativePlatform() &&
        Capacitor.getPlatform() === 'ios' &&
        Boolean(filePath)

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
            console.error('[Playback] native audio controller unavailable; WebKit fallback disabled', {
              takeId,
            })
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
              AUTO_PLAYBACK_LEAD_IN_S,
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
            },
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
          completeAutoPlayback,
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
          { started },
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

    setAudioTakeReadiness((current) => ({ ...current, [takeId]: { status: 'preparing' } }))
    console.info('[TakeReadiness] playback-source-creation-started', {
      takeId,
      filePath: input.filePath,
      atMs: performance.now(),
    })

    try {
      const readiness = await prepareTakePlaybackReadiness(input)
      setTakes((current) =>
        current.map((take) =>
          take.id === takeId ? { ...take, videoUrl: readiness.playbackUrl } : take,
        ),
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
      console.info('[TakeReadiness] play-enabled', { takeId, atMs: performance.now() })
      return readiness
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This take could not be prepared.'
      console.error('[TakeReadiness] preparation-failed', { takeId, message, error })
      setAudioTakeReadiness((current) => ({
        ...current,
        [takeId]: { status: 'error', message },
      }))
      return null
    }
  }, [])

  const handleRetryAudioTakePreparation = useCallback((takeId: string) => {
    void prepareAudioTakePlayback(takeId)
  }, [prepareAudioTakePlayback])

  const handleSaveTake = useCallback((payload: RecordingCompletePayload) => {
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
      payload.captureDiagnostics?.playbackGainMetadata,
    )

    const optimisticUrl =
      resolveTakePlaybackUrlFast(filePath, videoUrl) ??
      (videoUrl ? resolveMediaPlaybackSrc(videoUrl) : '')
    const projectId = activeProjectIdRef.current

    if (mediaType === 'audio') {
      audioTakeReadinessInputRef.current.set(takeId, {
        filePath,
        fallbackUrl: optimisticUrl,
      })
      setAudioTakeReadiness((current) => ({ ...current, [takeId]: { status: 'preparing' } }))
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
        ...(referenceTrackId !== undefined ? { referenceTrackId } : null),
        ...(referenceStartBeat !== undefined ? { referenceStartBeat } : null),
        ...(payload.captureDiagnostics?.playbackGainMetadata
          ? { playbackGainMetadata: payload.captureDiagnostics.playbackGainMetadata }
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
                ? { ...take, videoUrl: playbackUrl, filePath: resolvedFilePath }
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
          name: mediaType === 'audio' ? `Audio ${takeIndex}` : `Take ${takeIndex}`,
        })
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

        const readiness = await prepareAudioTakePlayback(takeId)
        if (shouldAutoPlay) {
          if (readiness) {
            pendingAutoPlaybackRef.current = false
            playAutoTakeAudioRef.current(
              readiness.playbackUrl,
              takeId,
              autoPerformanceStartSeconds,
              resolvedFilePath,
              playbackGainDb,
            )
          } else {
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
      if (
        audioEnhancerEnabledRef.current &&
        isNativeCameraPlatform &&
        resolvedFilePath
      ) {
        void (async () => {
          try {
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
            console.warn('[AudioEnhancer] bake failed; take keeps live playback enhancement', error)
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
            persistTakeThumbnail(takeId, dataUrl, thumbnailTake.recordingOrientation ?? 'portrait')
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
      console.error('[Recording] take finalization failed', { takeId, error })
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
  }, [prepareAudioTakePlayback, releaseAutoRecordSuppress])

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
    if (!youtubeUrlRef.current) return
    startYoutubeProxyPlayback(youtubeIframeRef.current, 1)
  }, [])

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
    nativeExperimentalAudioEnabled: settings.nativeExperimentalAudioEnabled,
    nativeCameraRecordingEnabled: isNativeCameraPlatform,
    micInputPreference: settings.micInputPreference,
  })
  refreshCameraSessionRef.current = refreshCameraSession
  suspendCameraForBackgroundRef.current = suspendCameraForBackground

  const liveStreamGenerationRef = useRef(streamGeneration)
  const tunerMicBackgroundGenerationRef = useRef<number | null>(null)
  liveStreamGenerationRef.current = streamGeneration

  useEffect(() => {
    const markTunerMicForForegroundRecovery = () => {
      tunerMicBackgroundGenerationRef.current = liveStreamGenerationRef.current
    }

    window.addEventListener(
      APP_BACKGROUND_SUSPEND_EVENT,
      markTunerMicForForegroundRecovery,
    )
    return () => {
      window.removeEventListener(
        APP_BACKGROUND_SUSPEND_EVENT,
        markTunerMicForForegroundRecovery,
      )
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
    console.info(
      '[AudioModePlayback] releasing WebRTC capture before native AVPlayer playback',
    )
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
    [refreshCameraSession],
  )

  useEffect(() => {
    registerYoutubeStereoGuard(
      () =>
        !maintainDuringRecording &&
        !autoPlaybackPlaying &&
        !audioModeTakePlaying &&
        !handsFreePlaybackPending,
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
  }, [isRecording, nativeLivePreviewActive, recordingMode, reacquireStreamForAudioRoute, ready, settings.micInputPreference])

  useEffect(() => {
    if (isPlaybackRouteHoldActive()) return
    const youtubePlayAlongActive =
      isRecording && !settings.excludeYoutubeFromRecording && Boolean(youtubeUrl)
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
    settings.excludeYoutubeFromRecording,
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

  useEffect(() => {
    if (recordingMode !== 'audio') {
      resetToAudioTab()
    }
  }, [recordingMode, resetToAudioTab])

  useEffect(() => {
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
    !isReviewOpen &&
    !isExperimentalOpen &&
    (ready || nativeHandsFreeCaptureActive)

  const { handsFreeRecording, restartHandsFreeMonitor } = useAutoSoundRecording({
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
      if (settings.excludeYoutubeFromRecording && stream) {
        void tuneMusicRecordingStream(stream)
      }
      return
    }

    if (!settings.excludeYoutubeFromRecording) return

    pauseYoutubeReference()

    if (stream) {
      void tunePlaybackIsolationStream(stream)
    }
  }, [isRecording, pauseYoutubeReference, settings.excludeYoutubeFromRecording, streamGeneration])

  useEffect(() => {
    const playAlongRecording =
      isRecording && !settings.excludeYoutubeFromRecording && Boolean(youtubeUrlRef.current)

    if (playAlongRecording) {
      setYoutubeRecordingMaintain(true)
      resetYoutubePlayAlongRouteFailure()
      scheduleYoutubeRecordingMaintain(youtubeIframeRef.current, 1, { recordingActive: true })
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
            YOUTUBE_PROXY_ORIGIN,
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
  }, [elapsed, isRecording, settings.excludeYoutubeFromRecording, youtubeUrl])

  useEffect(() => {
    if (!isRecording || settings.excludeYoutubeFromRecording || !youtubeUrl || !youtubeHostEl) return
    scheduleYoutubeRecordingMaintain(youtubeIframeRef.current, 1, { recordingActive: true })
  }, [isRecording, settings.excludeYoutubeFromRecording, youtubeHostEl, youtubeUrl])

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
            restartHandsFreeMonitorRef.current()
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
    [refreshCameraSession, requestCameraPreviewResume],
  )

  const autoSoundListening =
    settings.autoSoundRecording &&
    autoMonitoringAllowed &&
    !isRecording &&
    !autoRecordStartSuppressed &&
    !handsFreePlaybackPending &&
    (Boolean(streamRef.current?.getAudioTracks().some(t => t.readyState === 'live' && t.enabled)) ||
      isNativeCameraPreviewActive() ||
      isNativeAudioCaptureActive())

  const wasVaultOpenRef = useRef(false)
  const vaultEnterLoadDoneRef = useRef(false)
  const vaultHydrateInFlightRef = useRef(false)
  /** Blocks ghost-tap reopen after sheet close (tuner tab has high-frequency pitch updates). */
  const overlayOpenSuppressUntilRef = useRef(0)

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
    if (wasSettingsOpenRef.current && !isSettingsOpen) {
      const timer = window.setTimeout(() => {
        recoverCameraAfterSurfaceDismiss('settings-close')
      }, 350)
      wasSettingsOpenRef.current = isSettingsOpen
      return () => window.clearTimeout(timer)
    }
    wasSettingsOpenRef.current = isSettingsOpen
  }, [isSettingsOpen, recoverCameraAfterSurfaceDismiss])

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

  const handleOpenVault = useCallback(() => {
    if (!canOpenOverlaySheet() || isExperimentalOpen) return
    triggerLightHaptic(settings.hapticFeedback)
    setShowPitch(false)
    setIsSettingsOpen(false)
    setIsVaultOpen(true)
    deferHudMediaPause()
  }, [canOpenOverlaySheet, deferHudMediaPause, isExperimentalOpen, settings.hapticFeedback])

  const handleToggleVault = useCallback(() => {
    if (isVaultOpen) {
      handleCloseVault()
      return
    }
    handleOpenVault()
  }, [handleCloseVault, handleOpenVault, isVaultOpen])

  const handleVaultEnterComplete = useCallback(() => {
    if (vaultEnterLoadDoneRef.current) return
    vaultEnterLoadDoneRef.current = true

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    void loadVaultTakesFromFilesystem(projectId)
  }, [loadVaultTakesFromFilesystem])

  const handleOpenSettings = useCallback(() => {
    if (!canOpenOverlaySheet() || isExperimentalOpen) return
    triggerLightHaptic(settings.hapticFeedback)
    setShowPitch(false)
    setIsVaultOpen(false)
    setIsSettingsOpen(true)
    deferHudMediaPause()
  }, [canOpenOverlaySheet, deferHudMediaPause, isExperimentalOpen, settings.hapticFeedback])

  const handleRecordingModeChange = useCallback(
    (mode: RecordingMode) => {
      const modeChanged = mode !== recordingModeRef.current
      if (modeChanged) {
        setShowPitch(false)
        resetToAudioTab()
        // Refresh the cached visual viewport before the audio layout mounts.
        // Otherwise iOS can paint one frame with the camera surface's stale
        // height and clip the bottom deck before its later recovery pass.
        stabilizeViewportAfterMediaInteraction()
        if (mode === 'audio' && !showTakeCardsRef.current) {
          showTakeCardsRef.current = true
          updateSettings({ showTakeCards: true })
        }
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
        requestCameraAccess('audio')
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
      resetToAudioTab,
      updateSettings,
    ]
  )

  const handleToggleRecord = useCallback(() => {
    if (recordingModeRef.current === 'audio' && !ready && !isRecording) {
      requestCameraAccess('audio')
      return
    }

    if (
      recordingModeRef.current === 'video' &&
      isRecording &&
      settings.autoSoundRecording
    ) {
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

  const handleAutoSoundRecordingChange = useCallback(
    (enabled: boolean) => {
      updateSettings({ autoSoundRecording: enabled })

      if (recordingModeRef.current !== 'video') return

      if (!enabled) {
        void disarmAutoRecording()
        return
      }

      // Camera startup and hands-free activation can overlap on a fresh launch.
      // Warm the existing pre-roll path now; its native bridge acquisition is
      // serialized so this safely joins an in-flight camera startup.
      void warmAutoRecording().finally(() => {
        if (recordingModeRef.current === 'video') {
          restartHandsFreeMonitorRef.current()
        }
      })
    },
    [disarmAutoRecording, updateSettings, warmAutoRecording],
  )

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

  const handleOpenLabs = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setIsCreatorStudioPickerOpen(false)
    setCreatorStudioTake(null)
    setMultitrackOpen(false)
    setShowPitch(false)
    setLabsRoute('menu')
    deferHudMediaPause()
  }, [deferHudMediaPause, markOverlayClosed, settings.hapticFeedback])

  const handleOpenCreatorStudioPicker = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setLabsRoute(null)
    setMultitrackOpen(false)
    setShowPitch(false)
    pauseYoutubeReference()
    pausePipVideos()
    setIsCreatorStudioPickerOpen(true)
    deferHudMediaPause()
  }, [
    deferHudMediaPause,
    markOverlayClosed,
    pausePipVideos,
    pauseYoutubeReference,
    settings.hapticFeedback,
  ])

  const handleOpenMultitrack = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    markOverlayClosed()
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setLabsRoute(null)
    setIsCreatorStudioPickerOpen(false)
    setCreatorStudioTake(null)
    setShowPitch(false)
    setMultitrackOpen(true)
    // While multitrack owns the camera, a failed take must never tear down
    // the live bridge preview (black stage) — recovery is suppressed until close.
    setSuppressNativeBridgeRecovery(true)
    deferHudMediaPause()
  }, [deferHudMediaPause, markOverlayClosed, setSuppressNativeBridgeRecovery, settings.hapticFeedback])

  const handleMultitrackOpenRecordingStage = useCallback(() => {
    handleRecordingModeChange('video')
    if (isNativeCameraPlatform) {
      // Warm the native camera bridge immediately on tap so the panel shows a
      // live preview right away, instead of only once "Record" is pressed.
      void acquireNativeVideoBridge()
      return
    }
    void requestCameraAccess('video')
  }, [acquireNativeVideoBridge, handleRecordingModeChange, isNativeCameraPlatform, requestCameraAccess])

  const handleMultitrackStartRecording = useCallback((): Promise<boolean> => {
    multitrackRecordingActiveRef.current = true
    if (settings.excludeYoutubeFromRecording) {
      pauseYoutubeReference()
    }
    pausePipVideos()
    return startRecording()
  }, [pausePipVideos, pauseYoutubeReference, startRecording, settings.excludeYoutubeFromRecording])

  const handleMultitrackStopRecording = useCallback((options?: MultitrackRecordingStopOptions) => {
    // No isRecording gate: the serialized native stop is safe at any instant
    // (it awaits an in-flight start), and the old stale-state gate could
    // silently no-op a legitimate Stop.
    stopRecording(options)
  }, [stopRecording])

  const handleClearMultitrackPendingRecording = useCallback(() => {
    setMultitrackPendingRecordingTakeId(null)
  }, [])

  const handleMultitrackRecordingComplete = useCallback(() => {
    multitrackRecordingActiveRef.current = false
  }, [])

  const handleCloseMultitrack = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    if (isRecording) stopRecording()
    multitrackRecordingActiveRef.current = false
    setMultitrackPendingRecordingTakeId(null)
    setMultitrackOpen(false)
    setSuppressNativeBridgeRecovery(false)
    recoverCameraAfterSurfaceDismiss('multitrack-close')
  }, [isRecording, recoverCameraAfterSurfaceDismiss, setSuppressNativeBridgeRecovery, settings.hapticFeedback, stopRecording])

  const handleCloseCreatorStudioPicker = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setIsCreatorStudioPickerOpen(false)
    recoverCameraAfterSurfaceDismiss('creator-studio-picker-close')
  }, [recoverCameraAfterSurfaceDismiss, settings.hapticFeedback])

  const handleCloseLabs = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setLabsRoute(null)
    recoverCameraAfterSurfaceDismiss('labs-close')
  }, [recoverCameraAfterSurfaceDismiss, settings.hapticFeedback])

  const handleLabsNavigate = useCallback((route: LabsRoute) => {
    setLabsRoute(route)
  }, [])

  const handleRequestLabsMicStream = useCallback(() => {
    requestCameraAccess('audio')
  }, [requestCameraAccess])

  const micStreamIsLiveForTuner = useCallback(() => {
    if (isNativeCaptureSessionActive()) return true
    return Boolean(
      streamRef.current?.active &&
        streamRef.current.getAudioTracks().some(
          (track) => track.readyState === 'live' && track.enabled && !track.muted,
        ),
    )
  }, [])

  const handleRequestTunerMicStream = useCallback(async (
    options?: { forceRecovery?: boolean },
  ): Promise<boolean> => {
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

        const recovered = await reacquireStreamForAudioRoute({ liveCapture: true })
        if (recovered) {
          tunerMicBackgroundGenerationRef.current = null
        }
        return recovered
      }

      if (!micStreamIsLiveForTuner() && !isNativeCaptureSessionActive()) {
        requestCameraAccess('audio')
        return false
      }
      return true
    }

    if (!micStreamIsLiveForTuner()) {
      requestCameraAccess('audio')
      return false
    }
    return true
  }, [
    isRecording,
    micStreamIsLiveForTuner,
    reacquireStreamForAudioRoute,
    requestCameraAccess,
  ])

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
    startTransition(() => {
      setQuickSettingsOpen(open)
    })
  }, [])

  const suspendPipPlayback = isVaultOpen || isReviewOpen || isSettingsOpen || isExperimentalOpen

  const handsFreeBackgroundTake = useMemo(() => {
    if (!autoPlaybackTakeId || recordingMode !== 'video') return null
    return takes.find((take) => take.id === autoPlaybackTakeId) ?? null
  }, [autoPlaybackTakeId, recordingMode, takes])

  const handsFreeBackgroundPlaybackSrc = useMemo(() => {
    if (!handsFreeBackgroundTake?.videoUrl) return null
    return resolveMediaPlaybackSrc(handsFreeBackgroundTake.videoUrl)
  }, [handsFreeBackgroundTake])

  const resolvedBenchmark = useMemo(
    () => resolveBenchmarkPlayback(benchmarkBinding, benchmarkId, takes, libraryItems),
    [benchmarkBinding, benchmarkId, libraryItems, takes]
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
            take.recordingOrientation ?? 'portrait',
          )
          if (refreshed && refreshed !== take.thumbnailUrl) {
            updates.set(take.id, refreshed)
          }
        }),
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

  const pitchHudSuspended = isVaultOpen || isSettingsOpen || isReviewOpen || isExperimentalOpen

  const showMainPitchWidget = mainAudioPitchSource !== null || mainVideoPitchSource !== null

  const showMetronomeWidget = settings.showMetronome

  const metronomePlaying = useSyncExternalStore(
    sharedMetronomeEngine.subscribe,
    () => sharedMetronomeEngine.getSnapshot().playing,
    () => false,
  )

  useEffect(() => {
    if (!metronomePlaying) return
    if (recordingMode === 'video' && !nativeLivePreviewActive) return
    sharedMetronomeEngine.reconcileAfterModeSwitch(recordingMode)
  }, [recordingMode, nativeLivePreviewActive, metronomePlaying])

  const metronomeHudSuspended = isVaultOpen || isSettingsOpen || isReviewOpen || isExperimentalOpen

  const showFloatingMetronomeWidget =
    showMetronomeWidget &&
    (recordingMode === 'video' ||
      (recordingMode === 'audio' && audioPracticeTab !== 'metronome'))

  const metronomeWidgetInteractive = showFloatingMetronomeWidget && !metronomeHudSuspended

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
    isRecording && (recordingMode === 'video' || (recordingMode === 'audio' && isNativeCameraPlatform))
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
  })

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
    setSpeakerLoudnessPreset(settings.speakerLoudnessPreset)
  }, [settings.speakerLoudnessPreset])

  useEffect(() => {
    setActiveCaptureProfile('natural')
  }, [])

  const audioPracticeSheetOpen = isVaultOpen || isSettingsOpen || isExperimentalOpen

  const isAudioPracticeMetronomeTab = recordingMode === 'audio' && audioPracticeTab === 'metronome'

  const isAudioPracticeTunerTab = recordingMode === 'audio' && audioPracticeTab === 'tuner'

  const isAudioPracticeTimelineTab = recordingMode === 'audio' && audioPracticeTab === 'practice'

  useEffect(() => {
    if (!isAudioPracticeTimelineTab) {
      setPracticeSessionActive(false)
    }
  }, [isAudioPracticeTimelineTab])

  const isAudioPracticeToolTab =
    isAudioPracticeMetronomeTab || isAudioPracticeTunerTab || isAudioPracticeTimelineTab

  useEffect(() => {
    if (!isAudioPracticeTunerTab || quickSettingsOpen || isRecording) return

    handleRequestTunerMicStream()
  }, [
    handleRequestTunerMicStream,
    isAudioPracticeTunerTab,
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

  const handlePinBenchmark = useCallback(
    (id: string) => {
      triggerBestTakeHaptic(settings.hapticFeedback)
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setYoutubeUrl(null)
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
      if (activeProjectIdRef.current) {
        void setProjectBestTake(activeProjectIdRef.current, id)
      }
    },
    [
      pausePipVideos,
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

  const handleOpenCreatorStudio = useCallback(
    (take: Take) => {
      pauseYoutubeReference()
      pausePipVideos()
      setIsVaultOpen(false)
      setIsSettingsOpen(false)
      setIsCreatorStudioPickerOpen(false)
      setLabsRoute(null)
      setCreatorStudioTake(take)
    },
    [pausePipVideos, pauseYoutubeReference]
  )

  const handleCloseCreatorStudio = useCallback(() => {
    pauseYoutubeReference()
    setCreatorStudioTake(null)
    recoverCameraAfterSurfaceDismiss('creator-studio-close')
  }, [pauseYoutubeReference, recoverCameraAfterSurfaceDismiss])

  const handleOpenCompareReview = useCallback(
    (slot: ReviewSlot) => {
      setReviewContext('compare')
      setReviewSlot(slot)
      deferHudMediaPause()
    },
    [deferHudMediaPause]
  )

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
    [pausePipVideos, takes.length]
  )

  const handleUpdateTake = useCallback((id: string, updates: TakeUpdate) => {
    setTakes((prev) => prev.map((take) => (take.id === id ? { ...take, ...updates } : take)))
    void updateVaultTake(id, updates)
  }, [])

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
            console.warn('[TakeDelete] Thumbnail cleanup failed', { takeId: take.id, error })
          })
          return { id: take.id, removed: true, cleanupWarning }
        }),
      )

      const removedIds = new Set(
        outcomes.filter((outcome) => outcome.removed).map((outcome) => outcome.id),
      )
      if (removedIds.size > 0) {
        setTakes((prev) => prev.filter((take) => !removedIds.has(take.id)))
        setBenchmarkId((current) => (current && removedIds.has(current) ? null : current))
        setChallengerId((current) => (current && removedIds.has(current) ? null : current))
      }

      if (outcomes.some((outcome) => !outcome.removed)) {
        setTakeDeleteError('A take could not be deleted and remains in your library. Please try again.')
      } else if (outcomes.some((outcome) => outcome.cleanupWarning)) {
        setTakeDeleteError('The take was removed, but library cleanup did not finish. BestTake will reconcile it when the app restarts.')
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

  const handleUnpinBenchmark = useCallback(() => {
    audioModePlaybackControlsRef.pause?.()
    teardownPipMedia(benchmarkPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setBenchmarkPipPlaying(false)
    setBenchmarkId(null)
  }, [teardownPipMedia])

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
    [autoPlaybackTakeId],
  )

  const handleChallengerAutoPlayComplete = useCallback(() => {
    finishAutoPlayback()
  }, [finishAutoPlayback])

  const handleChallengerPlaybackChange = useCallback((playing: boolean) => {
    setChallengerPipPlaying(playing)
  }, [])

  const handleSubmitYoutube = useCallback((embedUrl: string) => {
    prepareNewYoutubeReference()
    setYoutubeUrl(embedUrl)
    setYoutubeReferenceEnabled(true)
    setYoutubeHeadphonesTipNonce((current) => current + 1)
    setShowYoutubeHeadphonesTip(true)
    setYoutubeExpandTipNonce((current) => current + 1)
    setShowYoutubeExpandTip(true)
  }, [])

  const handleClearYoutube = useCallback(() => {
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

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((current) => {
      const next = !current
      if (next && youtubeUrlRef.current) {
        window.requestAnimationFrame(() => {
          wakeYoutubeReference(youtubeIframeRef.current, { attemptPlay: false, uiVolume: 1 })
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

  const hasBestTakeReference = hasBenchmarkReference(youtubeUrl, resolvedBenchmark)

  const showPinCurrentAsBest = Boolean(
    hasBestTakeReference &&
      takeHasPlaybackMedia(challengerTake) &&
      challengerId &&
      challengerId !== benchmarkId
  )

  const handlePinCurrentAsBest = useCallback(() => {
    if (!challengerId) return
    handlePinBenchmark(challengerId)
  }, [challengerId, handlePinBenchmark])

  const pipScaleStyle = {
    '--pip-scale': settings.takeCardScale / 100,
  } as React.CSSProperties

  const tutorialSignals = useMemo(
    () => ({
      isRecording,
      isReviewOpen,
      isVaultOpen,
      isSplitView,
      autoSoundRecording: settings.autoSoundRecording,
      recordingMode,
      audioPracticeTab,
    }),
    [
      audioPracticeTab,
      isRecording,
      isReviewOpen,
      isSplitView,
      isVaultOpen,
      recordingMode,
      settings.autoSoundRecording,
    ]
  )

  return (
    <TutorialProvider
      active={showOnboardingTutorial}
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
                    aria-label="Dismiss deletion message"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {youtubeUrl && (
                <YoutubeBenchmarkPlayer
                  embedUrl={youtubeUrl}
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
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
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
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
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
                  (youtubePlayAlongUi.showTapToResume || youtubePlayAlongUi.routeFailureMessage) && (
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
                  isPreviewRecovering ||
                  (!ready && !isRecording && !cameraNeedsPermission)
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

              {cameraNeedsPermission && (
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
                      <DraggableMetronomeWidget
                        key={
                          recordingMode === 'audio'
                            ? 'audio-metronome-widget'
                            : 'main-metronome'
                        }
                        boundaryRef={appShellRef}
                        positionId={
                          recordingMode === 'audio'
                            ? 'audio-metronome-widget'
                            : 'main-metronome'
                        }
                        isTakePlaying={takePlaybackActive}
                        muteDuringPlayback={settings.muteMetronomeDuringPlayback}
                        onClose={handleCloseMetronome}
                      />
                    </AnimatePresence>
                  </Suspense>
                )}
              </div>

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
                  } ${
                    isAudioPracticeMetronomeTab ? 'app-ui-overlay--audio-practice-metronome' : ''
                  } ${isAudioPracticeTunerTab ? 'app-ui-overlay--audio-practice-tuner' : ''} ${
                    isAudioPracticeTunerTab && !showTunerTakePills
                      ? 'app-ui-overlay--tuner-takes-hidden'
                      : ''
                  } ${
                    isAudioPracticeTimelineTab ? 'app-ui-overlay--audio-practice-timeline app-ui-overlay--audio-practice-metronome' : ''
                  } ${practiceSessionActive ? 'app-ui-overlay--practice-session-active' : ''}`}
                  aria-hidden={hudModalState === 'review'}
                  animate={{
                    opacity: hudModalState === 'review' ? 0 : hudModalState === 'sheet' ? 0.78 : 1,
                    scale:
                      hudModalState === 'review' ? 0.94 : hudModalState === 'sheet' ? 0.985 : 1,
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
                  <AnimatePresence initial={false}>
                    {recordingMode !== 'audio' && (
                      <motion.div
                        key="video-hud-header"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={iosFade}
                        style={motionGpuLayer}
                      >
                        <HudHeader
                          sessionName={activeProject?.name ?? 'BestTake'}
                          onOpenVault={handleOpenVault}
                          className={
                            quickSettingsOpen || isReviewOpen || isSplitView
                              ? 'hud-header-hidden'
                              : undefined
                          }
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {recordingMode === 'audio' &&
                      !quickSettingsOpen &&
                      !practiceSessionActive &&
                      !isSplitView && (
                      <motion.div
                        key="audio-mode-top-tabs"
                        data-tutorial="audio-mode-tabs"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={iosFade}
                        style={motionGpuLayer}
                      >
                        <AudioPracticeTopTabs
                          activeTab={audioPracticeTab}
                          onTabChange={handleAudioPracticeTabChange}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {recordingMode === 'audio' && !quickSettingsOpen && !isSplitView && (
                    <div className="relative flex min-h-0 flex-1">
                      <AnimatedTabPanel
                        panelKey="audio-practice-metronome-layer"
                        active={audioPracticeTab === 'metronome'}
                        className="audio-practice-metronome-layer flex min-h-0 flex-1 flex-col"
                        dataTutorial="audio-metronome-tab"
                      >
                        <AudioMetronomeTab key="audio-metronome-tab" />
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
                          streamRef={streamRef}
                          streamGeneration={streamGeneration}
                          nativeLivePreviewActive={nativeLivePreviewActive}
                          ready={ready}
                          permissionRequestInFlight={cameraPermissionRequestInFlight}
                          isRecording={isRecording}
                          tunerInstrument={settings.tunerInstrument}
                          liveMicTunerEnabled={settings.liveMicTunerEnabled}
                          droneVolume={settings.droneVolume}
                          droneWaveform={settings.droneWaveform}
                          hapticFeedback={settings.hapticFeedback}
                          micInputPreference={settings.micInputPreference}
                          onRequestMicStream={handleRequestTunerMicStream}
                        />
                      </AnimatedTabPanel>

                      <AnimatedTabPanel
                        panelKey="audio-mode-home-layer"
                        active={
                          audioPracticeTab === 'audio' && settings.showTakeCards && !isSplitView
                        }
                        className="audio-mode-home-layer min-h-0 flex-1"
                      >
                        <div data-tutorial="audio-take-cards">
                          <AudioModeHome
                            isRecording={isRecording}
                            ready={ready}
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
                            hapticFeedback={settings.hapticFeedback}
                          />
                        </div>
                      </AnimatedTabPanel>
                    </div>
                  )}

                  {!quickSettingsOpen &&
                    settings.showTakeCards &&
                    isSplitView &&
                    isAudioPracticeMainTab && (
                      <div
                        className="split-compare-host pointer-events-auto min-h-0 flex-1 px-2 pb-1.5 pt-0"
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
                          onPinChallenger={handlePinChallenger}
                          onDeleteTake={handleDragDeleteTake}
                          onDragStateChange={handlePipDragStateChange}
                          hapticFeedback={settings.hapticFeedback}
                        />
                      </div>
                    )}

                  <div className="app-hud-bottom pointer-events-none flex flex-col shrink-0">
                    {((isAudioPracticeTunerTab && showTunerTakePills) ||
                      (isAudioPracticeTimelineTab && practiceSessionActive && settings.showTakeCards)) &&
                      !quickSettingsOpen &&
                      (
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

                    {!quickSettingsOpen &&
                      settings.showTakeCards &&
                      !isSplitView &&
                      recordingMode !== 'audio' && (
                        <motion.div
                          key="pip-row"
                          className={`app-pip-row-wrap pointer-events-auto w-full ${
                            cameraTakeCardsExpanded ? '' : 'app-pip-row-wrap--compact'
                          }`}
                          data-tutorial="review-mode-button"
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={iosHudDim}
                          style={{ ...motionGpuLayer, ...pipScaleStyle }}
                        >
                          <PipCompareRow
                            compact={!cameraTakeCardsExpanded}
                            benchmarkTake={benchmarkTake}
                            libraryBenchmarkPlayback={libraryBenchmarkPlayback}
                            challengerTake={challengerTake}
                            youtubeEmbedUrl={youtubeUrl}
                            suspendPipPlayback={suspendPipPlayback}
                            benchmarkPipVideoRef={benchmarkPipVideoRef}
                            challengerPipVideoRef={challengerPipVideoRef}
                            deleteDropRef={recordDeleteDropRef}
                            onPinBenchmark={handlePinBenchmark}
                            onPinChallenger={handlePinChallenger}
                            onDeleteTake={handleDragDeleteTake}
                            onUnpinBenchmark={handleUnpinBenchmark}
                            onClearLibraryReference={handleClearLibraryReference}
                            onUnpinChallenger={handleUnpinChallenger}
                            onUploadBenchmark={handleUploadBenchmark}
                            onSubmitYoutube={handleSubmitYoutube}
                            onClearYoutube={handleClearYoutube}
                            onToggleSplitView={handleToggleSplitView}
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

                    {!quickSettingsOpen &&
                      settings.showTakeCards &&
                      !isSplitView &&
                      recordingMode !== 'audio' && (
                        <div className="camera-take-cards-toggle-wrap pointer-events-auto">
                          <Pressable
                            type="button"
                            intensity="icon"
                            squish={false}
                            haptic="light"
                            hapticFeedback={settings.hapticFeedback}
                            className="camera-take-cards-toggle"
                            onClick={() => setCameraTakeCardsExpanded((expanded) => !expanded)}
                            aria-label={
                              cameraTakeCardsExpanded
                                ? 'Collapse take cards to quick playback'
                                : 'Expand take cards and controls'
                            }
                            aria-expanded={cameraTakeCardsExpanded}
                          >
                            {cameraTakeCardsExpanded ? (
                              <ChevronDown aria-hidden />
                            ) : (
                              <ChevronUp aria-hidden />
                            )}
                            <span className="camera-take-cards-toggle__handle" aria-hidden />
                          </Pressable>
                        </div>
                      )}

                    {!(
                      isAudioPracticeTimelineTab &&
                      !practiceSessionActive &&
                      !quickSettingsOpen
                    ) && (
                      <ControlDeck
                        isRecording={isRecording}
                        isStopping={isStopping}
                        elapsed={elapsed}
                        ready={ready}
                        recordingMode={recordingMode}
                        onRecordingModeChange={handleRecordingModeChange}
                        onToggleRecord={handleToggleRecord}
                        onOpenVault={recordingMode === 'audio' ? handleToggleVault : handleOpenVault}
                        isVaultOpen={isVaultOpen}
                        vaultToggleEnabled={recordingMode === 'audio'}
                        onOpenSettings={handleOpenSettings}
                        takeCount={takes.length}
                        autoSoundListening={autoSoundListening}
                        handsFreeRecording={handsFreeRecording}
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
                        onShowMetronomeChange={handleShowMetronomeSettingChange}
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
                        settingsBranchDisabled={isSettingsOpen || isVaultOpen || isReviewOpen || isExperimentalOpen}
                        onBranchOpenChange={handleQuickSettingsOpenChange}
                        hapticFeedback={settings.hapticFeedback}
                        collapsible={
                          isAudioPracticeTunerTab || isAudioPracticeMetronomeTab
                        }
                        collapseKey={
                          isAudioPracticeTunerTab
                            ? 'tuner'
                            : isAudioPracticeMetronomeTab
                              ? 'metronome'
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
                        micStreamRef={streamRef}
                        isOpen
                        onClose={handleCloseReview}
                        onSlotChange={handleReviewSlotChange}
                        onUpdateTake={handleUpdateTake}
                        onDeleteTake={handleDeleteTake}
                        onFavoriteTake={handlePinBenchmark}
                        onPlaybackActiveChange={setReviewPlaybackPlaying}
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
                    onCreateProject={handleCreateProject}
                    onDeleteProject={handleDeleteProject}
                    takes={takes}
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

                  <CreatorStudioTakePicker
                    isOpen={isCreatorStudioPickerOpen}
                    takes={sortedTakes}
                    onClose={handleCloseCreatorStudioPicker}
                    onSelectTake={handleOpenCreatorStudio}
                  />

                  <CreatorStudio
                    isOpen={creatorStudioTake !== null}
                    take={creatorStudioTake}
                    projectName={activeProject?.name ?? null}
                    onClose={handleCloseCreatorStudio}
                  />

                  <SettingsDrawer
                    isOpen={isSettingsOpen}
                    onClose={handleCloseSettings}
                    settings={settings}
                    hudQuickSettings={hudQuickSettings}
                    onUpdate={updateSettings}
                    onPitchTrackerChange={handlePitchTrackerSettingChange}
                    onShowTakeCardsChange={handleShowTakeCardsSettingChange}
                    onShowMetronomeChange={handleShowMetronomeSettingChange}
                    onAudioEnhancerChange={handleAudioEnhancerSettingChange}
                    onReset={handleResetSettings}
                    onReplayTutorial={handleReplayOnboardingTutorial}
                    onOpenLabs={handleOpenLabs}
                    onOpenCreatorStudio={handleOpenCreatorStudioPicker}
                    onOpenMultitrack={handleOpenMultitrack}
                    recordingMode={recordingMode}
                  />

                  <LabsOverlay
                    isOpen={isLabsOpen}
                    route={labsRoute ?? 'menu'}
                    streamRef={streamRef}
                    streamGeneration={streamGeneration}
                    tunerInstrument={settings.tunerInstrument}
                    onClose={handleCloseLabs}
                    onNavigate={handleLabsNavigate}
                    onRequestMicStream={handleRequestLabsMicStream}
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
                  />
                </Suspense>

                <Suspense fallback={null}>
                  <AnimatePresence>
                    {showOnboardingTutorial && (
                      <OnboardingTutorial
                        key="onboarding-tutorial"
                        onComplete={handleCompleteOnboardingTutorial}
                        onSkip={handleSkipOnboardingTutorial}
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
  )
}
