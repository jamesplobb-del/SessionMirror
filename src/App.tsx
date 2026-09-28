import { canSaveRoutine } from './utils/routineLibrary'
import { canUsePlus, requirePlus } from './plus/plusAccess'
import { usePlus } from './plus/usePlus'
import { TakeGuidanceProvider } from './context/TakeGuidanceContext'
import { normalizeDeskMetronome } from './utils/deskMetronome'
import FeatureGuidance from './components/FeatureGuidance'
import { confirmFeatureAction, reportFeatureAction } from './utils/featureGuidance'
import { queueAudioEnhancement } from './utils/enhancementQueue'
import { recordPlannedRoutine, resolveDailyPractice, isChallengeRoutine, type DailyChallengePlan } from './utils/dailyChallengePlan'
import ChallengeRewardNotice from './components/ChallengeRewardNotice'
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
import GuidedTakeReview, { GuidedRecordingCue } from './components/GuidedTakeReview'
import SplitCompareLayout from './components/SplitCompareLayout'
import YoutubeBenchmarkPlayer from './components/YoutubeBenchmarkPlayer'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import RecordingHeader from './components/RecordingHeader'
import ReferenceWidget from './components/ReferenceWidget'
import MusicLibrary from './components/MusicLibrary'
import MusicWidgetDrawer from './components/MusicWidgetDrawer'
import { loadMusicScoreSettings, loadMusicSetup, saveMusicSetup } from './utils/musicLibrary'
import { blankDesk } from './utils/practiceRoutines'
import {
  clearPracticePlanOpen,
  getPendingPracticePlanOpen,
  subscribePracticePlanOpen,
} from './practiceTimeline/storage/routineFileOpen'
import HandsFreeStage from './components/HandsFreeStage'
import { resolveHandsFreePhase } from './utils/handsFreePhase'
import type { LabsRoute } from './components/labs/LabsOverlay'
import { useYoutubePracticePassage } from './hooks/useYoutubePracticePassage'
import ReferencePassageControls from './components/ReferencePassageControls'
import { useCameraSession } from './hooks/useCameraSession'
import { usePhysicalOrientation } from './hooks/usePhysicalOrientation'
import { useAppSettings } from './hooks/useAppSettings'
import { useAppShellPolicies } from './hooks/useAppShellPolicies'
import { useAudioPracticeTab } from './hooks/useAudioPracticeTab'
import { applyDroneFromDesk, getDroneSnapshot, subscribeDrone } from './hooks/useDrone'
import { loadLastSurface, saveLastSurface } from './utils/deskMemory'
import { loadLastPracticeDestination, saveLastPracticeDestination, type LastPracticeDestination } from './utils/lastPracticeDestination'
import { chooseInitialProjectId, rememberActiveProjectId } from './utils/lastActiveProject'
import { SKIP_MEDIA_PERMISSION_GATE } from './utils/skipMediaPermissionGate'
import type { DeskSnapshot } from './utils/workspaceDesks'
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
import { YOUTUBE_PROXY_ORIGIN, buildYoutubeProxyUrl, parseYoutubeVideoId } from './utils/youtubeEmbed'
import { isYoutubeDialogOpen } from './utils/youtubeDialogState'
import {
  deleteTakeFile,
  NATIVE_AUDIO_MIME,
  NATIVE_VIDEO_MIME,
  persistRenderedTakeVideo,
  discardRenderedTakeFile,
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
import { hasSeenDeveloperNote, markDeveloperNoteSeen } from './utils/developerNote'
import DeveloperNote from './components/DeveloperNote'
import { getInstrumentProfile, getInstrumentSettings } from './utils/instrumentProfiles'
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
  getPracticeItemState,
  listProjects,
  renameProject,
  saveLibraryAudioItem,
  saveTake,
  setProjectBenchmarkBinding,
  setProjectBestTake,
  setProjectLibraryBenchmark,
  startPracticeSession,
  uiTakesFromVaultRowsFast,
  hydrateVaultTakeRowsProgressive,
  updateLibraryItemName,
  updatePracticeItemState,
  updateVaultTake,
  type BestTakeHistoryEntry,
  type PracticeItemState,
  type Project,
  type VaultTake,
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
import {
  acquireNativeTunerMonitor,
  recoverNativeTunerMonitor,
  releaseNativeTunerMonitor,
} from './utils/nativeAudioPitchTap'
import type { PitchSourceHealth } from './hooks/useLivePitchTracker'
import { pickHudQuickSettings } from './utils/hudQuickSettings'
import { initAppFilesystem, nativeDataFileExists } from './utils/filesystemInit'
import {
  bootstrapViewport,
  requestCameraPreviewLayoutRecovery,
  stabilizeViewportAfterMediaInteraction,
} from './utils/viewportSync'
import { resumePlaybackAudioContext } from './utils/playbackAudioContext'
import { hasPracticeChart, savePracticeChart, setChartVisible } from './utils/practiceChartStorage'
import { musicExerciseTitle, prepareRoutineMusicFile } from './utils/routineMusic'
import {
  consumePendingPdfOpen,
  discardOpenedPdfCopy,
  getPendingPdfOpen,
  releaseFailedPdfOpen,
  subscribePdfOpen,
} from './utils/incomingPdfOpen'
import { loadExerciseLibrary } from './utils/routineLibrary'
import {
  APP_BACKGROUND_SUSPEND_EVENT,
  APP_FOREGROUND_RECOVERY_EVENT,
  isAppInForeground,
  subscribeAppForeground,
} from './utils/appForeground'
import { loadAppSettingsForSessionStart } from './utils/appSettings'
import {
  applyAutoPlaybackLeadIn,
  attachAutoPlaybackTailSkip,
  resolveAutoPlaybackStartSeconds,
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
import PracticeHub from './components/PracticeHub'

import YoutubeUrlDialog from './components/YoutubeUrlDialog'
import { PracticeReferenceContext } from './context/PracticeReferenceContext'
import {
  getSelectedReferenceUrl,
  selectPracticeReference,
} from './utils/practiceReferences'
import RoutineBar from './components/RoutineBar'
import PracticeToolStrip from './components/PracticeToolStrip'
import { prepareRoutineProgram, pauseRoutineProgram, exitRoutineProgram } from './utils/routineProgram'
import { PracticeTransitionGate } from './utils/practiceTransitions'
import { findRoutinePracticeProject } from './db/practiceRepository'
import {
  checkpointRoutineDay,
  pauseRoutineDay,
  holdRoutineDay,
  resumeRoutineDay,
  startRoutineDayStep,
  settleRoutineDayStep,
  loadPreferredInstrumentId,
  loadRoutine,
  loadRoutineDay,
  reconcileDay,
  routineResumeStep,
  savePreferredInstrumentId,
  saveRoutine,
  saveRoutineDay,
  stepAfter,
  todayKey,
  type Routine,
  type RoutineDay,
} from './utils/practiceRoutines'
import type { RoutineBuilderMode } from './components/RoutineBuilder'
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
const PracticeChartLayer = lazy(() => import('./components/PracticeChartLayer'))
const DraggablePitchWidget = lazy(() => import('./components/DraggablePitchWidget'))
const DraggableTakesWidget = lazy(() => import('./components/DraggableTakesWidget'))
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
import { getPendingMultitrackFile, subscribeMultitrackFile } from './multitrack/state/multitrackFileOpen'
const MultitrackOverlay = lazy(() => import('./multitrack/components/MultitrackOverlay'))

/** Wait for Settings sheet exit before attaching pitch engine (matches drawer close animation). */
const PITCH_ENGINE_COMMIT_DELAY_MS = 300

interface RoutinePracticeSelection {
  projectId: string
  focusArea: string
}

interface AppBootSnapshot {
  projects: Project[]
  activeProjectId: string | null
  takes: Take[]
  /** Raw rows, so hydration can finish in the background after first render. */
  takeRows: VaultTake[]
  benchmarkId: string | null
  challengerId: string | null
  libraryItems: HydratedLibraryItem[]
  benchmarkBinding: BenchmarkBinding | null
  bestTakeHistory: BestTakeHistoryEntry[]
  practiceItemStates: PracticeItemState[]
}

const BOOT_REVEAL_DELAY_MS = 0

function formatBootFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : null
  const base = 'BestTake could not finish starting. Your saved takes are still on this device.'
  return detail ? `${base}\n\n${detail}` : base
}

async function performAppBoot(): Promise<AppBootSnapshot> {
  await Promise.all([initVaultDatabase(), initAppFilesystem()])

  const settings = loadAppSettingsForSessionStart()
  const projectList = await listProjects()
  const initialId = chooseInitialProjectId(projectList)
  let takes: Take[] = []
  let takeRows: VaultTake[] = []
  let benchmarkId: string | null = null
  let challengerId: string | null = null
  let libraryItems: HydratedLibraryItem[] = []
  let benchmarkBinding: BenchmarkBinding | null = null
  const [bestTakeHistory, practiceItemStates] = await Promise.all([
    listBestTakeHistory(),
    listPracticeItemStates(),
  ])

  if (initialId) {
    // None of these three reads depends on the others; awaiting them one after
    // another added their latencies together on every launch.
    const [rows, hydratedLibrary, binding] = await Promise.all([
      getTakesByProject(initialId),
      getLibraryItemsByProject(initialId).then((libraryRows) =>
        hydrateLibraryItems(
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
      ),
      getProjectBenchmarkBinding(initialId),
    ])

    takeRows = rows
    libraryItems = hydratedLibrary
    benchmarkBinding = binding
    benchmarkId = findBestTakeId(rows)
    const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null
    challengerId = settings.showTakeCards ? defaultChallengerId : null

    // Metadata only: no filesystem or URL work. Playback URLs and thumbnails
    // stream in after first render, exactly as they do when the active project
    // changes. Awaiting hydrateVaultTakeRowsProgressive here made cold start
    // scale with the size of the vault — it does one native file-exists round
    // trip per take, then yields a frame between every batch of three.
    takes = uiTakesFromVaultRowsFast(rows)
  }

  return {
    projects: projectList,
    activeProjectId: initialId,
    takes,
    takeRows,
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
  const [takesLoaded, setTakesLoaded] = useState(true)
  const [projects, setProjects] = useState<Project[]>(bootSnapshot.projects)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    bootSnapshot.activeProjectId
  )
  const [benchmarkId, setBenchmarkId] = useState<string | null>(bootSnapshot.benchmarkId)
  const [guidedTakeId, setGuidedTakeId] = useState<string | null>(null)
  const [guidedAudioBothTakeId, setGuidedAudioBothTakeId] = useState<string | null>(null)
  const [guidedNextFocus, setGuidedNextFocus] = useState<string | null>(null)
  const [challengerId, setChallengerId] = useState<string | null>(bootSnapshot.challengerId)
  const [libraryItems, setLibraryItems] = useState<HydratedLibraryItem[]>(bootSnapshot.libraryItems)
  const [referenceExpanded, setReferenceExpanded] = useState(false)
  const [referenceVisible, setReferenceVisible] = useState(false)
  const [musicWorkspaceExpandRequest, setMusicWorkspaceExpandRequest] = useState<{
    pitch?: boolean
    metronome?: boolean
    drone?: boolean
    takes?: boolean
  }>({})
  const [musicTakesVisible, setMusicTakesVisible] = useState(false)
  const [referencePlaying, setReferencePlaying] = useState(false)
  const [referenceAudioId, setReferenceAudioId] = useState<string | null>(null)
  const [benchmarkBinding, setBenchmarkBinding] = useState<BenchmarkBinding | null>(
    bootSnapshot.benchmarkBinding
  )
  const [bestTakeHistory, setBestTakeHistory] = useState<BestTakeHistoryEntry[]>(
    bootSnapshot.bestTakeHistory,
  )
  const [practiceItemStates, setPracticeItemStates] = useState<PracticeItemState[]>(
    bootSnapshot.practiceItemStates,
  )
  // Returning players land on Practice Home on the first rendered frame. The
  // recorder can initialize underneath without flashing before Home appears.
  const [isPracticeHubOpen, setIsPracticeHubOpen] = useState(() => isOnboardingComplete())
  const [focusedPractice, setFocusedPractice] = useState<RoutinePracticeSelection | null>(null)
  const [focusPanel, setFocusPanel] = useState<'references' | null>(null)
  const [focusedPracticeSessionId, setFocusedPracticeSessionId] = useState<string | null>(null)
  const [focusedReferenceTakeId, setFocusedReferenceTakeId] = useState<string | null>(null)
  const focusedPreviousChallengerRef = useRef<string | null>(null)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [reviewContext, setReviewContext] = useState<ReviewContext>('compare')
  const [vaultReviewIndex, setVaultReviewIndex] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [dailyGameLaunch, setDailyGameLaunch] = useState<DailyChallengePlan | null>(null)
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
  const autoPlaybackTakeIdRef = useRef<string | null>(null)
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
  /** The part is actually covering the room, so the HUD stops painting over it. */
  const [musicPageVisible, setMusicPageVisible] = useState(false)
  const [musicWidgetDrawerOpen, setMusicWidgetDrawerOpen] = useState(() => {
    try { return localStorage.getItem('besttake:music-widget-drawer:v1') !== 'closed' }
    catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('besttake:music-widget-drawer:v1', musicWidgetDrawerOpen ? 'open' : 'closed') }
    catch { /* Keep the current drawer state if storage is unavailable. */ }
  }, [musicWidgetDrawerOpen])
  /** Bumped when music is saved or re-shown from outside the page, so it reloads. */
  const [musicChartRevision, setMusicChartRevision] = useState(0)
  useEffect(() => {
    const refreshImportedMusic = () => {
      void listProjects().then(items => { setProjects(items); setMusicChartRevision(value => value + 1) })
        .catch(error => console.warn('Could not refresh imported routine music', error))
    }
    window.addEventListener('besttake:practice-plan-music-imported', refreshImportedMusic)
    return () => window.removeEventListener('besttake:practice-plan-music-imported', refreshImportedMusic)
  }, [])
  const [musicLibraryOpen, setMusicLibraryOpen] = useState(true)
  const musicSetupOwnerRef = useRef<string | null>(null)
  /** Rehearsal view: the player has put the tabs and the deck away as well. */
  const [musicChromeHidden, setMusicChromeHidden] = useState(false)
  const [pendingPitchTrackerEnabled, setPendingPitchTrackerEnabled] = useState<boolean | null>(null)
  /** Saved desks — chips at the top of the Workspace tray. */
  /** The live room, kept current so a focused take can remember the desk it was played on. */
  const liveDeskSnapshotRef = useRef<DeskSnapshot | null>(null)
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
  const [splitReferenceActive, setSplitReferenceActive] = useState(false)
  const splitReturnTabRef = useRef<AudioPracticeTab | null>(null)
  const isSplitViewRef = useRef(false)
  const [splitRatio, setSplitRatio] = useState(56)
  // The legacy compact/full card state remains available to the existing
  // presentation architecture, but Camera Mode no longer exposes its chevron trigger.
  const [cameraTakeCardsExpanded] = useState(false)
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false)
  const [showDeveloperNote, setShowDeveloperNote] = useState(() => isOnboardingComplete() && !hasSeenDeveloperNote())
  const pendingDeveloperNoteRef = useRef(false)
  const [tutorialTourEnabled, setTutorialTourEnabled] = useState(false)

  /* ---- Daily routine ------------------------------------------------------
   * One routine, one card of progress for today. The routine is the checklist;
   * each step carries a desk so starting it is a single tap. */
  const [routine, setRoutine] = useState<Routine | null>(() => loadRoutine())
  const [lastPracticeDestination, setLastPracticeDestination] = useState(loadLastPracticeDestination)
  const rememberLastPracticeDestination = useCallback((destination: LastPracticeDestination) => {
    saveLastPracticeDestination(destination)
    setLastPracticeDestination(destination)
  }, [])
  const [routineDay, setRoutineDay] = useState<RoutineDay | null>(() => {
    const stored = loadRoutine()
    return stored ? loadRoutineDay(stored) : null
  })
  const [routineBuilderRequest, setRoutineBuilderRequest] = useState<RoutineBuilderMode | null>(null)
  const [incomingRoutine, setIncomingRoutine] = useState<Routine | null>(null)
  const [preferredInstrumentId, setPreferredInstrumentId] = useState<string | null>(() =>
    loadPreferredInstrumentId(),
  )
  const focusedRoutineContextRef = useRef<{ routineId: string; stepId: string } | null>(null)
  const routineResumeRef = useRef<((stepId: string) => Promise<void>) | null>(null)
  const [focusedSoloReview, setFocusedSoloReview] = useState(false)
  const practiceTransition = useRef(new PracticeTransitionGate())
  const [practiceTransitionBusy, setPracticeTransitionBusy] = useState(false)
  const captureBusyRef = useRef(false)
  const pendingTakeSavesRef = useRef(new Set<string>())
  const [pendingTakeSaves, setPendingTakeSaves] = useState(0)
  const routineRef = useRef<Routine | null>(routine)
  routineRef.current = routine
  useEffect(() => {
    // A one-minute daily challenge can open a temporary folder. Keep the
    // musician's last real folder for the next launch instead.
    if (activeProjectId && !isChallengeRoutine(routineRef.current)) rememberActiveProjectId(activeProjectId)
  }, [activeProjectId])
  const routineDayRef = useRef<RoutineDay | null>(routineDay)
  routineDayRef.current = routineDay

  useEffect(() => {
    if (!isChallengeRoutine(routine)) saveRoutine(routine)
  }, [routine])

  useEffect(() => {
    try { saveRoutineDay(routineDay) }
    catch { setTakeDeleteError('Practice progress could not be saved on this device. Your recordings are separate and remain saved.') }
  }, [routineDay])

  const commitRoutineDay = useCallback((next: RoutineDay | null) => {
    // Synchronous ref commit prevents rapid Done/Next from seeing yesterday's state.
    routineDayRef.current = next
    setRoutineDay(next)
    try { saveRoutineDay(next); recordPlannedRoutine(next) }
    catch { setTakeDeleteError('Practice progress could not be saved on this device. Your recordings are separate and remain saved.') }
  }, [])

  const runPracticeTransition = useCallback((key: string, work: () => Promise<void>) => {
    if (captureBusyRef.current) return Promise.reject(new Error('Finish saving this take before switching practice items.'))
    return practiceTransition.current.run(key, async () => {
      setPracticeTransitionBusy(true)
      try { await work() } finally { setPracticeTransitionBusy(false) }
    })
  }, [])
  const [practiceSessionActive, setPracticeSessionActive] = useState(false)
  const [practiceRecordingControlsExpanded, setPracticeRecordingControlsExpanded] = useState(false)
  const [showTunerTakePills, setShowTunerTakePills] = useState(false)

  const { settings, updateSettings, resetSettings } = useAppSettings()
  const plus = usePlus()
  // Focus references are for listening between attempts; regular practice keeps its play-along preference.
  const shouldPauseYoutubeForRecording = Boolean(focusedPractice) || settings.excludeYoutubeFromRecording
  const {
    activeTab: audioPracticeTab,
    setActiveTab: setAudioPracticeTab,
  } = useAudioPracticeTab(bootSurface.tab)
  const lastFullToolTab = useRef<'music' | 'tuner' | 'metronome'>(bootSurface.tab === 'metronome' || bootSurface.tab === 'tuner' ? bootSurface.tab : 'music')
  const handleAudioPracticeTabChange = useCallback(
    (tab: AudioPracticeTab) => {
      if (tab === 'music' || tab === 'tuner' || tab === 'metronome') lastFullToolTab.current = tab
      if (tab === 'music') {
        updateSettings({ showMusic: canUsePlus() })
        if (!canUsePlus()) setMusicLibraryOpen(true)
      }
      if (tab === 'tuner' && audioPracticeTab !== 'tuner') {
        setShowTunerTakePills(false)
        // Start native capture in this tap. Waiting for the tab effect left
        // iPhone on "Tap to reactivate tuner" because the mic request ran
        // after the gesture — and after a deferred tab transition.
        void acquireNativeTunerMonitor(settings.micInputPreference)
      } else if (tab !== 'tuner' && audioPracticeTab === 'tuner') {
        void releaseNativeTunerMonitor()
      }
      setAudioPracticeTab(tab)
      if (tab === 'games') {
        setShowPitch(false)
        setLabsRoute('menu')
      }
    },
    [audioPracticeTab, setAudioPracticeTab, settings.micInputPreference, updateSettings]
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
  /** No older current take remains — skip auto-fill until the next recording. */
  const challengerUserDismissedRef = useRef(false)
  const reloadTakesGenerationRef = useRef(0)
  const takesRef = useRef<Take[]>([])
  const pendingAutoPlaybackRef = useRef(false)
  const audioTakeReadinessInputRef = useRef(
    new Map<string, { filePath: string; fallbackUrl: string }>()
  )
  const autoPlaybackAudioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlaybackUsesNativeRef = useRef(false)
  const autoPlaybackStartTimerRef = useRef<number | null>(null)
  const autoPlaybackTailCleanupRef = useRef<(() => void) | null>(null)
  const liveMicPlaceholderRef = useRef<HTMLMediaElement | null>(null)
  const queuedAutoPlayRef = useRef<{ url: string; takeId: string } | null>(null)
  const recordingModeRef = useRef<RecordingMode>('video')
  const cameraReadyRef = useRef(false)
  const pitchCommitTimerRef = useRef<number | null>(null)
  const autoPlaybackReleaseTimerRef = useRef<number | null>(null)
  const autoPlaybackGenerationRef = useRef(0)
  const autoPlaybackFinishInFlightRef = useRef<Promise<void> | null>(null)
  const playAutoTakeAudioRef = useRef<
    (
      playbackUrl: string,
      takeId: string,
      performanceStartSeconds?: number,
      filePath?: string,
      playbackGainDb?: number,
      playbackDurationSeconds?: number
    ) => void
  >(() => {})
  const refreshCameraSessionRef = useRef<() => Promise<void>>(async () => {})
  const suspendCameraForBackgroundRef = useRef<() => void | Promise<void>>(() => {})
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
  const focusedPracticeRef = useRef<RoutinePracticeSelection | null>(focusedPractice)
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
      // Practice Home is already open in initial state, before the recorder's
      // first frame can paint.
      return
    }
    const timer = window.setTimeout(() => {
      setShowOnboardingTutorial(true)
    }, BOOT_REVEAL_DELAY_MS + 240)
    return () => window.clearTimeout(timer)
  }, [])

  const finishOnboardingTutorial = useCallback(() => {
    markAllCoachMarksSeen()
    setShowOnboardingTutorial(false)
    setTutorialTourEnabled(false)
    setIsPracticeHubOpen(true)
    // The note must wait for AnimatePresence to finish removing onboarding.
    pendingDeveloperNoteRef.current = !hasSeenDeveloperNote()
  }, [])

  const closeDeveloperNote = useCallback(() => {
    markDeveloperNoteSeen()
    setShowDeveloperNote(false)
  }, [])

  /**
   * Home title and onboarding share this: the horn writes tuner, written pitch,
   * and the auto-record gate. Today's checks and the desks already on the
   * routine stay put — only the instrument id on the routine changes, so
   * suggestions retune next time the builder opens.
   */
  const handleSelectInstrument = useCallback(
    (instrumentId: string) => {
      const instrumentSettings = getInstrumentSettings(instrumentId)
      if (!instrumentSettings) return
      updateSettings(instrumentSettings)
      savePreferredInstrumentId(instrumentId)
      setPreferredInstrumentId(instrumentId)
      setRoutine((current) =>
        current && current.instrumentId !== instrumentId
          ? { ...current, instrumentId, updatedAt: Date.now() }
          : current,
      )
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
    if (autoPlaybackStartTimerRef.current !== null) {
      window.clearTimeout(autoPlaybackStartTimerRef.current)
      autoPlaybackStartTimerRef.current = null
    }
    autoPlaybackTailCleanupRef.current?.()
    autoPlaybackTailCleanupRef.current = null
    let nativeStop: Promise<void> = Promise.resolve()
    if (autoPlaybackUsesNativeRef.current) {
      autoPlaybackUsesNativeRef.current = false
      nativeStop = audioModePlaybackControlsRef.pause?.() ?? nativeStop
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
    return nativeStop
  }, [])

  const teardownActiveAutoPlayback = useCallback(() => {
    autoPlaybackGenerationRef.current += 1
    queuedAutoPlayRef.current = null
    const nativeStop = teardownAutoPlaybackMedia()
    autoPlaybackTakeIdRef.current = null
    setAutoPlaybackTakeId(null)
    return nativeStop
  }, [teardownAutoPlaybackMedia])

  const stopAutoPlaybackAudio = useCallback(() => {
    pendingAutoPlaybackRef.current = false
    setHandsFreePlaybackPending(false)
    void teardownActiveAutoPlayback()
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
      if (!Capacitor.isNativePlatform() && document.visibilityState !== 'visible') suspendInteractiveAudio()
    }
    const onBackgroundSuspend = () => suspendInteractiveAudio()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackgroundSuspend)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackgroundSuspend)
    }
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const finishAutoPlayback = useCallback((): Promise<void> => {
    // Tab changes and mode changes can both request this handoff from one tap.
    // They must share the same player stop and route restore transaction.
    if (autoPlaybackFinishInFlightRef.current) return autoPlaybackFinishInFlightRef.current
    // Keep the handoff phase latched until route cleanup finishes. Clearing
    // pending before the speaker releases briefly painted "Your turn" while
    // the microphone was still unavailable (especially on the music stand).
    autoRecordStartSuppressedRef.current = true
    setAutoRecordStartSuppressed(true)
    pendingAutoPlaybackRef.current = false
    const nativeStop = teardownActiveAutoPlayback()
    const completedGeneration = autoPlaybackGenerationRef.current
    const finish = nativeStop.catch((error) => {
      console.warn('[HandsFree] native playback stop failed during handoff', error)
    }).then(() => finalizeTakePlaybackCleanup()).finally(() => {
      if (autoPlaybackGenerationRef.current !== completedGeneration) return
      setHandsFreePlaybackPending(false)
      releaseAutoRecordSuppress(AUTO_PLAYBACK_POST_COOLDOWN_MS)
      if (recordingModeRef.current === 'audio') {
        stabilizeViewportAfterMediaInteraction()
        window.requestAnimationFrame(() => {
          if (autoSoundRecordingEnabledRef.current) {
            restartHandsFreeMonitorRef.current({ force: true })
          } else {
            void refreshCameraSessionRef.current()
          }
        })
      } else if (autoSoundRecordingEnabledRef.current) {
        // Camera playback tears down and rebuilds the native capture session.
        // Re-arm the monitor after that route restore too; otherwise the HUD
        // can remain on “Getting ready” after the first camera take.
        window.requestAnimationFrame(() => {
          if (recordingModeRef.current === 'video' && autoSoundRecordingEnabledRef.current) {
            restartHandsFreeMonitorRef.current({ force: true })
          }
        })
      }
    })
    autoPlaybackFinishInFlightRef.current = finish
    void finish.then(
      () => { if (autoPlaybackFinishInFlightRef.current === finish) autoPlaybackFinishInFlightRef.current = null },
      () => { if (autoPlaybackFinishInFlightRef.current === finish) autoPlaybackFinishInFlightRef.current = null },
    )
    return finish
  }, [releaseAutoRecordSuppress, teardownActiveAutoPlayback])

  const playAutoTakeAudio = useCallback(
    (
      playbackUrl: string,
      takeId: string,
      performanceStartSeconds?: number,
      filePath = '',
      playbackGainDb?: number,
      playbackDurationSeconds?: number
    ) => {
      if (recordingModeRef.current !== 'audio') {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        return
      }

      if (!playbackUrl) {
        pendingAutoPlaybackRef.current = false
        finishAutoPlayback()
        return
      }

      const playbackGeneration = autoPlaybackGenerationRef.current + 1
      autoPlaybackGenerationRef.current = playbackGeneration

      const sessionId = createPlaybackDiagSession('auto-playback')
      setActivePlaybackDiagSession(sessionId)
      const previousAutoPlaybackTakeId = queuedAutoPlayRef.current?.takeId ?? null
      const newestTakeId = takesRef.current[takesRef.current.length - 1]?.id ?? null

      const previousPlaybackStop = teardownAutoPlaybackMedia()
      queuedAutoPlayRef.current = { url: playbackUrl, takeId }

      autoRecordStartSuppressedRef.current = true
      setAutoRecordStartSuppressed(true)
      sharedMetronomeEngine.holdClickAcrossPlayback()
      setHandsFreePlaybackPending(true)
      setAutoPlaybackPlaying(false)
      autoPlaybackTakeIdRef.current = takeId
      setAutoPlaybackTakeId(takeId)

      const isCurrentPlayback = () => autoPlaybackGenerationRef.current === playbackGeneration
      const clearStartTimeout = () => {
        if (!isCurrentPlayback()) return
        if (autoPlaybackStartTimerRef.current !== null) {
          window.clearTimeout(autoPlaybackStartTimerRef.current)
          autoPlaybackStartTimerRef.current = null
        }
      }
      const failPlayback = () => {
        if (!isCurrentPlayback()) return
        setTakeDeleteError('Playback could not start. Your take is saved in Vault; try playing it there.')
        setActivePlaybackDiagSession(null)
        finishAutoPlayback()
      }
      // A lost bridge/media callback must never leave hands-free waiting forever.
      autoPlaybackStartTimerRef.current = window.setTimeout(failPlayback, 15000)

      // Use the same native player as manual Audio and Vault playback. The
      // shared controller falls back to WebKit if native startup fails.
      const useNativeAudioPlayback =
        Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios' &&
        Boolean(filePath)

      if (useNativeAudioPlayback) {
        autoPlaybackUsesNativeRef.current = true
        void (async () => {
          await previousPlaybackStop
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
          if (!isCurrentPlayback()) return
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

          const fileExists = await nativeDataFileExists(filePath)
          if (!isCurrentPlayback()) return
          if (!fileExists) {
            console.warn('[Playback] native auto-playback aborted — recording file missing', {
              takeId,
              filePath,
            })
            setActivePlaybackDiagSession(null)
            finishAutoPlayback()
            return
          }

          const startTime = resolveAutoPlaybackStartSeconds(
            performanceStartSeconds,
            playbackDurationSeconds,
          )
          let tailTimer: number | null = null
          const clearTailTimer = () => {
            if (tailTimer !== null) {
              window.clearTimeout(tailTimer)
              tailTimer = null
            }
          }
          autoPlaybackTailCleanupRef.current = clearTailTimer
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
                // A late callback belongs to the old request; never pause
                // the newer take using the shared player.
                if (!isCurrentPlayback()) return
                clearStartTimeout()
                setHandsFreePlaybackPending(false)
                setAutoPlaybackPlaying(true)
                const remainingPlaybackSeconds = duration - startTime
                const tailSkipSeconds = settings.soundSilenceSeconds
                if (remainingPlaybackSeconds > tailSkipSeconds + 0.25) {
                  tailTimer = window.setTimeout(() => {
                    tailTimer = null
                    if (autoPlaybackGenerationRef.current !== playbackGeneration) return
                    const stopped = audioModePlaybackControlsRef.pause?.()
                    if (stopped) void stopped.then(completeNativeAutoPlayback, completeNativeAutoPlayback)
                    else completeNativeAutoPlayback()
                  }, (remainingPlaybackSeconds - tailSkipSeconds) * 1000)
                }
              },
              onFailed: () => {
                if (autoPlaybackGenerationRef.current !== playbackGeneration) return
                setTakeDeleteError('Playback could not start. Your take is saved in Vault; try playing it there.')
                completeNativeAutoPlayback()
              },
              onEnded: completeNativeAutoPlayback,
            }
          )
        })().catch(failPlayback)
        return
      }

      const audio = autoPlaybackAudioRef.current
      if (!audio) {
        pendingAutoPlaybackRef.current = false
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
        await previousPlaybackStop
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
            await suspendCameraForBackgroundRef.current()
            await waitMs(AUDIO_PLAYBACK_CAPTURE_SUSPEND_MS)
            await preparePlaybackRoute({ suspendCamera: false })
          }
        } catch (error) {
          if (!isCurrentPlayback()) { detachPipeline(); return }
          console.warn('[PlaybackRoute] auto-playback prep failed', error)
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
          return
        }

        if (!isCurrentPlayback()) { detachPipeline(); return }
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

        if (!isCurrentPlayback()) { detachPipeline(); return }
        await applyAutoPlaybackLeadIn(audio, undefined, performanceStartSeconds)
        if (!isCurrentPlayback()) { detachPipeline(); return }

        const completeAutoPlayback = () => {
          if (autoPlaybackComplete || !isCurrentPlayback()) return
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
        autoPlaybackTailCleanupRef.current = () => {
          detachTailSkip?.()
          detachPipeline()
        }
        audio.onended = completeAutoPlayback
        audio.onerror = completeAutoPlayback

        const started = await playTakeMediaAudible(audio, {
          skipRoutePrep: true,
          attachEndedRouteRestore: false,
          restoreRouteOnFailure: false,
          onFailure: () => { if (isCurrentPlayback()) setAutoPlaybackPlaying(false) },
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

        if (!isCurrentPlayback()) return
        if (started) {
          clearStartTimeout()
          setHandsFreePlaybackPending(false)
          setAutoPlaybackPlaying(true)
        } else {
          detachPipeline()
          setActivePlaybackDiagSession(null)
          finishAutoPlayback()
        }
      })().catch(() => {
        detachTailSkip?.()
        detachPipeline()
        failPlayback()
      })
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
      setTakesLoaded(false)
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
      setTakesLoaded(true)
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
    const rows = bootSnapshot.takeRows
    if (rows.length === 0) return

    // Boot now renders from metadata alone, so playback URLs and thumbnails are
    // resolved here instead — a large vault costs the first screen nothing.
    // Mirrors the background hydration reloadTakes runs on a project switch,
    // and defers to it: a switch bumps the generation and this drops out.
    const generation = reloadTakesGenerationRef.current
    const priorityIds = [bootSnapshot.benchmarkId, bootSnapshot.challengerId].filter(
      (id): id is string => Boolean(id),
    )
    let cancelled = false

    const cancelIdle = scheduleIdle(() => {
      if (cancelled || generation !== reloadTakesGenerationRef.current) return

      void hydrateVaultTakeRowsProgressive(rows, {
        priorityIds,
        onBatch: (partial) => {
          if (cancelled || generation !== reloadTakesGenerationRef.current) return
          setTakes((current) => mergeHydratedTakes(current, partial))
        },
      }).then((loaded) => {
        if (cancelled || generation !== reloadTakesGenerationRef.current) return
        setTakes((current) => mergeHydratedTakes(current, loaded))
        void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnails)
      })
    }, 500)

    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [
    applyTakeThumbnails,
    bootSnapshot.takeRows,
    bootSnapshot.benchmarkId,
    bootSnapshot.challengerId,
  ])

  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (projectId === activeProjectIdRef.current) return

      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      activeProjectIdRef.current = projectId
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

  const handleRenameMusicScore = useCallback(async (projectId: string, name: string) => {
    await renameProject(projectId, name)
    setProjects(current => current.map(project => project.id === projectId ? { ...project, name: name.trim() } : project))
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
      const replayGeneration = autoPlaybackGenerationRef.current
      const replayStillRequested = () => shouldAutoPlay &&
        autoPlaybackGenerationRef.current === replayGeneration &&
        autoSoundRecordingEnabledRef.current && isAppInForeground()
      const playbackGainDb = resolveNativePlaybackGainDb(
        payload.captureDiagnostics?.playbackGainMetadata
      )

      const optimisticUrl =
        resolveTakePlaybackUrlFast(filePath, videoUrl) ??
        (videoUrl ? resolveMediaPlaybackSrc(videoUrl) : '')
      const projectId = activeProjectIdRef.current
      const focusedAtCapture = focusedRoutineContextRef.current ? null : focusedPracticeRef.current
      const practiceSessionIdAtCapture = focusedRoutineContextRef.current ? null : focusedPracticeSessionIdRef.current
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

      pendingTakeSavesRef.current.add(takeId)
      setPendingTakeSaves(pendingTakeSavesRef.current.size)
      captureBusyRef.current = true
      let takePersisted = false
      const markTakePersisted = () => {
        takePersisted = true
        pendingTakeSavesRef.current.delete(takeId)
        setPendingTakeSaves(pendingTakeSavesRef.current.size)
      }
      if (focusedAtCapture?.projectId === projectId) {
        // The session remembers the room it was played in; resume restores it.
        if (liveDeskSnapshotRef.current) {
          const day = routineDayRef.current
          if (day?.activeStepId) commitRoutineDay(checkpointRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
        }
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
        if (!multitrackRecordingActiveRef.current) {
          setGuidedNextFocus(null)
          setGuidedAudioBothTakeId(null)
          if (!shouldAutoPlay) setGuidedTakeId(takeId)
        }
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
        sharedMetronomeEngine.holdClickAcrossPlayback()
        setHandsFreePlaybackPending(true)
      } else if (shouldAutoPlay && mediaType === 'video') {
        pendingAutoPlaybackRef.current = false
        autoRecordStartSuppressedRef.current = true
        setAutoRecordStartSuppressed(true)
        sharedMetronomeEngine.holdClickAcrossPlayback()
        setHandsFreePlaybackPending(true)
        setAutoPlaybackPlaying(false)
        autoPlaybackTakeIdRef.current = takeId
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

          markTakePersisted()
          if (activeProjectIdRef.current === projectId) reportFeatureAction('take-saved')
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

        if (!takePersisted) throw new Error('The recording could not be added to your library.')
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
          if (replayStillRequested()) {
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
              if (!replayStillRequested() || recordingModeRef.current !== 'audio') break
              console.info('[TakeReadiness] hands-free retry', { takeId, attempt: attempt + 1 })
              readiness = await prepareAudioTakePlayback(takeId)
            }

            if (readiness && replayStillRequested()) {
              pendingAutoPlaybackRef.current = false
              playAutoTakeAudioRef.current(
                readiness.playbackUrl,
                takeId,
                autoPerformanceStartSeconds,
                resolvedFilePath,
                playbackGainDb,
                readiness.durationSeconds
              )
            } else if (replayStillRequested()) {
              console.warn('[TakeReadiness] hands-free playback skipped — take never became ready', {
                takeId,
              })
              pendingAutoPlaybackRef.current = false
              setHandsFreePlaybackPending(false)
              releaseAutoRecordSuppress(0)
            }
          }
        }

        // Keep the original immutable; enhancement gets its own Vault entry and file.
        if (projectId && audioEnhancerEnabledRef.current && isNativeCameraPlatform && resolvedFilePath) {
          const params = buildNativeEnhancerParams(audioEnhancerSettingsRef.current)
          void queueAudioEnhancement(async () => {
            let copyPath: string | undefined
            let outputPath: string | undefined
            try {
              if (!(await getTakesByProject(projectId)).some(take => take.id === takeId)) return
              const fileUri = await resolveNativeFileUri(resolvedFilePath)
              if (!fileUri) return
              const rendered = await BestTakeAudioPlugin.enhanceTakeAudio({
                url: fileUri, mediaType: mediaType === 'audio' ? 'audio' : 'video', params,
              })
              outputPath = rendered.path
              if (!rendered.enhanced || !Number.isFinite(rendered.duration) || rendered.duration <= 0) {
                throw new Error('Invalid enhanced recording')
              }
              const original = (await getTakesByProject(projectId)).find((take) => take.id === takeId)
              if (!original) return // Original was deleted while rendering; do not resurrect it.
              const copyId = crypto.randomUUID()
              const persisted = await persistRenderedTakeVideo(rendered.path, copyId, mediaType === 'audio' ? 'audio' : 'video')
              copyPath = persisted.filePath
              const name = `${original.name || takesRef.current.find(take => take.id === takeId)?.name || 'Take'} · Enhanced`
              await saveTake({
                projectId, takeId: copyId, filePath: copyPath, duration: rendered.duration,
                name, mediaType, mimeType: mediaType === 'audio' ? 'audio/mp4' : 'video/mp4',
                recordingOrientation, enhancerBaked: true,
                timelineOffsetMs: original.timelineOffsetMs,
                performanceStartSeconds: original.performanceStartSeconds,
                // The original's analysis stays attached to the original. The copy can be analyzed independently.
              })
              copyPath = undefined // Ownership transferred to the Vault.
              if (activeProjectIdRef.current === projectId) {
                const copy: Take = {
                  ...createTake(copyId, takesRef.current.length + 1, persisted.videoUrl, persisted.filePath,
                    mediaType === 'audio' ? 'audio/mp4' : 'video/mp4', mediaType),
                  name, duration: rendered.duration, enhancerBaked: true, recordingOrientation,
                  timelineOffsetMs: original.timelineOffsetMs, performanceStartSeconds: original.performanceStartSeconds,
                }
                setTakes((current) => [...current, copy])
              }
            } catch (error) {
              console.warn('[AudioEnhancer] copy failed; original remains unchanged', error)
            } finally {
              if (copyPath) await deleteTakeFile(copyPath)
              if (outputPath) await discardRenderedTakeFile(outputPath)
            }
          })
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
        if (!takePersisted) {
          setTakeDeleteError('This take could not be saved to the library. Its recording file has not been deleted. Please export it from the current take card before leaving.')
        }
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
        if (replayStillRequested()) {
          pendingAutoPlaybackRef.current = false
          setHandsFreePlaybackPending(false)
          releaseAutoRecordSuppress(0)
        }
      }).finally(() => {
        pendingTakeSavesRef.current.delete(takeId)
        setPendingTakeSaves(pendingTakeSavesRef.current.size)
      })
    },
    [commitRoutineDay, prepareAudioTakePlayback, releaseAutoRecordSuppress]
  )

  useEffect(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
    prepareNewYoutubeReference({ autoplay: false })
    setYoutubeAutoPlayOnLoad(false)
    setYoutubeUrl(canUsePlus() && activeProjectId ? getSelectedReferenceUrl(activeProjectId) : null)
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
    switchCamera,
    cameraFacingFront,
    isSwitchingCamera,
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
  captureBusyRef.current = isRecording || isStopping || pendingTakeSavesRef.current.size > 0
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
    // Both WebKit and native take playback can go silent against a live WebRTC
    // mic session. Release capture before playback, then refresh it afterward.
    console.info('[AudioModePlayback] releasing WebRTC capture before take playback')
    await suspendAudioCaptureForPlayback()
    // Music's live pitch monitor owns a separate native capture lease. Wait
    // for it to release before AVAudioEngine takes the speaker route.
    await releaseNativeTunerMonitor()
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
    if (!pendingAutoPlaybackRef.current && autoPlaybackTakeIdRef.current === null) {
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
        return suspendCameraForBackground()
      },
      // Route restoration must wait for camera recovery before a pending
      // Camera → Tools switch claims the microphone for audio pre-roll.
      resume: () => refreshCameraSession(),
      hasLivePreview: () => cameraReadyRef.current && recordingModeRef.current === 'video',
    })
    installPlaybackRouteEndedListener(() => {
      void refreshCameraSession()
    })
    registerAutoPlaybackHold(
      () =>
        pendingAutoPlaybackRef.current || autoPlaybackPlayingRef.current || handsFreePlaybackPending ||
        autoRecordStartSuppressedRef.current
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

  /*
   * The full-screen washes that tint the practice room are declared on `html`
   * with `!important`, so standing them down has to happen at the same level.
   * While the part is up the room paints nothing across it.
   */
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('app-music-page', musicPageVisible)
    return () => {
      document.documentElement.classList.remove('app-music-page')
    }
  }, [musicPageVisible])

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

  // Native hands-free pre-roll intentionally stops the WebKit microphone.
  // Do not wait for `ready` before monitoring: that left Tools/audio stuck
  // on "Getting ready" until a stream that the monitor itself has to start.
  const autoMonitoringAllowed =
    !practiceTransitionBusy &&
    !isSwitchingCamera &&
    pendingTakeSaves === 0 &&
    !isVaultOpen &&
    !isSettingsOpen &&
    !isPracticeHubOpen &&
    focusPanel === null &&
    !isReviewOpen &&
    !isExperimentalOpen

  // The instrument picker is loaded independently from the hands-free monitor.
  // Keep a family fallback so a fresh launch still gets the right acoustic
  // bias while the preferred instrument id is being restored.
  const selectedHandsFreeInstrumentFamily =
    (preferredInstrumentId ? getInstrumentProfile(preferredInstrumentId)?.family : undefined) ??
    (settings.tunerInstrument === 'strings'
      ? 'Strings'
      : settings.tunerInstrument === 'winds'
        ? 'Woodwind'
        : 'Voice & keys')

  const { handsFreeRecording, handsFreeListeningReady, restartHandsFreeMonitor, replayCountdown, finishHandsFreeTake, handsFreeNotice } =
    useAutoSoundRecording({
      enabled: settings.autoSoundRecording,
      monitoringAllowed: autoMonitoringAllowed,
      suppressStart: autoRecordStartSuppressed,
      isNativeAudioCaptureActive,
      monitoringPaused:
        referencePlaying ||
        handsFreePlaybackPending ||
        autoPlaybackPlaying ||
        audioModeTakePlaying ||
        benchmarkPipPlaying ||
        challengerPipPlaying ||
        (recordingMode === 'video' && isPreviewRecovering),
      ready,
      isRecording,
      streamRef,
      streamGeneration,
      silenceMs: settings.soundSilenceSeconds * 1000,
      volumeThreshold: settings.soundVolumeThreshold,
      instrumentFamily: selectedHandsFreeInstrumentFamily,
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
        sharedMetronomeEngine.holdClickAcrossPlayback()
        setHandsFreePlaybackPending(true)
        setAutoRecordStartSuppressed(true)
      },
      onMonitorStalled: () => {
        if (!isAppInForeground()) return
        if (settings.autoSoundRecording && recordingModeRef.current === 'audio') {
          void warmAutoRecording()
          return
        }
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
      return subscribeAppForeground((foreground) => {
        if (foreground) recoverAfterForeground()
      })
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
    if (!canOpenOverlaySheet() || isExperimentalOpen) return
    // Commit the menu first. Stopping a pre-roll can wait for the native writer
    // to finish; that wait must not delay the user's navigation.
    setIsVaultOpen(false)
    setIsSettingsOpen(true)
    deferHudMediaPause()
    scheduleAfterPaint(() => {
      if (isAutoPreRollCaptureActive()) {
        void disarmAutoRecording().catch((error) => {
          console.warn('[Settings] pre-roll cleanup failed', error)
        })
      }
    })
  }, [canOpenOverlaySheet, deferHudMediaPause, disarmAutoRecording, isAutoPreRollCaptureActive, isExperimentalOpen])

  /*
   * Tools and Camera are two different rooms, and the workspace widgets do not
   * travel between them (see the effect near `handleCloseDrone`). A desk being
   * restored sets the mode itself, so it raises this to keep what it just
   * applied.
   */
  const workspaceModeRef = useRef(recordingModeRef.current)
  const keepWorkspaceAcrossModeRef = useRef(false)
  /**
   * The Music tile crosses from Camera to Tools and asks for the page in the
   * same tap. The crossing clears every desk tool — including the music it was
   * just asked for, which is why the tile landed on a bare Tools room. The
   * crossing still clears the desk; it then turns Music on when this is set.
   */
  const openMusicAfterCrossingRef = useRef(false)

  const handleRecordingModeChange = useCallback(
    (mode: RecordingMode) => {
      const modeChanged = mode !== recordingModeRef.current
      if (modeChanged) {
        if (isRecording) return
        // Do not let Tools claim the microphone while Camera playback still
        // owns the native route. Finish the replay first, then repeat the
        // mode change against a clean capture session.
        if (
          mode === 'audio' &&
          (
            autoPlaybackFinishInFlightRef.current !== null ||
            pendingAutoPlaybackRef.current ||
            autoPlaybackTakeIdRef.current !== null
          )
        ) {
          void finishAutoPlayback().finally(() => {
            if (recordingModeRef.current !== mode) {
              handleRecordingModeChangeRef.current(mode)
            }
          })
          return
        }
        // Cancel the old surface's replay before its player unmounts and
        // before the destination starts claiming the microphone.
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
        scheduleAfterPaint(() => {
          if (recordingModeRef.current === mode) void forceNativeRecordingMode(mode)
        })
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
        //
        // Hands-Free on iOS does not want WebKit here. Camera → Tools used to
        // call getUserMedia while the camera session was still stopping; the
        // native audio pre-roll then lost the mic and stayed on Getting ready.
        scheduleAfterPaint(() => {
          if (recordingModeRef.current !== 'audio') return
          if (autoSoundRecordingEnabledRef.current) {
            // Playback route restoration and camera teardown must finish
            // before native Hands-Free claims the microphone in Tools.
            void warmAutoRecording().finally(() => {
              restartHandsFreeMonitorRef.current({ force: true })
              // iOS can finish releasing the camera route a tick after the
              // first native tap request. Retry the handoff briefly so a
              // successful warm cannot leave Tools visually ready but deaf.
              for (const delay of [350, 900, 1800]) {
                window.setTimeout(() => {
                  if (recordingModeRef.current === 'audio' && !isRecording) {
                    // The first warm can exit while replay cooldown still
                    // holds the mic. Retry the recorder as well as its level
                    // monitor after that hold clears.
                    void warmAutoRecording().finally(() => {
                      if (recordingModeRef.current === 'audio' && autoSoundRecordingEnabledRef.current) {
                        restartHandsFreeMonitorRef.current({ force: true })
                      }
                    })
                  }
                }, delay)
              }
            })
            return
          }
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
      finishAutoPlayback,
      requestCameraAccess,
      requestCameraPreviewResume,
      warmAutoRecording,
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
      // Restoring yesterday's Audio surface is not a deliberate mode switch.
      keepWorkspaceAcrossModeRef.current = true
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
    setQuickSettingsOpen(false)
    setTutorialTourEnabled(false)
    setShowOnboardingTutorial(true)
  }, [])

  const handleToggleRecord = useCallback(() => {
    if (practiceTransition.current.busy || pendingTakeSavesRef.current.size > 0) return
    // The recorder acquires input when needed. WebKit readiness may be false
    // while native hands-free pre-roll already owns a healthy microphone.

    if (isRecording && settings.autoSoundRecording) {
      finishHandsFreeTake()
      return
    }

    toggleRecording()
  }, [
    isRecording,
    settings.autoSoundRecording,
    toggleRecording,
    finishHandsFreeTake,
  ])

  const handleAutoSoundRecordingChange = useCallback(
    (enabled: boolean) => {
      if (enabled && !requirePlus('handsfree', () => handleAutoSoundRecordingChange(true))) return
      autoSoundRecordingEnabledRef.current = enabled
      updateSettings({ autoSoundRecording: enabled })

      if (!enabled) {
        finishAutoPlayback()
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
      finishAutoPlayback,
      updateSettings,
      warmAutoRecording,
    ]
  )

  // Hands-Free is opt-in for each app entry. A saved-on preference should not
  // unexpectedly seize the microphone during launch or Quick Play.
  useEffect(() => {
    autoSoundRecordingEnabledRef.current = false
    updateSettings({ autoSoundRecording: false })
    void disarmAutoRecording()
  }, [disarmAutoRecording, updateSettings])

  useEffect(() => {
    if (!plus.ready || plus.active || isRecording || isStopping || pendingTakeSaves > 0 || handsFreePlaybackPending || autoPlaybackPlaying) return
    if (settings.autoSoundRecording) handleAutoSoundRecordingChange(false)
    pauseYoutubeProxy(youtubeIframeRef.current)
    setYoutubeUrl(null)
    setReferenceAudioId(null)
    setMusicLibraryOpen(true)
    updateSettings({ showMusic: false })
  }, [plus.ready, plus.active, isRecording, isStopping, pendingTakeSaves, handsFreePlaybackPending, autoPlaybackPlaying, settings.autoSoundRecording, handleAutoSoundRecordingChange, updateSettings])

  /* ---- Desks: the whole room as one tap ---------------------------------- */
  const metronomeDeskState = useSyncExternalStore(
    sharedMetronomeEngine.subscribe,
    () => {
      const snapshot = sharedMetronomeEngine.getSnapshot()
      return JSON.stringify(normalizeDeskMetronome(snapshot))
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
      showMusic: settings.showMusic,
      showTakeCards: settings.showTakeCards,
      autoSoundRecording: settings.autoSoundRecording,
      audioEnhancerEnabled: settings.audioEnhancerEnabled,
      metronome: normalizeDeskMetronome(metronome),
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
    settings.showMusic,
    settings.showTakeCards,
    settings.soundSilenceSeconds,
  ])
  liveDeskSnapshotRef.current = liveDeskSnapshot

  const applyDeskSnapshot = useCallback(
    (desk: DeskSnapshot) => {
      if (!canUsePlus()) desk = { ...desk, showMusic: false, autoSoundRecording: false }
      updateSettings({
        pitchTrackerEnabled: desk.pitchTrackerEnabled,
        showMetronome: desk.showMetronome,
        showDrone: desk.showDrone,
        showMusic: desk.showMusic,
        showTakeCards: desk.showTakeCards,
        audioEnhancerEnabled: desk.audioEnhancerEnabled,
      })
      // Pause-before-playback is one app setting. A routine step used to copy
      // its own saved gap back over it, so the number reset every time the
      // step changed.
      showTakeCardsRef.current = desk.showTakeCards
      if (desk.autoSoundRecording !== autoSoundRecordingEnabledRef.current) {
        handleAutoSoundRecordingChange(desk.autoSoundRecording)
      } else if (desk.autoSoundRecording) {
        // Same value, but not the same monitor. Opening a routine item runs
        // inside a practice transition, which holds monitoringAllowed false and
        // tears the listener down; with the flag already on, nothing used to
        // build it back and hands-free sat on "Your turn" without hearing the
        // room. A desk hand-off is the restart case `force` exists for.
        void warmAutoRecording().finally(() => {
          if (autoSoundRecordingEnabledRef.current) {
            restartHandsFreeMonitorRef.current({ force: true })
          }
        })
      }
      const metronome = normalizeDeskMetronome(desk.metronome)
      sharedMetronomeEngine.setMeter(metronome.meter)
      if (metronome.pulseModeId) sharedMetronomeEngine.setPulseMode(metronome.pulseModeId)
      if (metronome.feelId) sharedMetronomeEngine.setFeel(metronome.feelId)
      sharedMetronomeEngine.setSubdivision(metronome.subdivision)
      sharedMetronomeEngine.setAccentLevels(metronome.accentLevels)
      sharedMetronomeEngine.setSoundId(metronome.soundId)
      sharedMetronomeEngine.setBpm(metronome.bpm)
      if (desk.showDrone) {
        applyDroneFromDesk(desk.drone.pitchClass, desk.drone.octave)
      } else {
        applyDroneFromDesk(null, desk.drone.octave)
      }
      if (desk.mode !== recordingModeRef.current) {
        // The desk has just set every widget deliberately; the crossing must
        // not then wipe them.
        keepWorkspaceAcrossModeRef.current = true
        handleRecordingModeChangeRef.current(desk.mode)
      }
    },
    [handleAutoSoundRecordingChange, updateSettings, warmAutoRecording],
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


  const handleSwitchCamera = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    void switchCamera().catch(() => {
      showAlertOutsideTree({ message: 'Could not switch cameras. Please try again.', tone: 'error' })
    })
  }, [settings.hapticFeedback, switchCamera])

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

  const challengeReturnProjectIdRef = useRef<string | null>(null)
  const restoreChallengeProject = useCallback(async () => {
    const projectId = challengeReturnProjectIdRef.current
    challengeReturnProjectIdRef.current = null
    if (projectId && projectId !== activeProjectIdRef.current) {
      await handleSelectProject(projectId).catch(error => {
        console.warn('[Routine] could not restore the previous folder', error)
      })
    }
  }, [handleSelectProject])

  const restoreRoutineAfterChallenge = useCallback(() => {
    if (!isChallengeRoutine(routineRef.current)) return
    exitRoutineProgram()
    const challengeDay = routineDayRef.current
    if (challengeDay) commitRoutineDay(pauseRoutineDay(challengeDay, Date.now(), liveDeskSnapshotRef.current))
    const saved = loadRoutine()
    routineRef.current = saved
    setRoutine(saved)
    commitRoutineDay(saved ? loadRoutineDay(saved) : null)
    // The challenge's timer is archived for resume, while Home shows the user's plan.
    focusedRoutineContextRef.current = null
    focusedPracticeRef.current = null
    focusedPracticeSessionIdRef.current = null
    setFocusedPractice(null)
    setFocusedPracticeSessionId(null)
    void restoreChallengeProject()
  }, [commitRoutineDay, restoreChallengeProject])

  useEffect(() => {
    if (isPracticeHubOpen) restoreRoutineAfterChallenge()
  }, [isPracticeHubOpen, restoreRoutineAfterChallenge])

  const handleOpenPracticeHome = useCallback(() => {
    if (isRecording || isStopping) return
    if (!canOpenOverlaySheet() || isExperimentalOpen) return
    const day = routineDayRef.current
    if (day?.activeStepId) {
      commitRoutineDay(holdRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
      pauseRoutineProgram()
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
    }
    setShowPitch(false)
    setQuickSettingsOpen(false)
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
    restoreRoutineAfterChallenge()
    setIsPracticeHubOpen(true)
    deferHudMediaPause()
  }, [
    commitRoutineDay,
    restoreRoutineAfterChallenge,
    canOpenOverlaySheet,
    deferHudMediaPause,
    isExperimentalOpen,
    isRecording,
    isStopping,
  ])

  useEffect(() => {
    const openImportedPlan = () => {
      const imported = getPendingPracticePlanOpen()
      if (!imported) return
      setIncomingRoutine(imported)
      setRoutineBuilderRequest('edit')
      handleOpenPracticeHome()
      clearPracticePlanOpen(imported.id)
    }
    const unsubscribe = subscribePracticePlanOpen(openImportedPlan)
    openImportedPlan() // Also handles a file that launched the app before React mounted.
    return unsubscribe
  }, [handleOpenPracticeHome])

  /** Today from a running step — close a game first so the hub is allowed up. */
  const handleOpenRoutineToday = useCallback(() => {
    if (isRecording || isStopping) return
    const day = routineDayRef.current
    if (day?.activeStepId) {
      commitRoutineDay(holdRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
      pauseRoutineProgram()
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
    }
    setLabsRoute(null)
    setShowPitch(false)
    setQuickSettingsOpen(false)
    setIsVaultOpen(false)
    setIsSettingsOpen(false)
    restoreRoutineAfterChallenge()
    setIsPracticeHubOpen(true)
    deferHudMediaPause()
  }, [commitRoutineDay, restoreRoutineAfterChallenge, deferHudMediaPause, isRecording, isStopping])

  /**
   * Leaving Practice Home lands the finger on the live HUD underneath, so borrow
   * the same close suppression the vault/settings sheets use.
   */
  const dismissPracticeHub = useCallback(() => {
    markOverlayClosed()
    setIsPracticeHubOpen(false)
    const day = routineDayRef.current
    if (day?.activeStepId && day.activeStepStartedAt === null) commitRoutineDay(resumeRoutineDay(day))
  }, [commitRoutineDay, markOverlayClosed])

  const handleOpenQuickPractice = useCallback(() => {
    if (practiceTransition.current.busy || captureBusyRef.current) return
    triggerLightHaptic(settings.hapticFeedback)
    handleAutoSoundRecordingChange(false)
    exitRoutineProgram()
    const sessionId = focusedPracticeSessionIdRef.current
    if (sessionId) void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Could not close this sitting. Your takes are still saved.'))
    focusedPracticeRef.current = null
    focusedPracticeSessionIdRef.current = null
    focusedRoutineContextRef.current = null
    setFocusedPractice(null)
    setFocusedReferenceTakeId(null)
    setFocusedPracticeSessionId(null)
    focusedPreviousChallengerRef.current = null
    setMusicPageVisible(false)
    setLabsRoute(null)
    handleAudioPracticeTabChange('audio')
    dismissPracticeHub()
  }, [dismissPracticeHub, handleAutoSoundRecordingChange, handleAudioPracticeTabChange, settings.hapticFeedback])

  /**
   * Closing the sheet resumes whatever context is already live — it never
   * fabricates a focus the musician did not choose, or the deck pill starts
   * lying about the session.
   */
  const handleClosePracticeHub = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    const day = routineDayRef.current
    if (day?.pausedStepId && focusedRoutineContextRef.current?.routineId === day.routineId && routineResumeRef.current) {
      void routineResumeRef.current(day.pausedStepId).catch(() => setTakeDeleteError('Could not resume practice. Try again from Today.'))
      return
    }
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

  const openRoutinePracticeSession = useCallback(
    async (projectId: string, options: { routineId: string; stepId: string; resumeSessionId: string | null; desk: DeskSnapshot | null }) => {
      const focusArea = (await listProjects()).find(project => project.id === projectId)?.name
      if (focusArea === undefined) throw new Error('This practice item was deleted. Choose another item.')
      const previousSessionId = focusedPracticeSessionIdRef.current
      focusedPreviousChallengerRef.current = null
      if (projectId !== activeProjectIdRef.current) {
        await handleSelectProject(projectId)
      }
      if (!showTakeCardsRef.current) {
        showTakeCardsRef.current = true
        updateSettings({ showTakeCards: true })
      }
      pauseYoutubeProxy(youtubeIframeRef.current)
      prepareNewYoutubeReference({ autoplay: false })
      setYoutubeAutoPlayOnLoad(false)
      setYoutubeUrl(canUsePlus() ? getSelectedReferenceUrl(projectId) : null)
      const referenceTakeId = await resolveSessionReference(projectId)
      const priorState = await getPracticeItemState(projectId)
      prepareFocusedComparisonAnalysis(projectId)
      const { session, state } = await startPracticeSession({
        projectId,
        focusArea,
        comparison: priorState?.comparison ?? (getSelectedReferenceUrl(projectId) ? 'reference-track' : 'current-best'),
        routineId: options.routineId,
        routineStepId: options.stepId,
        resumeSessionId: options.resumeSessionId,
        replaceSessionId: previousSessionId,
      })
      setPracticeItemStates((current) => [
        state,
        ...current.filter((item) => item.projectId !== state.projectId),
      ])
      focusedPracticeSessionIdRef.current = session.id
      focusedRoutineContextRef.current = { routineId: options.routineId, stepId: options.stepId }
      setFocusedSoloReview(false)
      setFocusedPracticeSessionId(session.id)
      setFocusedReferenceTakeId(referenceTakeId)
      triggerLightHaptic(settings.hapticFeedback)
      focusedPracticeRef.current = { projectId, focusArea }
      setFocusedPractice({ projectId, focusArea })
      if (options.desk) applyDeskSnapshot({ ...options.desk, showTakeCards: true })
      return session.id
    },
    [
      dismissPracticeHub,
      handleSelectProject,
      prepareFocusedComparisonAnalysis,
      projects,
      resolveSessionReference,
      applyDeskSnapshot,
      settings.hapticFeedback,
      updateSettings,
    ],
  )

  /**
   * Games sit on top of whatever is live. A focused sitting is suspended, not
   * ended: hands-free monitoring is already gated off while the overlay is
   * open, and the strip is back the moment the game closes.
   */
  const handleOpenPracticeGames = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    dismissPracticeHub()
    handleRecordingModeChange('audio')
    setDailyGameLaunch(null)
    setLabsRoute('menu')
    deferHudMediaPause()
  }, [
    deferHudMediaPause,
    dismissPracticeHub,
    handleRecordingModeChange,
    settings.hapticFeedback,
  ])

  const handleOpenFullPracticeTool = useCallback(
    async (tab: 'music' | 'metronome' | 'tuner') => {
      triggerLightHaptic(settings.hapticFeedback)
      dismissPracticeHub()
      setIsSettingsOpen(false)
      setIsVaultOpen(false)
      setQuickSettingsOpen(false)
      setShowPitch(false)
      setLabsRoute(null)
      const openTool = () => {
        if (tab === 'music' && recordingModeRef.current !== 'audio') {
          openMusicAfterCrossingRef.current = true
          setMusicLibraryOpen(true)
        }
        handleRecordingModeChange('audio')
        handleAudioPracticeTabChange(tab)
        deferHudMediaPause()
      }
      if (
        recordingModeRef.current === 'video' &&
        (autoPlaybackFinishInFlightRef.current || pendingAutoPlaybackRef.current || autoPlaybackTakeIdRef.current)
      ) {
        // Keep the Music tab from mounting while Camera's replay is still
        // restoring its audio route. Opening it early starts a second cleanup.
        await finishAutoPlayback().then(openTool, openTool)
        return
      }
      openTool()
    },
    [
      deferHudMediaPause,
      dismissPracticeHub,
      finishAutoPlayback,
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

  const handleOpenMusicFromPracticeHub = useCallback(() => {
    setMusicLibraryOpen(true)
    openMusicAfterCrossingRef.current = recordingModeRef.current !== 'audio'
    handleOpenFullPracticeTool('music')
  }, [handleOpenFullPracticeTool])

  const handleOpenVaultFromPracticeHub = useCallback(() => {
    triggerLightHaptic(settings.hapticFeedback)
    setIsPracticeHubOpen(false)
    setIsSettingsOpen(false)
    setIsVaultOpen(true)
    deferHudMediaPause()
  }, [deferHudMediaPause, settings.hapticFeedback])

  const handleOpenMultitrack = useCallback(() => {
    setQuickSettingsOpen(false)
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

  useEffect(() => {
    const open = () => { if (getPendingMultitrackFile()) handleOpenMultitrack() }
    open()
    return subscribeMultitrackFile(open)
  }, [handleOpenMultitrack])

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

  const handleMultitrackStartRecording = useCallback(async (): Promise<boolean> => {
    multitrackRecordingActiveRef.current = true
    if (shouldPauseYoutubeForRecording) {
      pauseYoutubeReference()
    }
    pausePipVideos()
    try {
      const started = await startRecording()
      if (!started) multitrackRecordingActiveRef.current = false
      return started
    } catch (error) {
      multitrackRecordingActiveRef.current = false
      throw error
    }
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
    if (audioPracticeTab === 'games') handleAudioPracticeTabChange(lastFullToolTab.current)
    recoverCameraAfterSurfaceDismiss('labs-close')
  }, [audioPracticeTab, recoverCameraAfterSurfaceDismiss, handleAudioPracticeTabChange, settings.hapticFeedback])

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
      settings.showMusic,
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

  const rememberCurrentPracticeDesk = useCallback(() => {
    const desk = liveDeskSnapshotRef.current
    if (!desk) return
    const day = routineDayRef.current
    if (day?.activeStepId) commitRoutineDay(checkpointRoutineDay(day, Date.now(), desk))
  }, [commitRoutineDay])

  const handleQuickSettingsOpenChange = useCallback((open: boolean) => {
    if (!open) rememberCurrentPracticeDesk()
    startTransition(() => {
      setQuickSettingsOpen(open)
    })
  }, [rememberCurrentPracticeDesk])

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
      focusedPractice && focusedSoloReview
        ? resolveBenchmarkPlayback(null, null, takes, libraryItems)
        : focusedPractice && focusedReferenceTakeId
        ? resolveBenchmarkPlayback(null, focusedReferenceTakeId, takes, libraryItems)
        : resolveBenchmarkPlayback(!plus.active && benchmarkBinding?.source === 'library' ? null : benchmarkBinding, benchmarkId, takes, libraryItems),
    [
      benchmarkBinding,
      benchmarkId,
      focusedPractice,
      focusedReferenceTakeId,
      focusedSoloReview,
      libraryItems,
      takes,
      plus.active,
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
    if (
      !pitchTrackerActive || recordingMode !== 'audio' ||
      (audioPracticeTab !== 'audio' && audioPracticeTab !== 'music' && audioPracticeTab !== 'metronome')
    ) return null
    return { mediaRef: liveMicPlaceholderRef, take: null, isPlaying: true,
      mediaKey: 'main-audio-live', liveMicOnly: true }
  }, [pitchTrackerActive, recordingMode, audioPracticeTab])

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

  /*
   * Reconcile the click only when the surface changes underneath it. Starting
   * the click already prepares its route; reconciling on that same transition
   * released the playback route through the recording route and re-engaged it
   * straight after the first click — the engine stopped for the session
   * change, which is the "one click, then tap play again" start.
   */
  const metronomeSurfaceRef = useRef({ recordingMode, nativeLivePreviewActive })
  useEffect(() => {
    const previous = metronomeSurfaceRef.current
    metronomeSurfaceRef.current = { recordingMode, nativeLivePreviewActive }
    if (!metronomePlaying) return
    if (
      previous.recordingMode === recordingMode &&
      previous.nativeLivePreviewActive === nativeLivePreviewActive
    ) {
      return
    }
    if (recordingMode === 'video' && !nativeLivePreviewActive) return
    sharedMetronomeEngine.reconcileAfterModeSwitch(recordingMode)
  }, [recordingMode, nativeLivePreviewActive, metronomePlaying])

  const metronomeHudSuspended =
    isVaultOpen || isSettingsOpen || isReviewOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  // Keep audio owners mounted even when folded or visiting a full tool tab.
  // Visibility is independent of sound; the full tool's own widget steps aside.
  const onRecordSurface = recordingMode === 'video' || audioPracticeTab === 'audio'
  const guidedReviewVisible = Boolean(
    guidedTakeId && challengerTake?.id === guidedTakeId && onRecordSurface &&
    settings.showTakeCards && !isRecording && !isStopping && !isSplitView &&
    !multitrackOpen && !settings.autoSoundRecording && !practiceSessionActive &&
    !musicPageVisible && !isLabsOpen && !isPracticeHubOpen && !isReviewOpen &&
    !isVaultOpen && !isSettingsOpen && !showOnboardingTutorial
  )
  const guidedAudioShowBoth = guidedReviewVisible && guidedAudioBothTakeId === guidedTakeId
  // Tools always runs in audio mode. Remember which recorder the player left so
  // the dock's Compare button (and its icon) takes them back to that one.
  const [toolsReturnMode, setToolsReturnMode] = useState<RecordingMode>(recordingMode)
  useEffect(() => {
    if (onRecordSurface) setToolsReturnMode(recordingMode)
  }, [onRecordSurface, recordingMode])
  const showFloatingMetronomeWidget = showMetronomeWidget

  const musicLibrarySurface = recordingMode === 'audio' && audioPracticeTab === 'music' && musicLibraryOpen
  const metronomeWidgetInteractive = showFloatingMetronomeWidget && !metronomeHudSuspended && !musicLibrarySurface && !(recordingMode === 'audio' && audioPracticeTab === 'metronome')

  const showFloatingDroneWidget = settings.showDrone
  const droneWidgetInteractive = showFloatingDroneWidget && !metronomeHudSuspended && !musicLibrarySurface

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
    playbackPlaying: autoPlaybackPlaying,
    replayCountdown,
    handsFreeListeningReady,
    dragDeleteActive: pipDragState.isDragging && !isRecording,
    finishingTake: isStopping,
  })
  const handsFreeStageVisiblePhase =
    hudModalState === 'idle' && !showOnboardingTutorial ? handsFreeStagePhase : null
  // Camera and the tuner leave the middle of the screen open, so they get the
  // large free-floating copy. Every other Tools tab packs controls from top to
  // bottom and needs the compact backed pill instead.
  const handsFreeStagePlacement =
    musicPageVisible ? 'center' : recordingMode === 'audio' && audioPracticeTab !== 'tuner' ? 'chip' : 'center'

  const takePlaybackActive =
    referencePlaying ||
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
    referencePlaying ||
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
    (recordingMode === 'video' && (handsFreePlaybackPending || autoPlaybackTakeId !== null)) ||
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

  /*
   * A game is played with both hands on the instrument, so nothing touches
   * the screen for long stretches — long enough for auto-lock, which takes the
   * microphone and the game's sound down with it. The lobby needs neither.
   */
  const isPracticeGameOpen = labsRoute !== null && labsRoute !== 'menu'

  useAppShellPolicies({
    // A player reading off the page can go minutes without touching the screen,
    // and a part that locks itself mid-phrase is useless as a music stand.
    keepAwake:
      isRecording || isReviewOpen || takePlaybackActive || isPracticeGameOpen || musicPageVisible,
    hudSurface: hudModalState,
    lightStatusBarSurface: recordingMode === 'audio' && !settings.darkMode,
  })

  useEffect(() => {
    // Re-applied on launch as well as on change, so a takes directory recreated
    // by a restore picks the preference back up.
    void applyTakesBackupPreference(settings.backUpTakesToIcloud)
  }, [settings.backUpTakesToIcloud])

  useEffect(() => {
    setTakePlaybackEnhancerState(
      settings.audioEnhancerEnabled,
      settings.audioEnhancerSettings,
      takes.filter(take => take.enhancerBaked).flatMap(take => [take.filePath ?? '', take.videoUrl ?? '']),
    )
  }, [settings.audioEnhancerEnabled, settings.audioEnhancerSettings, takes])

  useEffect(() => {
    setActiveCaptureProfile('natural')
  }, [])

  const audioPracticeSheetOpen = isVaultOpen || isSettingsOpen || isExperimentalOpen || isPracticeHubOpen || focusPanel !== null

  const isAudioPracticeMetronomeTab = recordingMode === 'audio' && audioPracticeTab === 'metronome'

  const isAudioPracticeTunerTab = recordingMode === 'audio' && audioPracticeTab === 'tuner'

  const isAudioPracticeRecordTab = recordingMode === 'audio' && audioPracticeTab === 'audio'
  const isAudioPracticeMusicTab = recordingMode === 'audio' && audioPracticeTab === 'music'

  /*
   * Games can open over the Tuner tab — from Practice Home, a daily challenge
   * or a routine step, none of which change the tab — and the tuner must stand
   * down underneath. An active tuner claims the microphone natively, which
   * releases the WebKit stream every game listens through, and it claims it
   * again on every return to the app.
   */
  const isAudioPracticeTunerActive =
    isAudioPracticeTunerTab && !audioPracticeSheetOpen && !isReviewOpen && !isLabsOpen

  /*
   * Practice on the music lives on the Tools surface, not on Camera.
   *
   * Camera is a lens: its whole chrome is white glass built to read against a
   * dark preview, and over white paper none of it can be seen. Tools is already
   * a light room — the widgets, the deck and the balls are drawn for it — so the
   * page lands there without a second theme having to exist. The camera also has
   * nothing to show while a part covers the viewfinder.
   *
   * A game, a multitrack session, the split compare and every sheet own the
   * whole screen while they are up, and none of them is a music stand.
   */
  const musicRoomActive =
    (plus.active || isRecording || isStopping) &&
    isAudioPracticeMusicTab && !musicLibraryOpen &&
    !metronomeHudSuspended &&
    !audioPracticeSheetOpen &&
    !isSplitView &&
    !isLabsOpen &&
    !multitrackOpen &&
    !showOnboardingTutorial

  const [musicPitchMonitorEpoch, setMusicPitchMonitorEpoch] = useState(0)
  const musicPitchRecoveryRef = useRef({ attempts: 0, running: false })
  useEffect(() => {
    if (musicRoomActive) musicPitchRecoveryRef.current.attempts = 0
  }, [musicRoomActive])

  const handleMusicPitchSourceHealthChange = useCallback((health: PitchSourceHealth) => {
    if (health === 'healthy') {
      musicPitchRecoveryRef.current.attempts = 0
      return
    }
    if (
      health !== 'stalled' || !musicRoomActive || isRecording ||
      handsFreePlaybackPending || autoPlaybackPlaying ||
      !isNativeCameraPlatform || musicPitchRecoveryRef.current.running ||
      musicPitchRecoveryRef.current.attempts >= 2
    ) return

    musicPitchRecoveryRef.current.attempts += 1
    musicPitchRecoveryRef.current.running = true
    void recoverNativeTunerMonitor(settings.micInputPreference).then((active) => {
      if (active) setMusicPitchMonitorEpoch(epoch => epoch + 1)
    }).catch((error) => {
      console.warn('[MusicPitch] native microphone recovery failed', error)
    }).finally(() => {
      musicPitchRecoveryRef.current.running = false
    })
  }, [autoPlaybackPlaying, handsFreePlaybackPending, isNativeCameraPlatform, isRecording, musicRoomActive, settings.micInputPreference])

  const isAudioPracticeTimelineTab = recordingMode === 'audio' && audioPracticeTab === 'practice'

  const isAudioPracticeGamesTab = recordingMode === 'audio' && audioPracticeTab === 'games'
  useLayoutEffect(() => {
    if (isLabsOpen || isAudioPracticeGamesTab) document.documentElement.dataset.gameConcept = 'pocket'
    else delete document.documentElement.dataset.gameConcept
    return () => { delete document.documentElement.dataset.gameConcept }
  }, [isLabsOpen, isAudioPracticeGamesTab])

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
    isAudioPracticeMusicTab ||
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

  // The floating tuner must leave recording and workspace controls accessible.
  const pitchAudioHudLock = false

  const metronomeAudioHudLock =
    recordingMode === 'audio' &&
    audioPracticeTab === 'metronome' &&
    hudModalState === 'idle' &&
    !metronomeHudSuspended

  const audioToolHudLock =
    isAudioPracticeToolTab && !(isAudioPracticeMusicTab && !musicLibraryOpen) && hudModalState === 'idle' && !audioPracticeSheetOpen && !isReviewOpen

  const overlayPointerCapture =
    !audioPracticeSheetOpen &&
    (pitchAudioHudLock || metronomeAudioHudLock || audioToolHudLock || showOnboardingTutorial)

  const metronomeStageActive = false

  const isAudioPracticeMainTab = recordingMode !== 'audio' || audioPracticeTab === 'audio'

  const showFloatingMainPitch =
    showPitch && mainAudioPitchSource !== null && !isAudioPracticeTunerTab && !musicLibrarySurface

  useEffect(() => {
    // A Music pitch widget must relinquish the native input for a hands-free
    // replay. Reacquiring it at recording-stop steals the output route from
    // the native audio player, leaving a moving but silent "Listen back" UI.
    if (!pitchTrackerActive || recordingMode !== 'audio' || isRecording ||
        handsFreePlaybackPending || autoPlaybackPlaying || audioModeTakePlaying ||
        autoRecordStartSuppressed) return
    let cancelled = false
    void acquireNativeTunerMonitor(settings.micInputPreference).then((active) => {
      if (cancelled && active) void releaseNativeTunerMonitor()
    })
    return () => {
      cancelled = true
      void releaseNativeTunerMonitor()
    }
  }, [
    isRecording,
    pitchTrackerActive,
    recordingMode,
    settings.micInputPreference,
    handsFreePlaybackPending,
    autoPlaybackPlaying,
    audioModeTakePlaying,
    autoRecordStartSuppressed,
  ])

  useEffect(() => {
    if (!pitchTrackerActive) {
      setShowPitch(false)
    }
  }, [pitchTrackerActive])

  /*
   * The Workspace toggle is the truth. Sheets hide the widget through
   * `pitchHudSuspended` already, but they also used to latch `showPitch` off
   * and never put it back — so the menu kept saying the tracker was on over a
   * screen that had none. Re-raise it whenever nothing is covering the HUD.
   */
  useEffect(() => {
    if (!pitchTrackerActive || pitchHudSuspended) return
    setShowPitch(true)
  }, [pitchHudSuspended, pitchTrackerActive])

  const handleCloseHandsFree = useCallback(() => {
    handleAutoSoundRecordingChange(false)
  }, [handleAutoSoundRecordingChange])

  /** Closing the widget means off, so the toggle has to go off with it. */
  const handleClosePitch = useCallback(() => {
    handlePitchTrackerSettingChange(false)
  }, [handlePitchTrackerSettingChange])

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

  /**
   * A routine step that pins music needs somewhere to keep it, and a step's
   * practice folder is normally not made until the step first runs. Choosing a
   * file is the other moment that binds one.
   */
  const handleCreatePracticeItem = useCallback(async (title: string) => {
    const project = await createProject(title.trim() || 'Practice item')
    setProjects(current => [project, ...current])
    return project.id
  }, [])

  const handleOpenMusicScore = useCallback((projectId: string) => {
    if (!requirePlus('music', () => { void handleOpenMusicScore(projectId) })) return Promise.resolve()
    return runPracticeTransition(`music:${projectId}`, async () => {
      if (!hasPracticeChart(projectId)) throw new Error('This file is no longer available. Import it again.')
      const previousId = activeProjectIdRef.current
      if (previousId !== projectId) setMusicTakesVisible(false)
      // Leaving the reader already flushes its setup. Tools used elsewhere must
      // not overwrite that score's settings when returning through the library.
      // Browsing is harmless; choosing a different score pauses the routine before
      // recordings can be attributed to a different exercise's practice session.
      if (previousId !== projectId || (focusedRoutineContextRef.current && !focusedPracticeSessionIdRef.current)) {
        const day = routineDayRef.current
        if (day) commitRoutineDay(pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
        pauseRoutineProgram()
        if (focusedPracticeSessionIdRef.current) await endPracticeSession(focusedPracticeSessionIdRef.current)
        focusedPracticeSessionIdRef.current = null
        focusedRoutineContextRef.current = null
        focusedPracticeRef.current = null
        setFocusedPracticeSessionId(null)
        setFocusedPractice(null)
        setFocusedReferenceTakeId(null)
      }
      await handleSelectProject(projectId)
      if (!focusedRoutineContextRef.current) {
        const desk = loadMusicSetup(projectId) ?? blankDesk('audio')
        applyDeskSnapshot({ ...desk, mode: 'audio', showMusic: true })
        const exercise = loadExerciseLibrary().find(item => item.step.projectId === projectId)?.step
        const scoreSettings = loadMusicScoreSettings(projectId)
        const referenceVideoId = scoreSettings ? scoreSettings.referenceVideoId : exercise?.referenceVideoId
        if (scoreSettings) {
          selectPracticeReference(projectId, referenceVideoId ? buildYoutubeProxyUrl(referenceVideoId) : null)
        } else if (!getSelectedReferenceUrl(projectId) && referenceVideoId) {
          selectPracticeReference(projectId, buildYoutubeProxyUrl(referenceVideoId))
        }
        prepareRoutineProgram(scoreSettings ? scoreSettings.programId : exercise?.programId ?? null)
        musicSetupOwnerRef.current = projectId
        setMusicWorkspaceExpandRequest({ pitch: desk.pitchTrackerEnabled || undefined, metronome: desk.showMetronome || undefined, drone: desk.showDrone || undefined })
      }
      pauseYoutubeProxy(youtubeIframeRef.current)
      prepareNewYoutubeReference({ autoplay: false })
      setYoutubeAutoPlayOnLoad(false)
      setYoutubeUrl(canUsePlus() ? getSelectedReferenceUrl(projectId) : null)
      setChartVisible(projectId, true)
      updateSettings({ showMusic: true })
      setMusicLibraryOpen(false)
      handleAudioPracticeTabChange('music')
      rememberLastPracticeDestination({ kind: 'music', projectId })
    })
  }, [runPracticeTransition, handleSelectProject, applyDeskSnapshot, commitRoutineDay, handleAudioPracticeTabChange, rememberLastPracticeDestination, updateSettings])

  const handleContinueMusic = useCallback(async (projectId: string) => {
    if (!requirePlus('music', () => { void handleContinueMusic(projectId) })) return
    await handleOpenMusicScore(projectId)
    dismissPracticeHub()
  }, [dismissPracticeHub, handleOpenMusicScore])

  const incomingPdfBusyRef = useRef(false)
  const promptedPdfRef = useRef<string | null>(null)
  useEffect(() => {
    const openPdfFromFiles = () => {
      if (!getPendingPdfOpen() || incomingPdfBusyRef.current || isRecording || isStopping || practiceTransitionBusy) return
      const pending = getPendingPdfOpen()
      if (!plus.ready || !pending) return
      if (!canUsePlus()) {
        if (promptedPdfRef.current !== pending.url) {
          promptedPdfRef.current = pending.url
          requirePlus('music', openPdfFromFiles)
        }
        return
      }
      const incoming = consumePendingPdfOpen()
      if (!incoming) return
      incomingPdfBusyRef.current = true
      void (async () => {
        let projectId: string | null = null
        let saved = false
        try {
          const { readMultitrackAsset } = await import('./multitrack/state/readMultitrackAsset')
          const blob = await readMultitrackAsset(Capacitor.convertFileSrc(incoming.url), 'This PDF', incoming.url)
            .catch(() => { throw new Error('Could not read this PDF from Files. Try opening it again.') })
          const pdf = await prepareRoutineMusicFile(new File([blob], incoming.name, { type: 'application/pdf' }))
          projectId = await handleCreatePracticeItem(musicExerciseTitle(pdf.name))
          await savePracticeChart(projectId, pdf)
          saved = true
          setMusicChartRevision(value => value + 1)
          void discardOpenedPdfCopy(incoming.url)

          // File handoff should land on the score, even if BestTake was last
          // left in Camera, Multitrack, a review, or another Tools tab.
          if (multitrackOpen) {
            setMultitrackOpen(false)
            setMultitrackPendingRecordingTakeId(null)
            multitrackRecordingActiveRef.current = false
            setSuppressNativeBridgeRecovery(false)
          }
          setReviewSlot(null)
          setReviewContext('compare')
          setFocusPanel(null)
          await handleOpenFullPracticeTool('music')
          await handleOpenMusicScore(projectId)
        } catch (error) {
          if (projectId && !saved) {
            await deleteProject(projectId).catch(() => {})
            setProjects(current => current.filter(project => project.id !== projectId))
          }
          if (!saved) releaseFailedPdfOpen(incoming.url)
          const detail = error instanceof Error ? error.message : 'Please try opening the file again.'
          showAlertOutsideTree({
            title: saved ? 'PDF added to Music' : "Couldn't open PDF",
            message: saved ? 'The score is in your Music library. Open it there when you are ready.' : detail,
            tone: saved ? 'success' : 'error',
          })
        } finally {
          incomingPdfBusyRef.current = false
        }
      })()
    }
    const unsubscribe = subscribePdfOpen(openPdfFromFiles)
    openPdfFromFiles()
    return unsubscribe
  }, [plus.ready, plus.active, handleCreatePracticeItem, handleOpenFullPracticeTool, handleOpenMusicScore, isRecording, isStopping, multitrackOpen, practiceTransitionBusy, setSuppressNativeBridgeRecovery])

  // Save the setup that belongs to this score. Routine desks remain owned by
  // their individual exercises and are never overwritten by library browsing.
  useEffect(() => {
    if (!musicRoomActive || !activeProjectId || musicSetupOwnerRef.current !== activeProjectId || focusedRoutineContextRef.current) return
    const save = () => {
      try { saveMusicSetup(activeProjectId, liveDeskSnapshot) }
      catch { setTakeDeleteError('Could not remember this music’s practice settings on this device.') }
    }
    const timer = window.setTimeout(save, 400)
    const flush = () => { window.clearTimeout(timer); save() }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [activeProjectId, liveDeskSnapshot, musicRoomActive])

  /**
   * Music on means the part is the room, and the take cards are a panel across
   * the middle of it — but they stand down by being drawn differently, not by
   * switching `showTakeCards` off. That flag is wired to which take is the
   * challenger, so turning it off here would quietly drop the take the player
   * just recorded. While the page is up the takes show as the compact pills the
   * Tuner tab already uses.
   */
  const handleShowMusicSettingChange = useCallback(
    (show: boolean) => {
      if (show && !requirePlus('music', () => handleShowMusicSettingChange(true))) return
      if (show) {
        openMusicAfterCrossingRef.current = recordingModeRef.current !== 'audio'
        setMusicPageVisible(true)
        if (recordingModeRef.current !== 'audio') handleRecordingModeChange('audio')
        handleAudioPracticeTabChange('music')
      } else {
        setMusicPageVisible(false)
        setMusicChromeHidden(false)
      }
      updateSettings({ showMusic: show })
    },
    [handleAudioPracticeTabChange, handleRecordingModeChange, updateSettings],
  )

  const handleCloseMusic = useCallback(() => {
    setMusicLibraryOpen(true)
    setMusicChromeHidden(false)
  }, [])

  useEffect(() => {
    if (audioPracticeTab === 'music' && (!activeProjectId || !hasPracticeChart(activeProjectId))) setMusicLibraryOpen(true)
  }, [activeProjectId, audioPracticeTab, musicChartRevision])

  /* ---- Crossing between Tools and Camera clears the desk -----------------
   *
   * Carrying Pitch, Metronome, Drone and the Enhancer across the crossing
   * meant arriving in a room with widgets switched on that the room may not
   * even render — Workspace read "Pitch Analysis · on" over a surface showing
   * no pitch at all. Each surface now opens quiet and the player turns on what
   * they want there.
   *
   * Take Cards stay: they are the takes, not a tool, and losing them on every
   * crossing would be losing the thing being compared. Hands-free is a
   * recording behaviour with its own control on the deck, so it stays too.
   */
  useEffect(() => {
    if (workspaceModeRef.current === recordingMode) return
    workspaceModeRef.current = recordingMode
    const openMusic = openMusicAfterCrossingRef.current
    openMusicAfterCrossingRef.current = false
    if (keepWorkspaceAcrossModeRef.current) {
      keepWorkspaceAcrossModeRef.current = false
      return
    }
    // A routine owns one setup across Camera and Audio. Its compact controls
    // now exist on both surfaces, so crossing must not silently stop its tools.
    if (focusedRoutineContextRef.current) return
    if (pitchCommitTimerRef.current !== null) {
      window.clearTimeout(pitchCommitTimerRef.current)
      pitchCommitTimerRef.current = null
    }
    setPendingPitchTrackerEnabled(null)
    setShowPitch(false)
    updateSettings({
      pitchTrackerEnabled: false,
      showMetronome: false,
      showDrone: false,
      showMusic: openMusic && recordingMode === 'audio',
      audioEnhancerEnabled: false,
    })
    sharedMetronomeEngine.stop()
    applyDroneFromDesk(null, getDroneSnapshot().octave)
  }, [recordingMode, updateSettings])

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
      // Pinning from full-screen review keeps the player on the take they were
      // studying: it just moved into the Best slot, so the review follows it.
      setReviewSlot((slot) => (slot === null ? null : 'benchmark'))
      // A pinned reference recording takes priority — don't clobber it with
      // the newly-starred take.
      if (focusedPractice && benchmarkBinding?.source !== 'library') {
        setFocusedSoloReview(false)
        setFocusedReferenceTakeId(id)
      }
      if (activeProjectIdRef.current) {
        void setProjectBestTake(activeProjectIdRef.current, id).then(() => {
          refreshBestTakeHistory()
          reportFeatureAction('best-take-pinned')
        }).catch(() => setTakeDeleteError('Best Take could not be remembered. Try pinning it again.'))
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
      if (!requirePlus('music')) return
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
    if (!requirePlus('music')) return
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
    return item
  }, [])

  useEffect(() => {
    try { setReferenceAudioId(canUsePlus() && activeProjectId ? localStorage.getItem(`besttake.reference-audio.${activeProjectId}`) : null) }
    catch { setReferenceAudioId(null) }
    setReferenceExpanded(false)
  }, [activeProjectId])

  const selectReferenceAudio = useCallback((id: string | null) => {
    if (id && !requirePlus('music')) return
    setReferenceAudioId(id)
    const projectId = activeProjectIdRef.current
    if (!projectId) return
    try {
      if (id) localStorage.setItem(`besttake.reference-audio.${projectId}`, id)
      else localStorage.removeItem(`besttake.reference-audio.${projectId}`)
    } catch { setTakeDeleteError('Reference selection could not be remembered on this device.') }
  }, [])
  const referenceAudio = libraryItems.find(item => item.id === referenceAudioId && item.projectId === activeProjectId) ?? null
  const hasSelectedReference = Boolean(youtubeUrl || referenceAudio)
  const referenceSurfaceKey = `${activeProjectId ?? ''}:${recordingMode}:${audioPracticeTab}`
  const previousReferenceSurfaceKeyRef = useRef(referenceSurfaceKey)
  const previouslyHadReferenceRef = useRef(hasSelectedReference)

  useEffect(() => {
    const surfaceChanged = previousReferenceSurfaceKeyRef.current !== referenceSurfaceKey
    previousReferenceSurfaceKeyRef.current = referenceSurfaceKey
    const referenceWasCleared = previouslyHadReferenceRef.current && !hasSelectedReference
    previouslyHadReferenceRef.current = hasSelectedReference
    if (referenceWasCleared || (surfaceChanged && !hasSelectedReference)) {
      setReferenceVisible(false)
      setReferenceExpanded(false)
    }
  }, [hasSelectedReference, referenceSurfaceKey])

  // An empty References panel is available when the user opens it, but its
  // collapsed chip should not linger in a workspace with no selected media.
  useEffect(() => {
    if (!hasSelectedReference && !referenceExpanded) setReferenceVisible(false)
  }, [hasSelectedReference, referenceExpanded])

  // A selected reference belongs on the music stand in regular practice and
  // routines. Never auto-show an empty widget when a score is opened.
  useEffect(() => {
    if (!settings.showMusic || !activeProjectId || !hasSelectedReference) return
    setReferenceVisible(true)
    setReferenceExpanded(false)
  }, [settings.showMusic, activeProjectId, routineDay?.activeStepId, hasSelectedReference])

  const handleReferenceBeforePlay = useCallback(() => {
      stopAutoPlaybackAudio()
      audioModePlaybackControlsRef.pause?.()
      pausePipVideos()
  }, [stopAutoPlaybackAudio, pausePipVideos])

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

  const handleOpenCompareReview = useCallback((slot: ReviewSlot) => {
    setReviewContext('compare')
    setReviewSlot(slot)
    deferHudMediaPause()
  }, [deferHudMediaPause])

  const referencePassage = useYoutubePracticePassage({
    projectId: focusedPractice?.projectId ?? null,
    videoId: youtubeUrl ? parseYoutubeVideoId(youtubeUrl) : null,
    iframeRef: youtubeIframeRef,
    recording: isRecording || isStopping || practiceTransitionBusy,
    beforePlay: () => { stopAutoPlaybackAudio(); pausePipVideos(); audioModePlaybackControlsRef.pause?.(); pauseRoutineProgram() },
  })

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

  useEffect(() => {
    if (focusedPractice || practiceTransition.current.busy) return
    const sessionId = focusedPracticeSessionIdRef.current
    if (sessionId) {
      setFocusedPracticeSessionId(null)
      void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Could not close this practice sitting. Your takes are still saved.'))
    }
  }, [focusedPractice])

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
    const chronologicalTakes = sortTakes(takes, 'newest')
    const currentIndex = chronologicalTakes.findIndex((take) => take.id === challengerId)
    const previousTake = currentIndex < 0 ? null : chronologicalTakes
      .slice(currentIndex + 1)
      .find((take) =>
        take.id !== benchmarkId &&
        take.id !== benchmarkTake?.id &&
        takeHasPlaybackMedia(take)
      )
    challengerUserDismissedRef.current = !previousTake
    pendingChallengerIdRef.current = null
    setChallengerId(previousTake?.id ?? null)
  }, [
    autoPlaybackTakeId,
    benchmarkId,
    benchmarkTake?.id,
    challengerId,
    releaseAutoRecordSuppress,
    stopAutoPlaybackAudio,
    takes,
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
    if (!requirePlus('youtube', () => handleSubmitYoutube(embedUrl))) return
    if (activeProjectIdRef.current) {
      try { selectPracticeReference(activeProjectIdRef.current, embedUrl) }
      catch { setTakeDeleteError('Reference loaded, but it could not be remembered for this routine item.') }
    }
    setFocusedReferenceTakeId(null)
    setFocusedSoloReview(false)
    if (focusedPracticeRef.current) {
      showTakeCardsRef.current = true
      updateSettings({ showTakeCards: true })
      if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
    }
    pausePipVideos()
    prepareNewYoutubeReference({ autoplay: false })
    setYoutubeAutoPlayOnLoad(false)
    setYoutubeUrl(embedUrl)
    setYoutubeReferenceEnabled(true)
    setYoutubeHeadphonesTipNonce((current) => current + 1)
    setShowYoutubeHeadphonesTip(!focusedPracticeRef.current)
    setYoutubeExpandTipNonce((current) => current + 1)
    setShowYoutubeExpandTip(false)
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
    if (current) {
      try { saveRoutineDay(pauseRoutineDay(current, Date.now(), liveDeskSnapshotRef.current)) }
      catch { setTakeDeleteError('Could not save the previous practice day on this device.') }
    }
    return loadRoutineDay(target)
  }, [])

  // The card is for today. Opening the hub on a new day starts a fresh one.
  useEffect(() => {
    if (!isPracticeHubOpen) return
    const target = routineRef.current
    if (!target) return
    const next = ensureRoutineDay(target)
    if (next !== routineDayRef.current) commitRoutineDay(next)
  }, [commitRoutineDay, ensureRoutineDay, isPracticeHubOpen])

  /** Makes `next` today's routine. False when practice is mid-switch and nothing was saved. */
  const commitSavedRoutine = useCallback(
    (next: Routine): boolean => {
      if (!canSaveRoutine(next)) return false
      triggerLightHaptic(settings.hapticFeedback)
      if (practiceTransition.current.busy || captureBusyRef.current) return false
      rememberCurrentPracticeDesk()
      exitRoutineProgram()
      const previous = routineRef.current
      const currentDay = routineDayRef.current
      if (currentDay) commitRoutineDay(pauseRoutineDay(currentDay))
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
      if (focusedRoutineContextRef.current && (previous?.id !== next.id || !next.steps.some(step => step.id === focusedRoutineContextRef.current?.stepId))) {
        const sessionId = focusedPracticeSessionIdRef.current
        if (sessionId) void endPracticeSession(sessionId).catch(() => setTakeDeleteError('Could not close the previous sitting. Your takes are saved.'))
        focusedPracticeSessionIdRef.current = null
        focusedPracticeRef.current = null
        focusedRoutineContextRef.current = null
        setFocusedPractice(null)
        setFocusedPracticeSessionId(null)
      }
      routineRef.current = next
      setRoutine(next)
      // Explicitly editing a preset replaces that item's temporary desk for today.
      const base = previous?.id === next.id && currentDay?.date === todayKey()
        ? pauseRoutineDay(currentDay) : loadRoutineDay(next)
      const desksByStep = { ...base.desksByStep }
      for (const step of next.steps) {
        if (JSON.stringify(previous?.steps.find(item => item.id === step.id)?.desk) !== JSON.stringify(step.desk)) delete desksByStep[step.id]
      }
      commitRoutineDay(reconcileDay({ ...base, desksByStep }, next))
      if (next.instrumentId) {
        const instrumentSettings = getInstrumentSettings(next.instrumentId)
        if (instrumentSettings) {
          updateSettings(instrumentSettings)
          savePreferredInstrumentId(next.instrumentId)
          setPreferredInstrumentId(next.instrumentId)
        }
      }
      return true
    },
    [settings.hapticFeedback, updateSettings, rememberCurrentPracticeDesk, commitRoutineDay],
  )

  const handleSaveRoutine = useCallback((next: Routine) => {
    if (commitSavedRoutine(next)) {
      setRoutineBuilderRequest(null)
      setIncomingRoutine(null)
      confirmFeatureAction('Routine updated')
    }
  }, [commitSavedRoutine])

  const handleDeleteRoutine = useCallback(() => {
    void runPracticeTransition('delete-routine', async () => {
      rememberCurrentPracticeDesk()
      const day = routineDayRef.current
      if (day) commitRoutineDay(pauseRoutineDay(day))
      const sessionId = focusedPracticeSessionIdRef.current
      if (sessionId && focusedRoutineContextRef.current) await endPracticeSession(sessionId)
      if (focusedRoutineContextRef.current) {
        focusedPracticeSessionIdRef.current = null
        focusedPracticeRef.current = null
        focusedRoutineContextRef.current = null
        setFocusedPractice(null)
        setFocusedPracticeSessionId(null)
      }
      exitRoutineProgram()
      routineRef.current = null
      setRoutine(null)
      commitRoutineDay(null)
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
      setRoutineBuilderRequest(null)
    }).catch(() => setTakeDeleteError('Could not close this routine. Your saved practice is safe.'))
  }, [commitRoutineDay, rememberCurrentPracticeDesk, runPracticeTransition])

  const handleOpenRoutineBuilder = useCallback(
    (mode: RoutineBuilderMode) => {
      setRoutineBuilderRequest(mode)
      if (!isPracticeHubOpen) handleOpenPracticeHome()
    },
    [handleOpenPracticeHome, isPracticeHubOpen],
  )

  /**
   * A step's click starts once the step has landed, not in the same moment.
   * Opening a step can swap camera and Tools, and handleRecordingModeChange then
   * re-checks the click at 420, 900 and 1500 ms, each check re-asserting the
   * speaker route while the capture session is still coming up. With the click
   * already running, every one of those checks becomes a live route change, so
   * wait them out first — and start nothing for a step that is no longer live.
   */
  const routineClickTimerRef = useRef<number | null>(null)
  const scheduleRoutineClick = useCallback((stepId: string, surfaceChanges: boolean) => {
    if (routineClickTimerRef.current !== null) window.clearTimeout(routineClickTimerRef.current)
    routineClickTimerRef.current = window.setTimeout(() => {
      routineClickTimerRef.current = null
      const day = routineDayRef.current
      if (day?.activeStepId !== stepId || day.activeStepStartedAt === null) return
      if (captureBusyRef.current || document.visibilityState !== 'visible') return
      if (sharedMetronomeEngine.getSnapshot().playing) return
      void sharedMetronomeEngine.start().catch(() => setTakeDeleteError('Your item is ready. Tap the metronome to start the click.'))
    }, surfaceChanges ? 1700 : 600)
  }, [])

  const openRoutineStep = useCallback(async (stepId: string) => {
    let target = routineRef.current
    const step = target?.steps.find(item => item.id === stepId)
    if (!target || !step) throw new Error('This routine item is no longer available.')
    if (canUsePlus() && (step.sharedScoreName || (step.desk?.showMusic && step.projectId)) && !(step.projectId && hasPracticeChart(step.projectId))) {
      handleOpenRoutineBuilder('edit')
      setTakeDeleteError(`Import ${step.sharedScoreName ?? step.title} in this routine before starting the exercise.`)
      return
    }
    const surfaceBefore = recordingModeRef.current
    setIsSplitView(false)
    triggerLightHaptic(settings.hapticFeedback)
    rememberCurrentPracticeDesk()
    const day = ensureRoutineDay(target)
    // Stop the previous interval before asynchronous project/media preparation.
    commitRoutineDay(pauseRoutineDay(day))
    pauseRoutineProgram()
    sharedMetronomeEngine.stop()
    deferHudMediaPause()
    setFocusPanel(null)
    setIsSettingsOpen(false)
    setIsVaultOpen(false)
    setQuickSettingsOpen(false)
    setShowPitch(false)

    // Explicit IDs are identity. Two instruments playing "Long tones" must never
    // acquire each other's recordings or references through a name-only match.
    let itemProjectId = step.projectId
    if (isChallengeRoutine(target) && !itemProjectId) {
      const saved = loadRoutine()
      if (saved?.instrumentId === target.instrumentId) {
        const matches = saved.steps.filter(item => item.projectId && item.kind === step.kind &&
          item.title.trim().toLowerCase() === step.title.trim().toLowerCase())
        if (matches.length === 1) itemProjectId = matches[0].projectId
      }
    }
    let sessionId: string | null = null
    const savedDesk = day.desksByStep[step.id] ?? step.desk
    const desk = savedDesk && !canUsePlus() ? { ...savedDesk, showMusic: false, autoSoundRecording: false } : savedDesk
    // A step without music puts the paper away, even when its folder has a
    // file. A step with music leaves it up so two parts in a row do not flash.
    if (!desk?.showMusic) updateSettings({ showMusic: false })
    if (step.kind !== 'game' && step.kind !== 'free') {
      const existing = await findRoutinePracticeProject(target.id, step.id, itemProjectId)
      const project = existing ?? await createProject(isChallengeRoutine(target) ? `${step.title} · Daily challenge` : step.title)
      itemProjectId = project.id
      if (!existing) setProjects(current => [project, ...current])
      if (step.projectId !== project.id) {
        target = { ...target, updatedAt: Date.now(), steps: target.steps.map(item => item.id === step.id ? { ...item, projectId: project.id } : item) }
        if (!isChallengeRoutine(target)) saveRoutine(target)
        routineRef.current = target
        setRoutine(target)
      }
      if (desk?.showMusic) {
        // Starting the exercise explicitly puts its score back on the stand,
        // including a score previously collapsed into the Music widget. Reuse
        // the current reader so fit, reading position and annotations survive.
        setChartVisible(project.id, true)
        musicSetupOwnerRef.current = null
      }
      // A reference pinned in the builder is part of the step's setup, like its
      // tempo: select it before the sitting opens so it is already loaded.
      // Storage failure here must never block the practice item from starting.
      if (canUsePlus() && step.referenceVideoId) {
        try { selectPracticeReference(project.id, buildYoutubeProxyUrl(step.referenceVideoId)) }
        catch { setTakeDeleteError('Could not load this item’s saved reference. You can still choose one from Find a reference.') }
      }
      sessionId = await openRoutinePracticeSession(project.id, {
        routineId: target.id, stepId: step.id,
        resumeSessionId: day.sessionIdsByStep[step.id]?.at(-1) ?? null,
        desk: desk && (step.kind === 'tune' || step.kind === 'metro') ? { ...desk, mode: 'audio' } : desk,
      })
      if (desk?.showMusic) {
        // Select the step's project before refreshing chart availability. While
        // still on Music, refreshing against the previous project reopens the
        // library and hides the score this step is trying to show.
        setMusicLibraryOpen(false)
        setMusicChartRevision(value => value + 1)
      }
    } else {
      const previousSessionId = focusedPracticeSessionIdRef.current
      if (previousSessionId) await endPracticeSession(previousSessionId)
      focusedPracticeRef.current = null
      focusedPracticeSessionIdRef.current = null
      setFocusedPractice(null)
      setFocusedPracticeSessionId(null)
      setFocusedReferenceTakeId(null)
      // A checklist/game is not a recording sitting and must not inherit its reference audio.
      setYoutubeUrl(null)
      applyDroneFromDesk(null, 4)
    }

    focusedRoutineContextRef.current = { routineId: target.id, stepId: step.id }
    setLabsRoute(null)
    if (step.kind === 'tune' || step.kind === 'metro') {
      handleRecordingModeChange('audio')
      handleAudioPracticeTabChange(step.kind === 'tune' ? 'tuner' : 'metronome')
    } else if (step.kind === 'game') {
      handleRecordingModeChange('audio')
      setLabsRoute(step.gameRoute ?? 'menu')
    } else if (recordingModeRef.current === 'audio' || desk?.mode === 'audio') {
      handleAudioPracticeTabChange(desk?.showMusic ? 'music' : 'audio')
    }
    const programStatus = prepareRoutineProgram(step.kind === 'game' || step.kind === 'free' ? null : step.programId)
    if (programStatus === 'missing') setTakeDeleteError('This item’s metronome program is unavailable. You can practice normally or choose another program in the routine editor.')
    // Commit running only after the item and durable sitting are ready.
    commitRoutineDay(startRoutineDayStep(routineDayRef.current ?? day, step.id, sessionId, Date.now(), { title: step.title, projectId: itemProjectId }))
    rememberLastPracticeDestination({ kind: 'routine', routineId: target.id })
    if (programStatus !== 'ready' && desk?.showMetronome && step.kind !== 'game' && step.kind !== 'free') {
      const surfaceAfter = step.kind === 'tune' || step.kind === 'metro' ? 'audio' : desk.mode
      scheduleRoutineClick(step.id, surfaceAfter !== surfaceBefore)
    }
    dismissPracticeHub()
    // The reference pill opens the existing search with this item's query.
    // Preparing a step must never open a browser or cover the practice surface.
  }, [commitRoutineDay, deferHudMediaPause, dismissPracticeHub,
    ensureRoutineDay, handleAudioPracticeTabChange, handleOpenRoutineBuilder, handleRecordingModeChange,
    openRoutinePracticeSession, rememberCurrentPracticeDesk, rememberLastPracticeDestination, scheduleRoutineClick, settings.hapticFeedback])

  const handleStartRoutineStep = useCallback((stepId: string) =>
    runPracticeTransition(`routine:${stepId}`, () => openRoutineStep(stepId)),
  [runPracticeTransition, openRoutineStep])

  /** The builder's Start: save, then open the step Today would offer next. */
  const handleSaveAndStartRoutine = useCallback(async (next: Routine) => {
    if (!commitSavedRoutine(next)) throw new Error('Practice is still switching. Try again in a moment.')
    setIncomingRoutine(null)
    try {
      const target = routineRef.current
      const step = target ? routineResumeStep(target, routineDayRef.current) ?? target.steps[0] : undefined
      if (step) await handleStartRoutineStep(step.id)
    } finally {
      // Cleared only now, so the sheet leaves from the builder rather than flashing Home.
      setRoutineBuilderRequest(null)
    }
  }, [commitSavedRoutine, handleStartRoutineStep])
  const handleDailyPractice = useCallback((plan: DailyChallengePlan) => {
    void runPracticeTransition('daily-practice', async () => {
      const target = resolveDailyPractice(plan, routineRef.current)
      if (!target.temporary) {
        await openRoutineStep(target.stepId)
        return
      }
      const day = routineDayRef.current
      if (day) commitRoutineDay(pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
      challengeReturnProjectIdRef.current = activeProjectIdRef.current
      // A temporary challenge never replaces the user's saved routine.
      const temporary = target.routine
      routineRef.current = temporary
      setRoutine(temporary)
      commitRoutineDay(loadRoutineDay(temporary))
      await openRoutineStep(target.stepId)
    }).catch(() => { restoreRoutineAfterChallenge(); setTakeDeleteError('Could not open the challenge. Your routine is safe; please try again.') })
  }, [commitRoutineDay, openRoutineStep, restoreRoutineAfterChallenge, runPracticeTransition])

  const handleDailyGame = useCallback((plan: DailyChallengePlan) => {
    if (practiceTransition.current.busy || captureBusyRef.current) return
    const day = routineDayRef.current
    if (day?.activeStepId) commitRoutineDay(pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
    pauseRoutineProgram()
    sharedMetronomeEngine.stop()
    applyDroneFromDesk(null, 4)
    handleOpenPracticeGames()
    setDailyGameLaunch(plan)
    setLabsRoute(plan.game.route)
  }, [commitRoutineDay, handleOpenPracticeGames])

  routineResumeRef.current = handleStartRoutineStep

  const settleRoutineStep = useCallback((stepId: string, outcome: 'done' | 'skipped') => {
    void runPracticeTransition(`settle:${stepId}`, async () => {
      const target = routineRef.current
      if (!target || !target.steps.some(step => step.id === stepId)) return
      const day = ensureRoutineDay(target)
      // Stale buttons cannot finish a different item after the UI advances.
      if ((day.activeStepId ?? day.pausedStepId) !== stepId) return
      rememberCurrentPracticeDesk()
      const sessionId = focusedPracticeSessionIdRef.current
      if (sessionId) await endPracticeSession(sessionId)
      exitRoutineProgram()
      const nextDay = settleRoutineDayStep(routineDayRef.current ?? day, target, stepId, outcome)
      commitRoutineDay(nextDay)
      focusedPracticeRef.current = null
      focusedPracticeSessionIdRef.current = null
      focusedRoutineContextRef.current = null
      setFocusedPractice(null)
      setFocusedPracticeSessionId(null)
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
      deferHudMediaPause()
      // Done & next walks the list in order; only the last step finishes.
      const next = stepAfter(target, stepId)
      if (next) await openRoutineStep(next.id)
      else {
        // Finishing the final step leaves the practice surface. Do not keep a
        // hands-free mic armed behind Today or prepare another take there.
        if (autoSoundRecordingEnabledRef.current) handleAutoSoundRecordingChange(false)
        if (isChallengeRoutine(target)) {
          const saved = loadRoutine()
          routineRef.current = saved
          setRoutine(saved)
          commitRoutineDay(saved ? loadRoutineDay(saved) : null)
          await restoreChallengeProject()
        }
        handleOpenRoutineToday()
      }
    }).catch((error) => {
      console.warn('[Routine] could not open the next step', error)
      setTakeDeleteError('Could not advance practice. Your saved takes and completed items are safe; try again from Today.')
      handleOpenRoutineToday()
    })
  }, [commitRoutineDay, deferHudMediaPause, ensureRoutineDay, handleAutoSoundRecordingChange, handleOpenRoutineToday,
    restoreChallengeProject,
    openRoutineStep, rememberCurrentPracticeDesk, runPracticeTransition])

  const handleCompleteRoutineStep = useCallback(
    (stepId: string) => {
      triggerSuccessHaptic(settings.hapticFeedback)
      settleRoutineStep(stepId, 'done')
    },
    [settings.hapticFeedback, settleRoutineStep],
  )

  /** Checklist changes never create a recording or invent a completed sitting. */
  const handleToggleRoutineStep = useCallback((stepId: string) => {
    if (practiceTransition.current.busy || captureBusyRef.current) return
    const target = routineRef.current
    if (!target) return
    triggerLightHaptic(settings.hapticFeedback)
    const day = ensureRoutineDay(target)
    if (day.activeStepId === stepId) { settleRoutineStep(stepId, 'done'); return }
    if (day.pausedStepId === stepId) {
      void runPracticeTransition(`check:${stepId}`, async () => {
        const sessionId = day.sessionIdsByStep[stepId]?.at(-1)
        if (sessionId) await endPracticeSession(sessionId)
        exitRoutineProgram()
        commitRoutineDay(settleRoutineDayStep(day, target, stepId, 'done'))
        if (focusedRoutineContextRef.current?.routineId === target.id && focusedRoutineContextRef.current.stepId === stepId) {
          focusedRoutineContextRef.current = null
          focusedPracticeRef.current = null
          focusedPracticeSessionIdRef.current = null
          setFocusedPractice(null)
          setFocusedPracticeSessionId(null)
        }
      }).catch(() => setTakeDeleteError('Could not finish this item. Try again from Today.'))
      return
    }
    if (day.doneStepIds.includes(stepId)) {
      commitRoutineDay(reconcileDay({ ...day, doneStepIds: day.doneStepIds.filter(id => id !== stepId),
        completedAt: null, updatedAt: Date.now() }, target))
    } else commitRoutineDay(settleRoutineDayStep(day, target, stepId, 'done'))
  }, [commitRoutineDay, ensureRoutineDay, runPracticeTransition, settings.hapticFeedback, settleRoutineStep])

  /** Moves on without counting the step as done; Today lists it as skipped. */
  const handleSkipRoutineStep = useCallback((stepId: string) => {
    triggerLightHaptic(settings.hapticFeedback)
    settleRoutineStep(stepId, 'skipped')
  }, [settings.hapticFeedback, settleRoutineStep])

  /** Straight to any step from the bar's list. The step being left keeps its time. */
  const handleJumpToRoutineStep = useCallback((stepId: string) => {
    void handleStartRoutineStep(stepId).catch(() =>
      setTakeDeleteError('Could not open that step. Your routine is safe; try again.'))
  }, [handleStartRoutineStep])

  const handleEditRoutineFromBar = useCallback(() => {
    setRoutineBuilderRequest('edit')
    handleOpenRoutineToday()
  }, [handleOpenRoutineToday])

  /** Pause keeps this sitting resumable and stops the timer, click and drone. */
  const handlePauseRoutine = useCallback(() => {
    if (practiceTransition.current.busy || captureBusyRef.current) return
    const day = routineDayRef.current
    if (!day?.activeStepId) return
    triggerLightHaptic(settings.hapticFeedback)
    commitRoutineDay(pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
    pauseRoutineProgram()
    sharedMetronomeEngine.stop()
    applyDroneFromDesk(null, 4)
    deferHudMediaPause()
  }, [commitRoutineDay, deferHudMediaPause, settings.hapticFeedback])

  const handleCloseRoutine = useCallback(() => {
    void runPracticeTransition('close-routine', async () => {
      rememberCurrentPracticeDesk()
      const day = routineDayRef.current
      if (day) commitRoutineDay({
        ...pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current),
        pausedStepId: null,
      })
      exitRoutineProgram()
      sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
      deferHudMediaPause()
      const sessionId = focusedPracticeSessionIdRef.current
      focusedPracticeRef.current = null
      focusedPracticeSessionIdRef.current = null
      focusedRoutineContextRef.current = null
      setFocusedPractice(null)
      setFocusedPracticeSessionId(null)
      setFocusedReferenceTakeId(null)
      setLabsRoute(null)
      restoreRoutineAfterChallenge()
      if (sessionId) await endPracticeSession(sessionId)
    }).catch(() => setTakeDeleteError('Could not finish closing this practice session. Your saved routine and takes are safe.'))
  }, [commitRoutineDay, deferHudMediaPause, rememberCurrentPracticeDesk, restoreRoutineAfterChallenge, runPracticeTransition])

  // Save active time periodically. Backgrounding pauses accounting rather than
  // counting hours away; returning asks the player to resume explicitly.
  useEffect(() => {
    const checkpoint = () => {
      const day = routineDayRef.current
      if (day?.activeStepId) commitRoutineDay(checkpointRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
    }
    const suspend = (event?: Event) => {
      const day = routineDayRef.current
      if (!day?.activeStepId) return
      // iOS also reports "inactive" for a system prompt, Control Center or an
      // audio-route change while the app never leaves the screen — and opening
      // a step's tools can cause one. Only a hidden page means the player left;
      // a real background always hides it and comes back through here.
      if (document.visibilityState === 'visible') return
      console.info('[Routine] paused: app left the foreground',
        (event as CustomEvent<{ reason?: string }> | undefined)?.detail?.reason ?? event?.type ?? 'visibility-hidden')
      commitRoutineDay(pauseRoutineDay(day, Date.now(), liveDeskSnapshotRef.current))
      pauseRoutineProgram()
      // A steady native metronome continues on the lock screen. Timed programs
      // pause above because their section changes currently depend on WebKit.
      if (Capacitor.getPlatform() !== 'ios') sharedMetronomeEngine.stop()
      applyDroneFromDesk(null, 4)
      setIsPracticeHubOpen(true)
    }
    const visibility = () => {
      if (!Capacitor.isNativePlatform() && document.visibilityState === 'hidden') suspend()
    }
    const timer = window.setInterval(checkpoint, 15_000)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, suspend)
    window.addEventListener('pagehide', suspend)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener(APP_BACKGROUND_SUSPEND_EVENT, suspend)
      window.removeEventListener('pagehide', suspend)
    }
  }, [commitRoutineDay])

  const routineActiveStep = useMemo(() => {
    const id = routineDay?.activeStepId ?? routineDay?.pausedStepId
    if (!routine || !id) return null
    return routine.steps.find((step) => step.id === id) ?? null
  }, [routine, routineDay?.activeStepId, routineDay?.pausedStepId])

  const routineNextStep = useMemo(() => {
    if (!routine || !routineActiveStep) return null
    return stepAfter(routine, routineActiveStep.id)
  }, [routine, routineActiveStep])

  // A running routine is part of the Music dock. Bring the rail back when a
  // step opens there, even if the player's last Music visit left it closed.
  useEffect(() => {
    if (musicRoomActive && routineActiveStep) setMusicWidgetDrawerOpen(true)
  }, [musicRoomActive, routineActiveStep?.id])


  const handleReferenceUpload = (file: File) => {
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)) { setTakeDeleteError('Choose an audio file for References.'); return }
    const projectId = activeProjectIdRef.current
    void handleImportLibraryAudio(file).then(item => {
    if (!item) throw new Error('No reference imported')
    if (activeProjectIdRef.current !== projectId) return
    handleClearYoutube(); selectReferenceAudio(item.id); setReferenceExpanded(true)
    }).catch(() => setTakeDeleteError('Could not import reference audio. Please try another file.'))
  }

  const leaveSplitView = useCallback((reason: 'split-close' | 'split-exit') => {
    setIsSplitView(false)
    setSplitReferenceActive(false)
    const returnTab = splitReturnTabRef.current
    splitReturnTabRef.current = null
    if (returnTab && recordingModeRef.current === 'audio') handleAudioPracticeTabChange(returnTab)
    window.requestAnimationFrame(() => recoverCameraAfterSurfaceDismiss(reason))
  }, [handleAudioPracticeTabChange, recoverCameraAfterSurfaceDismiss])

  const handleToggleSplitView = useCallback(() => {
    if (isSplitView) { leaveSplitView('split-close'); return }
    // A reference can be opened from the music stand. The comparison needs
    // Record's layout while open, then must return to that same stand.
    splitReturnTabRef.current = recordingModeRef.current === 'audio' && audioPracticeTab !== 'audio'
      ? audioPracticeTab : null
    setSplitReferenceActive(false)
    setQuickSettingsOpen(false)
    // Expanded takes must remain available even when their floating cards are hidden.
    updateSettings({ showTakeCards: true })
    if (recordingModeRef.current === 'audio') handleAudioPracticeTabChange('audio')
    setIsSplitView(true)
    if (youtubeUrlRef.current) {
      window.requestAnimationFrame(() => {
        wakeYoutubeReference(youtubeIframeRef.current, { attemptPlay: false, uiVolume: 1 })
      })
    }
    if (isNativeCameraPlatform && recordingModeRef.current === 'video') void acquireNativeVideoBridge()
  }, [acquireNativeVideoBridge, audioPracticeTab, handleAudioPracticeTabChange, isNativeCameraPlatform, isSplitView, leaveSplitView, updateSettings])

  const handleExitSplitView = useCallback(() => {
    leaveSplitView('split-exit')
  }, [leaveSplitView])

  const handleExpandBenchmark = useMemo(
    () => libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake)
      ? () => handleOpenCompareReview('benchmark')
      : undefined,
    [benchmarkTake, handleOpenCompareReview, libraryBenchmarkPlayback],
  )

  const handleExpandChallenger = useMemo(
    () => takeHasPlaybackMedia(challengerTake)
      ? () => handleOpenCompareReview('challenger')
      : undefined,
    [challengerTake, handleOpenCompareReview],
  )

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
      <ChallengeRewardNotice />
      <FeatureGuidance
        paused={showOnboardingTutorial || !isOnboardingComplete() || isPracticeHubOpen ||
          isSettingsOpen || isVaultOpen || isReviewOpen || isLabsOpen || multitrackOpen ||
          isExperimentalOpen || focusPanel !== null ||
          isRecording || isStopping || pendingTakeSaves > 0 || takePlaybackActive ||
          handsFreePlaybackPending || practiceSessionActive || pipDragState.isDragging || Boolean(takeDeleteError)}
        feedbackPaused={showOnboardingTutorial || isRecording || isStopping || pendingTakeSaves > 0 || takePlaybackActive ||
          handsFreePlaybackPending || isLabsOpen || Boolean(takeDeleteError)}
        feedbackError={takeDeleteError}
        onDismissFeedbackError={() => setTakeDeleteError(null)}
        recordingActivity={!showOnboardingTutorial && !isPracticeHubOpen && !isSettingsOpen && !isVaultOpen &&
          !isReviewOpen && !isLabsOpen && !multitrackOpen && !quickSettingsOpen && !settings.autoSoundRecording &&
          !isRecording && !takeDeleteError && onRecordSurface
          ? isStopping || pendingTakeSaves > 0 ? 'Saving take' : challengerId && audioTakeReadiness[challengerId]?.status === 'preparing' ? 'Preparing playback' : null
          : null}
        surface={musicPageVisible ? 'music' : onRecordSurface ? 'recording' : 'other'}
        recordingReady={ready || simulatorCaptureAvailable}
        hasTakes={takes.length > 0}
        workspaceOpen={quickSettingsOpen}
        handsFreeEnabled={settings.autoSoundRecording}
        isRecording={isRecording}
      />
    <TutorialProvider
      active={showOnboardingTutorial || isPracticeHubOpen}
      enabled={tutorialTourEnabled}
      signals={tutorialSignals}
      onComplete={() => setTutorialTourEnabled(false)}
    >
      <ActionSheetProvider>
        <MetronomeProvider
          isTakePlaying={takePlaybackActive || handsFreePlaybackPending}
          muteDuringPlayback={settings.muteMetronomeDuringPlayback}
        >
          <AudioModePlaybackProvider
            onBeforePlay={handleAudioModeBeforePlaybackStart}
            onPlaybackActiveChange={handleAudioModePlaybackActiveChange}
          >
            <TakeGuidanceProvider takeId={guidedTakeId} currentId={challengerId}
              enabled={!isRecording && !isStopping && !suspendPipPlayback && !isSplitView && !multitrackOpen && !settings.autoSoundRecording && settings.showTakeCards}
              hasReference={Boolean((benchmarkTake && benchmarkTake.id !== challengerId) || libraryBenchmarkPlayback)}
              importedReference={Boolean(libraryBenchmarkPlayback)} videoPlaying={benchmarkPipPlaying || challengerPipPlaying}
              currentVideo={challengerPipVideoRef} bestVideo={benchmarkPipVideoRef}>
            <div
              ref={appShellRef}
              className={`app-shell lens-screen${recordingMode === 'video' ? ' lens-camera' : ''}${!isLabsOpen && !multitrackOpen ? ' open-lens-recording' : ''}${recordingMode === 'video' && isRecording ? ' open-lens-capturing' : ''}${recordingMode === 'audio' ? ' app-shell--audio-mode' : ''}${
                isSplitView ? ' app-shell--split-open' : ''
              }${musicPageVisible ? ' app-shell--music-page' : ''}${musicPageVisible && !musicWidgetDrawerOpen ? ' app-shell--music-dock-closed' : ''}${
                musicChromeHidden ? ' app-shell--music-chrome-hidden' : ''
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

              {focusPanel === 'references'  && <YoutubeUrlDialog open onClose={() => setFocusPanel(null)} onSubmit={handleSubmitYoutube} />}
              <PracticeHub
                onOpenSettings={() => { setIsPracticeHubOpen(false); handleOpenSettings() }}
                isOpen={isPracticeHubOpen}
                projects={projects}
                takes={takes}
                tunerTransposition={settings.tunerTransposition}
                handsFreeThreshold={settings.soundVolumeThreshold}
                hapticFeedback={settings.hapticFeedback}
                onClose={handleClosePracticeHub}
                onOpenQuickPractice={() => { handlePauseRoutine(); handleOpenQuickPractice() }}
                onOpenGames={handleOpenPracticeGames}
                onDailyPractice={handleDailyPractice}
                onDailyGame={handleDailyGame}
                onOpenVault={handleOpenVaultFromPracticeHub}
                onOpenTuner={handleOpenFullTunerFromPracticeHub}
                onOpenMetronome={handleOpenFullMetronomeFromPracticeHub}
                onOpenMusic={handleOpenMusicFromPracticeHub}
                lastPracticeDestination={lastPracticeDestination}
                onContinueMusic={handleContinueMusic}
                routine={incomingRoutine ?? routine}
                routineDay={routineDay}
                routineBuilderRequest={routineBuilderRequest}
                instrumentId={preferredInstrumentId}
                liveDeskSnapshot={liveDeskSnapshot}
                onSelectInstrument={handleSelectInstrument}
                onStartRoutineStep={handleStartRoutineStep}
                onToggleRoutineStep={handleToggleRoutineStep}
                onOpenRoutineBuilder={handleOpenRoutineBuilder}
                onCloseRoutineBuilder={() => { setRoutineBuilderRequest(null); setIncomingRoutine(null) }}
                onSaveRoutine={handleSaveRoutine}
                onCreatePracticeItem={handleCreatePracticeItem}
                onSaveAndStartRoutine={handleSaveAndStartRoutine}
                onDeleteRoutine={handleDeleteRoutine}
              />

              {routine &&
                routineActiveStep &&
                !multitrackOpen &&
                !isPracticeHubOpen &&
                !isReviewOpen &&
                !isVaultOpen &&
                !isSettingsOpen &&
                focusPanel === null &&
                !showOnboardingTutorial &&
                ((!isRecording && !isStopping) || musicRoomActive) && (
                  <RoutineBar
                    routine={routine}
                    day={routineDay}
                    step={routineActiveStep}
                    nextStep={routineNextStep}
                    goalMs={isChallengeRoutine(routine) ? 60_000 : undefined}
                    startedAt={routineDay?.activeStepStartedAt ?? null}
                    elapsedMs={routineDay?.elapsedMsByStep[routineActiveStep.id] ?? 0}
                    paused={!routineDay?.activeStepId}
                    busy={practiceTransitionBusy || pendingTakeSaves > 0 || isRecording || isStopping}
                    audioSurface={recordingMode === 'audio' && !isLabsOpen}
                    overLabs={isLabsOpen}
                    tunerTransposition={settings.tunerTransposition}
                    hapticFeedback={settings.hapticFeedback}
                    onResume={() => handleJumpToRoutineStep(routineActiveStep.id)}
                    onPause={handlePauseRoutine}
                    onClose={handleCloseRoutine}
                    onDone={() => handleCompleteRoutineStep(routineActiveStep.id)}
                    onSkip={isChallengeRoutine(routine) ? undefined : () => handleSkipRoutineStep(routineActiveStep.id)}
                    onJumpToStep={handleJumpToRoutineStep}
                    onEditRoutine={isChallengeRoutine(routine) ? undefined : handleEditRoutineFromBar}
                    onOpenToday={handleOpenRoutineToday}
                    preferBall={musicRoomActive || isLabsOpen}
                  />
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
                pauseNativePreviewUpdates={hudModalState === 'review'}
                cameraFacingFront={cameraFacingFront}
                onSwitchCamera={ready && hudModalState === 'idle' && !quickSettingsOpen && !isRecording && !isStopping ? handleSwitchCamera : undefined}
                nativeCameraBridgeEnabled={isNativeCameraPlatform}
                nativeLivePreviewSeedUrl={nativeLivePreviewSeedUrl}
                handsFreePlaybackTakeId={handsFreeBackgroundTake?.id ?? null}
                handsFreePlaybackSrc={handsFreeBackgroundPlaybackSrc}
                handsFreePlaybackPerformanceStartSeconds={handsFreeBackgroundTake?.performanceStartSeconds}
                handsFreePlaybackTailSkipSeconds={settings.soundSilenceSeconds}
                onHandsFreePlaybackPlayingChange={handleHandsFreeBackgroundPlaybackChange}
                onHandsFreePlaybackComplete={handleChallengerAutoPlayComplete}
              />

              {activeProjectId && settings.showMusic && (plus.active || isRecording || isStopping) && (
                <Suspense fallback={null}>
                  <PracticeChartLayer
                    key={activeProjectId}
                    projectId={activeProjectId}
                    revision={musicChartRevision}
                    onScoreReplaced={fileName => handleRenameMusicScore(activeProjectId, musicExerciseTitle(fileName))}
                    offerFileOnOpen={false}
                    workspace={{ ...hudQuickSettings, showTakeCards: musicTakesVisible }}
                    referencesVisible={referenceVisible}
                    onReferencesChange={visible => { setReferenceVisible(visible); setReferenceExpanded(visible) }}
                    onWorkspaceChange={(key, enabled) => {
                      switch (key) {
                        case 'pitchTrackerEnabled':
                          setMusicWorkspaceExpandRequest(current => ({ ...current, pitch: enabled || undefined }))
                          handlePitchTrackerSettingChange(enabled)
                          break
                        case 'showMetronome':
                          setMusicWorkspaceExpandRequest(current => ({ ...current, metronome: enabled || undefined }))
                          handleShowMetronomeSettingChange(enabled)
                          break
                        case 'showDrone':
                          setMusicWorkspaceExpandRequest(current => ({ ...current, drone: enabled || undefined }))
                          handleShowDroneSettingChange(enabled)
                          break
                        case 'showTakeCards':
                          setMusicTakesVisible(enabled)
                          setMusicWorkspaceExpandRequest(current => ({ ...current, takes: enabled || undefined }))
                          break
                        case 'audioEnhancerEnabled':
                          handleAudioEnhancerSettingChange(enabled)
                          break
                      }
                    }}
                    active={musicRoomActive}
                    boundaryRef={appShellRef}
                    collapseResetKey={routineActiveStep?.id}
                    onClose={handleCloseMusic}
                    onPaperVisibleChange={setMusicPageVisible}
                    onChromeHiddenChange={setMusicChromeHidden}
                    isRecording={isRecording}
                    isStopping={isStopping}
                    recordReady={ready || simulatorCaptureAvailable}
                    recordElapsed={elapsed}
                    onToggleRecord={handleToggleRecord}
                    handsFreeEnabled={settings.autoSoundRecording}
                    handsFreePhase={handsFreeStageVisiblePhase}
                    onToggleHandsFree={() => {
                      // Arming mid-take would stop the take the player is in
                      // the middle of; turning it off mid-take is fine.
                      if (isRecording && !settings.autoSoundRecording) return
                      handleAutoSoundRecordingChange(!settings.autoSoundRecording)
                      reportFeatureAction(settings.autoSoundRecording
                        ? 'hands-free-disabled' : 'hands-free-enabled')
                    }}
                  />
                </Suspense>
              )}

              {musicRoomActive && <MusicWidgetDrawer open={musicWidgetDrawerOpen} onOpenChange={setMusicWidgetDrawerOpen} />}

              {cameraNeedsPermission && !SKIP_MEDIA_PERMISSION_GATE && onRecordSurface &&
                !musicRoomActive && !isVaultOpen && !isSettingsOpen && !isReviewOpen &&
                !isExperimentalOpen && !isPracticeHubOpen && focusPanel === null &&
                !showOnboardingTutorial && (
                <CameraPermissionPrompt
                  recordingMode={recordingMode}
                  requesting={cameraPermissionRequestInFlight}
                  blocked={cameraPermissionBlocked}
                  onRequestPermission={requestCameraAccess}
                  onUseAudioOnly={() => handleRecordingModeChange('audio')}
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
                          mediaKey={`${mainAudioPitchSource.mediaKey}-${streamGeneration}-${musicPitchMonitorEpoch}`}
                          takeName={mainAudioPitchSource.take?.name}
                          label={mainAudioPitchSource.liveMicOnly ? 'Live Tuner' : 'Live Pitch'}
                          pitchSource="microphone"
                          nativePitchProcessing
                          onLiveSourceHealthChange={musicRoomActive ? handleMusicPitchSourceHealthChange : undefined}
                          positionId="main-pitch-audio"
                          liveMicEnabled={
                            (settings.liveMicTunerEnabled ||
                              mainAudioPitchSource.liveMicOnly === true) &&
                            !handsFreePlaybackPending &&
                            !autoPlaybackPlaying
                          }
                          micStreamRef={streamRef}
                          micPermissionBlocked={cameraPermissionBlocked}
                          layoutRegion="main"
                          liveMicOnly={mainAudioPitchSource.liveMicOnly === true}
                          tunerInstrument={settings.tunerInstrument}
                          tunerTransposition={settings.tunerTransposition}
                          onClose={handleClosePitch}
                          collapseResetKey={routineActiveStep?.id}
                          expandRequest={musicWorkspaceExpandRequest.pitch}
                          onExpandRequestConsumed={() => setMusicWorkspaceExpandRequest(current => ({
                            ...current, pitch: undefined,
                          }))}
                          visible={!pitchHudSuspended}
                          dockRight={musicRoomActive}
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
                        collapseResetKey={routineActiveStep?.id}
                        expandRequest={musicWorkspaceExpandRequest.metronome}
                        onExpandRequestConsumed={() => setMusicWorkspaceExpandRequest(current => ({
                          ...current, metronome: undefined,
                        }))}
                        visible={metronomeWidgetInteractive}
                        dockRight={musicRoomActive}
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
                <Suspense fallback={null}>
                  <AnimatePresence>
                    {showFloatingDroneWidget && (
                      <DraggableDroneWidget
                        key="desk-drone"
                        boundaryRef={appShellRef}
                        positionId="desk-drone"
                        defaultTopOffset={deskWidgetTopOffset + 158}
                        droneWaveform={settings.droneWaveform}
                        tunerTransposition={settings.tunerTransposition}
                        hapticFeedback={settings.hapticFeedback}
                        isTakePlaying={takePlaybackActive}
                        muteDuringPlayback={settings.muteMetronomeDuringPlayback}
                        onClose={handleCloseDrone}
                        collapseResetKey={routineActiveStep?.id}
                        expandRequest={musicWorkspaceExpandRequest.drone}
                        onExpandRequestConsumed={() => setMusicWorkspaceExpandRequest(current => ({
                          ...current, drone: undefined,
                        }))}
                        visible={droneWidgetInteractive}
                        dockRight={musicRoomActive}
                      />
                    )}
                  </AnimatePresence>
                </Suspense>
              </div>

              {musicRoomActive && musicTakesVisible && (
                <Suspense fallback={null}>
                  <DraggableTakesWidget
                    boundaryRef={appShellRef}
                    collapseResetKey={routineActiveStep?.id}
                    dockRight
                    expandRequest={musicWorkspaceExpandRequest.takes}
                    onExpandRequestConsumed={() => setMusicWorkspaceExpandRequest(current => ({ ...current, takes: undefined }))}
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
                    onShareBenchmark={benchmarkTake ? () => handleShareTake(benchmarkTake) : undefined}
                    onShareChallenger={challengerTake ? () => handleShareTake(challengerTake) : undefined}
                    isRecording={isRecording}
                  />
                </Suspense>
              )}

              {!onRecordSurface && !metronomeHudSuspended && !isLabsOpen && !showOnboardingTutorial && !quickSettingsOpen && !multitrackOpen && !musicPageVisible && !referenceVisible && (
                <PracticeToolStrip
                  reference={Boolean(youtubeUrl || routineActiveStep?.referenceQuery || routineActiveStep?.referenceVideoId)}
                  referenceReady={Boolean(youtubeUrl)} referenceExpanded={isSplitView}
                  light={recordingMode === 'audio'} disabled={isStopping}
                  onReference={() => { setReferenceVisible(true); setReferenceExpanded(true) }}
                />
              )}

              {/* Sibling of the rotator, not a child: `.app-ui-rotator` is a
                  positioned z-10 element, so anything nested inside it is
                  clamped to that plane and the z-36 metronome layer would paint
                  over the hands-free overlay. */}
              <HandsFreeStage
                phase={handsFreeStageVisiblePhase}
                movable
                dockRight={musicRoomActive}
                collapseResetKey={routineActiveStep?.id}
                notice={handsFreeNotice}
                replayCountdown={replayCountdown}
                onFinishTake={finishHandsFreeTake}
                onNextTake={finishAutoPlayback}
                elapsed={elapsed}
                onLightBackground={recordingMode === 'audio'}
                placement={handsFreeStagePlacement}
                onTapForSettings={() => {
                  reportFeatureAction('hands-free-settings-opened')
                  // Opening settings is also an explicit recovery gesture for
                  // a monitor that is still preparing after playback.
                  restartHandsFreeMonitorRef.current({ force: true })
                }}
                silenceSeconds={settings.soundSilenceSeconds}
                volumeThreshold={settings.soundVolumeThreshold}
                hapticFeedback={settings.hapticFeedback}
                onSilenceSecondsChange={(soundSilenceSeconds) => updateSettings({ soundSilenceSeconds })}
                onVolumeThresholdChange={(soundVolumeThreshold) => updateSettings({ soundVolumeThreshold })}
                onClose={handleCloseHandsFree}
              />
              <div id={PHYSICAL_UI_ROOT_ID} className="app-ui-rotator">
                {(recordingMode === 'video' || (recordingMode === 'audio' && !isAudioPracticeGamesTab)) && !isSplitView && !isLabsOpen && !multitrackOpen && (
                  <ReferenceWidget onExpandView={() => { handleReferenceBeforePlay(); handleToggleSplitView(); setSplitReferenceActive(true) }} showTrackName visible={referenceVisible} playing={referencePlaying} onClose={() => { setReferenceExpanded(false); setReferenceVisible(false) }} boundaryRef={appShellRef} expanded={referenceExpanded} onExpandedChange={setReferenceExpanded} dockRight={musicRoomActive}
                    youtubeUrl={youtubeUrl} libraryPlayback={referenceAudio?.playbackUrl ? { ...referenceAudio, playbackUrl: referenceAudio.playbackUrl } : null}
                    suspended={!referenceVisible || suspendPipPlayback || isRecording || isStopping || quickSettingsOpen || autoPlaybackPlaying}
                    onSubmitYoutube={(url) => { selectReferenceAudio(null); handleSubmitYoutube(url); setYoutubeAutoPlayOnLoad(false); setShowYoutubeExpandTip(false); setReferenceExpanded(true) }}
                    onUpload={handleReferenceUpload}
                    onClearAudio={() => selectReferenceAudio(null)} onClearYoutube={handleClearYoutube}
                    onYoutubeHostChange={handleYoutubeHostChange} youtubeIframeRef={youtubeIframeRef}
                    onBeforePlay={handleReferenceBeforePlay} onPlaybackChange={setReferencePlaying} />
                )}
                {showMainPitchWidget && mainVideoPitchSource && (
                  <Suspense fallback={null}>
                    <AnimatePresence>
                      {showPitch && mainVideoPitchSource && (
                        <div
                          className={`${
                            pitchHudSuspended
                              ? 'floating-widget-layer--inert fixed inset-0 z-[5]'
                              : 'contents'
                          }`}
                          aria-hidden={pitchHudSuspended}
                        >
                          <DraggablePitchWidget
                            boundaryRef={appShellRef}
                            mediaRef={mainVideoPitchSource.mediaRef}
                            enabled={pitchTrackerActive && !pitchHudSuspended}
                            isPlaying={mainVideoPitchSource.isPlaying}
                            mediaKey={mainVideoPitchSource.mediaKey}
                            label="Live Pitch"
                            pitchSource="microphone"
                            nativePitchProcessing
                            micStreamRef={streamRef}
                            layoutRegion="main"
                            positionId="main-pitch-video"
                            tunerInstrument={settings.tunerInstrument}
                            tunerTransposition={settings.tunerTransposition}
                            onClose={handleClosePitch}
                            collapseResetKey={routineActiveStep?.id}
                            visible={!pitchHudSuspended}
                          />
                        </div>
                      )}
                    </AnimatePresence>
                  </Suspense>
                )}

                <motion.div
                  className={`app-ui-overlay ${
                    recordingMode === 'audio' && !isSplitView ? 'app-ui-overlay--audio-mode' : ''
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

                  {onRecordSurface && !isSplitView && !musicPageVisible && (
                    <RecordingHeader mode={recordingMode} disabled={isRecording || isStopping || practiceTransitionBusy}
                      onModeChange={(mode) => { handleAudioPracticeTabChange('audio'); handleRecordingModeChange(mode) }}
                      hapticFeedback={settings.hapticFeedback} />
                  )}
                  {recordingMode === 'audio' && audioPracticeTab !== 'audio' && !isLabsOpen && !isAudioPracticeGamesTab && !practiceSessionActive && !isSplitView && !musicChromeHidden && (
                    <div data-tutorial="audio-mode-tabs">
                      <AudioPracticeTopTabs
                        activeTab={audioPracticeTab}
                        onTabChange={handleAudioPracticeTabChange}
                      />
                    </div>
                  )}

                  {recordingMode === 'audio' && !isSplitView && (
                    <div className="relative flex min-h-0 flex-1 overflow-hidden">
                      <AnimatedTabPanel panelKey="audio-practice-music-layer" active={isAudioPracticeMusicTab && musicLibraryOpen} keepMounted className="music-library-layer flex min-h-0 flex-1">
                        <MusicLibrary projects={projects} activeProjectId={activeProjectId} instrumentId={preferredInstrumentId} revision={musicChartRevision}
                          disabled={isRecording || isStopping || practiceTransitionBusy}
                          onCreateItem={handleCreatePracticeItem} onOpen={handleOpenMusicScore}
                          onRename={handleRenameMusicScore}
                          onImported={() => setMusicChartRevision(value => value + 1)} />
                      </AnimatedTabPanel>
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
                          linkedProgramId={routineActiveStep?.programId}
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

                      {/* Never unmounted for the music page, only hidden.
                          `AnimatedTabPanel` drops its children when inactive, and
                          this subtree holds a shared native audio-tap claim
                          (`useLiveRecordingWaveform`) that the floating tuner and
                          hands-free both read through. The app already learned
                          this once — see the `.widget-is-collapsed` note: folding
                          a tool must never take its capture down with it. */}
                      <AnimatedTabPanel
                        panelKey="audio-mode-home-layer"
                        active={audioPracticeTab === 'audio' && !isSplitView}
                        className="audio-mode-home-layer min-h-0 flex-1"
                      >
                        <div data-tutorial="audio-take-cards" className={guidedReviewVisible && !guidedAudioShowBoth ? 'guided-audio-stage' : undefined}>
                          <AudioModeHome
                            onRecord={handleToggleRecord}
                            recordDisabled={isStopping || practiceTransitionBusy || pendingTakeSaves > 0}
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
                          {guidedReviewVisible && challengerTake && (
                            <GuidedTakeReview
                              key={challengerTake.id}
                              takeId={challengerTake.id}
                              initialNote={challengerTake.notes}
                              focus={guidedNextFocus}
                              mode="audio"
                              playbackActive={takePlaybackActive}
                              audioShowBoth={guidedAudioShowBoth}
                              onToggleAudioView={() => setGuidedAudioBothTakeId(current => current === challengerTake.id ? null : challengerTake.id)}
                              onFocusChange={setGuidedNextFocus}
                              onSaveNote={(id, notes) => handleUpdateTake(id, { notes })}
                              onRecordAgain={handleToggleRecord}
                              recordDisabled={isStopping || practiceTransitionBusy || pendingTakeSaves > 0}
                            />
                          )}
                          {isRecording && <GuidedRecordingCue focus={guidedNextFocus} />}
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
                          referenceMode={splitReferenceActive}
                          splitRatio={splitRatio}
                          onSplitRatioChange={setSplitRatio}
                          benchmarkTake={splitReferenceActive ? null : benchmarkTake}
                          libraryBenchmarkPlayback={splitReferenceActive ? (referenceAudio?.playbackUrl ? { ...referenceAudio, playbackUrl: referenceAudio.playbackUrl } : null) : libraryBenchmarkPlayback}
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
                          cameraFacingFront={cameraFacingFront}
                          onSwitchCamera={ready && hudModalState === 'idle' && !quickSettingsOpen && !isRecording && !isStopping ? handleSwitchCamera : undefined}
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
                          onUnpinBenchmark={splitReferenceActive ? () => selectReferenceAudio(null) : handleUnpinBenchmark}
                          onClearLibraryReference={splitReferenceActive ? () => selectReferenceAudio(null) : handleClearLibraryReference}
                          onUnpinChallenger={handleUnpinChallenger}
                          onClearYoutube={handleClearYoutube}
                          onSubmitYoutube={splitReferenceActive ? (url) => { selectReferenceAudio(null); handleSubmitYoutube(url) } : handleSubmitYoutube}
                          onUploadBenchmark={splitReferenceActive ? handleReferenceUpload : handleUploadBenchmark}
                          onToggleSplitView={handleExitSplitView}
                          onBenchmarkPlaybackChange={splitReferenceActive ? setReferencePlaying : setBenchmarkPipPlaying}
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
                            youtubeEmbedUrl={null}
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

                    {recordingMode === 'video' && guidedReviewVisible && challengerTake && (
                      <GuidedTakeReview
                        key={challengerTake.id}
                        takeId={challengerTake.id}
                        initialNote={challengerTake.notes}
                        focus={guidedNextFocus}
                        mode="video"
                        playbackActive={takePlaybackActive}
                        onFocusChange={setGuidedNextFocus}
                        onSaveNote={(id, notes) => handleUpdateTake(id, { notes })}
                        onRecordAgain={handleToggleRecord}
                        onCompare={benchmarkTake || libraryBenchmarkPlayback ? handleToggleSplitView : undefined}
                        recordDisabled={isStopping || practiceTransitionBusy || pendingTakeSaves > 0}
                      />
                    )}
                    {recordingMode === 'video' && isRecording && <GuidedRecordingCue focus={guidedNextFocus} />}

                    {!isLabsOpen && !isAudioPracticeGamesTab &&
                      !musicChromeHidden &&
                      !(
                        isAudioPracticeTimelineTab &&
                        !practiceSessionActive &&
                        !quickSettingsOpen
                      ) && (
                      <ControlDeck
                        workspaceOnly={isAudioPracticeMetronomeTab}
                        onOpenReferences={!isSplitView ? () => { setQuickSettingsOpen(false); setReferenceVisible(true); setReferenceExpanded(true) } : undefined}
                        openLens
                        libraryAboveRecord
                        workspaceSections
                        toolsActive={isAudioPracticeToolTab}
                        onOpenTools={() => handleOpenFullPracticeTool(lastFullToolTab.current)}
                        toolsReturnMode={toolsReturnMode}
                        onOpenAudioRecorder={() => {
                          setMusicPageVisible(false)
                          handleAudioPracticeTabChange('audio')
                          if (toolsReturnMode === 'video') handleRecordingModeChange('video')
                        }}
                        vaultRevision={takes.length}
                        isRecording={isRecording}
                        isStopping={isStopping || pendingTakeSaves > 0}
                        elapsed={elapsed}
                        ready={ready || simulatorCaptureAvailable}
                        recordingMode={recordingMode}
                        onRecordingModeChange={handleRecordingModeChange}
                        onToggleRecord={handleToggleRecord}
                        onOpenHome={handleOpenPracticeHome}
                        onOpenVault={handleOpenVaultFromPracticeHub}
                        onOpenSettings={handleOpenSettings}
                        expandViewActive={isSplitView}
                        onToggleExpandView={handleToggleSplitView}
                        onOpenMultitrack={handleOpenMultitrack}
                        referenceControls={focusedPractice && youtubeUrl && isSplitView && !isRecording && !isStopping
                          ? <ReferencePassageControls key={`${focusedPractice.projectId}:${parseYoutubeVideoId(youtubeUrl)}`} controls={referencePassage} /> : undefined}
                        handsFreeRecording={handsFreeRecording}
                        handsFreeListeningReady={handsFreeListeningReady}
                        handsFreePlaybackPending={handsFreePlaybackPending || autoPlaybackPlaying}
                        handsFreePlaybackPlaying={autoPlaybackPlaying}
                        handsFreeReplayCountdown={replayCountdown}
                        autoSoundRecording={settings.autoSoundRecording}
                        onAutoSoundRecordingChange={handleAutoSoundRecordingChange}
                        recordDropRef={recordDeleteDropRef}
                        dragDeleteActive={pipDragState.isDragging}
                        dragOverDelete={pipDragState.overDelete}
                        pitchTrackerEnabled={hudQuickSettings.pitchTrackerEnabled}
                        pitchToggleVisible={!isAudioPracticeTunerTab}
                        showTakeCards={hudQuickSettings.showTakeCards}
                        onPitchTrackerChange={handlePitchTrackerSettingChange}
                        onShowTakeCardsChange={handleShowTakeCardsSettingChange}
                        showMetronome={hudQuickSettings.showMetronome}
                        metronomeToggleVisible={!isAudioPracticeMetronomeTab}
                        onShowMetronomeChange={handleShowMetronomeSettingChange}
                        showDrone={hudQuickSettings.showDrone}
                        droneToggleVisible
                        onShowDroneChange={handleShowDroneSettingChange}
                        showMusic={hudQuickSettings.showMusic}
                        musicToggleVisible={false}
                        onShowMusicChange={handleShowMusicSettingChange}
                        againPulse={againPulse}
                        audioEnhancerToggleVisible
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
                        practiceProjectId={focusedPractice?.projectId}
                        benchmarkLibraryId={benchmarkBinding?.source === 'library' ? benchmarkBinding.refId : undefined}
                        initialLoopStartSeconds={focusedPracticeState?.loopStartSeconds}
                        initialLoopEndSeconds={focusedPracticeState?.loopEndSeconds}
                        onLoopRangeChange={handleFocusedLoopRangeChange}
                      />
                    )}
                  </AnimatePresence>
                </Suspense>

                <Suspense fallback={null}>
                  <TakeVaultDrawer
                    simplified
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
                    dailyChallenge={dailyGameLaunch}
                    homeInstrumentId={preferredInstrumentId}
                    isOpen={isLabsOpen}
                    route={labsRoute ?? 'menu'}
                    streamRef={streamRef}
                    streamGeneration={streamGeneration}
                    tunerInstrument={settings.tunerInstrument}
                    tunerTransposition={settings.tunerTransposition}
                    hapticFeedback={settings.hapticFeedback}
                    micPermissionBlocked={cameraPermissionBlocked}
                    micPermissionPending={cameraPermissionRequestInFlight}
                    onClose={() => { setDailyGameLaunch(null); handleCloseLabs() }}
                    onNavigate={(route) => { setDailyGameLaunch(null); handleLabsNavigate(route) }}
                    onRequestMicStream={handleRequestLabsMicStream}
                    onReleaseMicStream={releaseLiveStream}
                  />

                  <MultitrackOverlay
                    routine={routine && routineActiveStep ? {
                      name: routine.name,
                      step: routineActiveStep.title,
                      progress: `${routine.steps.findIndex(step => step.id === routineActiveStep.id) + 1}/${routine.steps.length}`,
                      onNext: () => handleCompleteRoutineStep(routineActiveStep.id),
                      onOpen: () => { handleCloseMultitrack(); handleOpenRoutineToday() },
                    } : undefined}
                    onOpenRoutine={() => { handleCloseMultitrack(); handleOpenRoutineToday() }}
                    takesLoaded={takesLoaded}
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
                    audioEnhancerEnabled={settings.audioEnhancerEnabled}
                    onAudioEnhancerChange={handleAudioEnhancerSettingChange}
                  />
                </Suspense>

                <Suspense fallback={null}>
                  <AnimatePresence onExitComplete={() => {
                    if (!pendingDeveloperNoteRef.current) return
                    pendingDeveloperNoteRef.current = false
                    setShowDeveloperNote(true)
                  }}>
                    {showOnboardingTutorial && (
                      <OnboardingTutorial
                        key="onboarding-tutorial"
                        initialInstrumentId={preferredInstrumentId ?? undefined}
                        onComplete={finishOnboardingTutorial}
                        onSkip={finishOnboardingTutorial}
                        onSelectInstrument={handleSelectInstrument}
                        hapticFeedback={settings.hapticFeedback}
                      />
                    )}
                  </AnimatePresence>
                  {showDeveloperNote && <DeveloperNote onClose={closeDeveloperNote} />}
                  <CoachMark />
                </Suspense>
              </div>
            </div>
            </TakeGuidanceProvider>
          </AudioModePlaybackProvider>
        </MetronomeProvider>
      </ActionSheetProvider>
    </TutorialProvider>
    </PracticeReferenceContext.Provider>
  )
}
