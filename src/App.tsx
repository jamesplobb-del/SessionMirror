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
  type RefObject,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { AnimatePresence, motion } from 'framer-motion'
import LiveCameraBackground from './components/LiveCameraBackground'
import CameraPermissionPrompt from './components/CameraPermissionPrompt'
import HudHeader from './components/HudHeader'
import PipCompareRow from './components/PipCompareRow'
import SplitCompareLayout from './components/SplitCompareLayout'
import YoutubeBenchmarkPlayer from './components/YoutubeBenchmarkPlayer'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import { useCameraSession } from './hooks/useCameraSession'
import { usePhysicalOrientation } from './hooks/usePhysicalOrientation'
import { useAppSettings } from './hooks/useAppSettings'
import { useAppShellPolicies } from './hooks/useAppShellPolicies'
import { useAudioPracticeTab } from './hooks/useAudioPracticeTab'
import { useAutoSoundRecording } from './hooks/useAutoSoundRecording'
import { pausePitchGraphsForMedia } from './hooks/useLivePitchTracker'
import {
  registerAutoPlaybackHold,
  registerTakePlaybackMicHandlers,
  finalizeTakePlaybackCleanup,
  releaseTakePlaybackAudio,
  playTakeMediaAudible,
} from './utils/takePlaybackAudio'
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
} from './utils/playalong/youtubeBridge'
import {
  deleteTakeFile,
  NATIVE_AUDIO_MIME,
  NATIVE_VIDEO_MIME,
  persistUploadedVideo,
  isConvertedPlaybackUrl,
  readCachedPlaybackSrc,
  resolveTakePlaybackUrl,
  resolveNativeFileUri,
  type RecordingCompletePayload,
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
import { iosHudDim, motionGpuLayer } from './utils/motionPresets'
import { INTERACTIVE_TUTORIAL_STEPS, isOnboardingComplete, markOnboardingComplete } from './utils/onboardingTutorial'
import { ActionSheetProvider } from './context/ActionSheetContext'
import { MetronomeProvider } from './context/MetronomeContext'
import { TutorialProvider } from './context/TutorialContext'
import { deleteCachedTakeThumbnail, persistTakeThumbnail } from './utils/takeThumbnailCache'
import {
  createProject,
  DEFAULT_PROJECT_NAME,
  deleteProject,
  deleteVaultTake,
  deleteTakesByProject,
  findBestTakeId,
  getTakesByProject,
  initVaultDatabase,
  listProjects,
  saveTake,
  setProjectBestTake,
  uiTakesFromVaultRowsFast,
  hydrateVaultTakeRowsProgressive,
  updateVaultTake,
  type Project,
} from './db'
import { setTakePlaybackEnhancerState, setSpeakerLoudnessPreset } from './utils/takePlaybackSpeaker'
import { applyUseIphoneMicForRecording } from './utils/audioSessionRoute'
import { isPlaybackRouteHoldActive } from './utils/playbackRouteCoordinator'
import { setActiveCaptureProfile } from './utils/audioCapture'
import {
  buildRecordingCaptureDiagnostics,
  logRecordingCaptureDiagnostics,
} from './utils/recordingDiagnostics'
import {
  installPlaybackRouteEndedListener,
  preparePlaybackRoute,
  registerPlaybackCameraHandlers,
} from './utils/playbackRouteCoordinator'
import { syncNativeCameraSessionState } from './utils/cameraSessionState'
import { pickHudQuickSettings } from './utils/hudQuickSettings'
import { initAppFilesystem } from './utils/filesystemInit'
import { bootstrapViewport, stabilizeViewportAfterMediaInteraction } from './utils/viewportSync'
import { resumePlaybackAudioContext } from './utils/playbackAudioContext'
import { loadAppSettingsForSessionStart } from './utils/appSettings'
import { applyAutoPlaybackLeadIn } from './utils/autoRecordPlayback'
import {
  tuneMusicRecordingStream,
  tunePlaybackIsolationStream,
} from './utils/audioCapture'
import AppBootGate from './components/ui/AppBootGate'
import AudioPracticeTopTabs from './components/audioPractice/AudioPracticeTopTabs'
import AudioMetronomeTab from './components/audioPractice/AudioMetronomeTab'
import AudioTunerTab from './components/audioPractice/AudioTunerTab'
import AudioComboTab from './components/audioPractice/AudioComboTab'

const AUTO_PLAYBACK_POST_COOLDOWN_MS = 2800

function resolveTakePlaybackUrlFast(filePath: string, videoUrl: string): string | null {
  if (videoUrl && (videoUrl.startsWith('blob:') || isConvertedPlaybackUrl(videoUrl))) {
    return readCachedPlaybackSrc(filePath, videoUrl) ?? videoUrl
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

/** Wait for Settings sheet exit before attaching pitch engine (matches drawer close animation). */
const PITCH_ENGINE_COMMIT_DELAY_MS = 300

interface AppBootSnapshot {
  projects: Project[]
  activeProjectId: string | null
  takes: Take[]
  benchmarkId: string | null
  challengerId: string | null
}

const BOOT_REVEAL_DELAY_MS = 500

function formatBootFailureMessage(error: unknown): string {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : null
  const base =
    'BestTake could not start. Restart the app or reinstall if this continues.'
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

  if (initialId) {
    const rows = await getTakesByProject(initialId)
    const loadedFast = uiTakesFromVaultRowsFast(rows)
    benchmarkId = findBestTakeId(rows)
    const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null
    challengerId = settings.showTakeCards ? defaultChallengerId : null

    const hydrated = await hydrateVaultTakeRowsProgressive(rows, {
      priorityIds: [benchmarkId, defaultChallengerId].filter(
        (id): id is string => Boolean(id),
      ),
    })
    takes = mergeHydratedTakes(loadedFast, hydrated)
  }

  return {
    projects: projectList,
    activeProjectId: initialId,
    takes,
    benchmarkId,
    challengerId,
  }
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true)
  const [bootSnapshot, setBootSnapshot] = useState<AppBootSnapshot | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

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
  }, [])

  if (isBooting) {
    return <AppBootGate />
  }

  if (bootError || !bootSnapshot) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black p-6 text-center font-sans text-white">
        <p>{bootError ?? 'BestTake could not start.'}</p>
      </div>
    )
  }

  return <StandardApp bootSnapshot={bootSnapshot} />
}

function StandardApp({
  bootSnapshot,
}: {
  bootSnapshot: AppBootSnapshot
}) {
  usePhysicalOrientation()
  const [takes, setTakes] = useState<Take[]>(bootSnapshot.takes)
  const [projects, setProjects] = useState<Project[]>(bootSnapshot.projects)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(bootSnapshot.activeProjectId)
  const [benchmarkId, setBenchmarkId] = useState<string | null>(bootSnapshot.benchmarkId)
  const [challengerId, setChallengerId] = useState<string | null>(bootSnapshot.challengerId)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [reviewContext, setReviewContext] = useState<ReviewContext>('compare')
  const [vaultReviewIndex, setVaultReviewIndex] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [pipDragState, setPipDragState] = useState<PipDragUiState>({
    isDragging: false,
    isArming: false,
    overDelete: false,
  })
  const [autoPlaybackTakeId, setAutoPlaybackTakeId] = useState<string | null>(null)
  const [autoPlaybackPlaying, setAutoPlaybackPlaying] = useState(false)
  const [benchmarkPipPlaying, setBenchmarkPipPlaying] = useState(false)
  const [challengerPipPlaying, setChallengerPipPlaying] = useState(false)
  const [showPitch, setShowPitch] = useState(false)
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false)
  const [pendingPitchTrackerEnabled, setPendingPitchTrackerEnabled] = useState<boolean | null>(
    null,
  )
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(null)
  const [isSplitView, setIsSplitView] = useState(false)
  const isSplitViewRef = useRef(false)
  const [splitRatio, setSplitRatio] = useState(50)
  const [showOnboardingTutorial, setShowOnboardingTutorial] = useState(false)
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0)

  const { settings, updateSettings, resetSettings } = useAppSettings()
  const {
    activeTab: audioPracticeTab,
    setActiveTab: setAudioPracticeTab,
    resetToAudioTab,
  } = useAudioPracticeTab()
  const showTakeCardsRef = useRef(settings.showTakeCards)
  showTakeCardsRef.current = settings.showTakeCards
  const pendingChallengerIdRef = useRef<string | null>(null)
  const reloadTakesGenerationRef = useRef(0)
  const takesRef = useRef<Take[]>([])
  const pendingAutoPlaybackRef = useRef(false)
  const autoPlaybackAudioRef = useRef<HTMLAudioElement | null>(null)
  const liveMicPlaceholderRef = useRef<HTMLMediaElement | null>(null)
  const queuedAutoPlayRef = useRef<{ url: string; takeId: string } | null>(null)
  const recordingModeRef = useRef<RecordingMode>('video')
  const cameraReadyRef = useRef(false)
  const pitchCommitTimerRef = useRef<number | null>(null)
  const autoPlaybackReleaseTimerRef = useRef<number | null>(null)
  const autoPlaybackGenerationRef = useRef(0)
  const playAutoTakeAudioRef = useRef<(playbackUrl: string, takeId: string) => void>(() => {})
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
  const [youtubeHostEl, setYoutubeHostEl] = useState<HTMLElement | null>(null)
  const appShellRef = useRef<HTMLDivElement>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId

  const pitchUserDismissedRef = useRef(false)

  const isReviewOpen = reviewSlot !== null
  const hudModalState: 'idle' | 'sheet' | 'review' = isReviewOpen
    ? 'review'
    : isVaultOpen || isSettingsOpen
      ? 'sheet'
      : 'idle'

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

  const handleCloseOnboardingTutorial = useCallback(() => {
    setShowOnboardingTutorial(false)
  }, [])

  const handleTutorialComplete = useCallback(() => {
    markOnboardingComplete()
    setShowOnboardingTutorial(false)
  }, [])

  const handleReplayOnboardingTutorial = useCallback(() => {
    setIsSettingsOpen(false)
    setTutorialStepIndex(0)
    scheduleAfterPaint(() => {
      setShowOnboardingTutorial(true)
    })
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    void syncAppOrientationLock()

    let removeListener: (() => void) | undefined
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
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

  const finishAutoPlayback = useCallback(() => {
    void finalizeTakePlaybackCleanup().finally(() => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(AUTO_PLAYBACK_POST_COOLDOWN_MS)
    })
  }, [releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const playAutoTakeAudio = useCallback(
    (playbackUrl: string, takeId: string) => {
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

      teardownAutoPlaybackMedia()
      queuedAutoPlayRef.current = { url: playbackUrl, takeId }

      setAutoRecordStartSuppressed(true)
      setHandsFreePlaybackPending(true)
      setAutoPlaybackPlaying(false)
      setAutoPlaybackTakeId(takeId)

      const audio = autoPlaybackAudioRef.current
      if (!audio) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        finishAutoPlayback()
        return
      }

      prepareInlineMediaElement(audio)
      audio.preload = 'auto'
      assignMediaPlaybackSrc(audio, playbackUrl)
      audio.load()

      void (async () => {
        const routePrep = Capacitor.isNativePlatform()
          ? preparePlaybackRoute({ suspendCamera: false }).catch((error) => {
              console.warn('[PlaybackRoute] auto-playback prep failed', error)
            })
          : Promise.resolve()

        const ready = await Promise.all([
          waitForMediaReadyWithRetry(audio),
          routePrep,
        ]).then(([mediaReady]) => mediaReady)
        if (autoPlaybackGenerationRef.current !== playbackGeneration) return
        if (!ready || queuedAutoPlayRef.current?.takeId !== takeId) {
          finishAutoPlayback()
          return
        }

        await applyAutoPlaybackLeadIn(audio)

        audio.onended = () => finishAutoPlayback()
        audio.onerror = () => finishAutoPlayback()

        const started = await playTakeMediaAudible(audio, {
          onFailure: () => setAutoPlaybackPlaying(false),
        })
        if (autoPlaybackGenerationRef.current !== playbackGeneration) return

        if (started) {
          setHandsFreePlaybackPending(false)
          setAutoPlaybackPlaying(true)
        } else {
          finishAutoPlayback()
        }
      })()
    },
    [finishAutoPlayback, teardownAutoPlaybackMedia],
  )

  playAutoTakeAudioRef.current = playAutoTakeAudio

  const applyTakeThumbnails = useCallback((updates: Map<string, string>) => {
    setTakes((prev) =>
      prev.map((take) => {
        const thumbnailUrl = updates.get(take.id)
        return thumbnailUrl ? { ...take, thumbnailUrl } : take
      }),
    )
  }, [])

  const reloadProjectTakes = useCallback(
    async (projectId: string) => {
      const generation = ++reloadTakesGenerationRef.current
      const rows = await getTakesByProject(projectId)
      if (generation !== reloadTakesGenerationRef.current) return

      const loadedFast = uiTakesFromVaultRowsFast(rows)
      const bestId = findBestTakeId(rows)
      const defaultChallengerId = rows.find((row) => !row.isBestTake)?.id ?? null

      setTakes((current) => mergeHydratedTakes(current, loadedFast))
      setBenchmarkId(bestId)
      setChallengerId((current) => {
        if (!showTakeCardsRef.current) return null
        if (current && rows.some((row) => row.id === current)) return current
        if (current && pendingChallengerIdRef.current === current) return current
        return defaultChallengerId
      })

      scheduleIdle(() => {
        if (generation !== reloadTakesGenerationRef.current) return

        void hydrateVaultTakeRowsProgressive(rows, {
          priorityIds: [bestId, defaultChallengerId].filter(
            (id): id is string => Boolean(id),
          ),
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
    [applyTakeThumbnails],
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
      await reloadProjectTakes(projectId)
    },
    [pausePipVideos, releaseAutoRecordSuppress, reloadProjectTakes, stopAutoPlaybackAudio],
  )

  const handleCreateProject = useCallback(async (name: string) => {
    const project = await createProject(name.trim())
    setProjects((prev) => [project, ...prev])
    setActiveProjectId(project.id)
    setTakes([])
    setBenchmarkId(null)
    setChallengerId(null)
  }, [])

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()

      const rows =
        projectId === activeProjectIdRef.current
          ? takes.map((take) => ({
              id: take.id,
              filePath: take.filePath,
            }))
          : (await getTakesByProject(projectId)).map((row) => ({
              id: row.id,
              filePath: row.filePath,
            }))

      await deleteProject(projectId)

      for (const row of rows) {
        await deleteCachedTakeThumbnail(row.id)
        if (row.filePath) {
          await deleteTakeFile(row.filePath)
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
        return
      }

      setProjects(remaining)

      if (!deletingActive) return

      const next = remaining[0]
      setActiveProjectId(next.id)
      setTakes([])
      setBenchmarkId(null)
      setChallengerId(null)
      await reloadProjectTakes(next.id)
    },
    [
      pausePipVideos,
      projects,
      releaseAutoRecordSuppress,
      reloadProjectTakes,
      stopAutoPlaybackAudio,
      takes,
    ],
  )

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
    } = payload

    const shouldAutoPlay =
      mediaType === 'audio' &&
      pendingAutoPlaybackRef.current &&
      recordingModeRef.current === 'audio'

    const optimisticUrl =
      resolveTakePlaybackUrlFast(filePath, videoUrl) ??
      (videoUrl ? resolveMediaPlaybackSrc(videoUrl) : '')
    const projectId = activeProjectIdRef.current

    if (showTakeCardsRef.current || shouldAutoPlay) {
      pendingChallengerIdRef.current = takeId
      setChallengerId(takeId)
    }

    setTakes((prev) => {
      const index = prev.length + 1
      const savedTake: Take = {
        ...createTake(takeId, index, optimisticUrl, filePath, mimeType, mediaType),
        recordingOrientation: recordingOrientation ?? 'portrait',
      }
      return [...prev, savedTake]
    })

    if (shouldAutoPlay && optimisticUrl) {
      pendingAutoPlaybackRef.current = false
      playAutoTakeAudioRef.current(optimisticUrl, takeId)
    } else if (shouldAutoPlay) {
      pendingAutoPlaybackRef.current = false
      setHandsFreePlaybackPending(false)
      releaseAutoRecordSuppress(0)
    }

    if (mediaType === 'audio') {
      setTakes((current) =>
        current.map((take) =>
          take.id === takeId ? { ...take, thumbnailUrl: AUDIO_TAKE_THUMBNAIL } : take,
        ),
      )
    }

    void (async () => {
      const safeVideoUrl = resolveMediaPlaybackSrc(
        optimisticUrl || (await resolveTakePlaybackUrl(filePath, videoUrl)),
      )

      if (safeVideoUrl && safeVideoUrl !== optimisticUrl) {
        setTakes((current) =>
          current.map((take) =>
            take.id === takeId ? { ...take, videoUrl: safeVideoUrl } : take,
          ),
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
              recordingOrientation,
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
              playbackUrl = await resolveTakePlaybackUrl(
                normalized.filePath,
                normalized.videoUrl,
              )
            }
          }

          if (playbackUrl !== optimisticUrl || resolvedFilePath !== filePath) {
            setTakes((current) =>
              current.map((take) =>
                take.id === takeId
                  ? { ...take, videoUrl: playbackUrl, filePath: resolvedFilePath }
                  : take,
              ),
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
            name: mediaType === 'audio' ? `Audio ${takeIndex}` : `Take ${takeIndex}`,
          })
        }

        let audioAnalysisSource: Blob | string | null = normalizedBlob ?? blob ?? null
        if (!audioAnalysisSource && resolvedFilePath) {
          const nativeUri = await resolveNativeFileUri(resolvedFilePath)
          if (nativeUri) audioAnalysisSource = nativeUri
        } else if (!audioAnalysisSource && playbackUrl) {
          audioAnalysisSource = playbackUrl
        }

        const captureDiagnostics = await buildRecordingCaptureDiagnostics(
          captureProfile ?? 'natural',
          captureTrackSnapshot ?? null,
          audioAnalysisSource,
        )
        logRecordingCaptureDiagnostics(takeId, captureDiagnostics)

        if (captureDiagnostics.playbackGainMetadata) {
          setTakes((current) =>
            current.map((take) =>
              take.id === takeId
                ? {
                    ...take,
                    playbackGainMetadata: captureDiagnostics.playbackGainMetadata ?? undefined,
                  }
                : take,
            ),
          )
        }

        pendingChallengerIdRef.current = null

        if (mediaType !== 'video') return

        const thumbnailTake: Take = {
          ...createTake(takeId, 1, playbackUrl, resolvedFilePath, mimeType, mediaType),
          recordingOrientation: recordingOrientation ?? 'portrait',
        }

        const thumbnailPromise = normalizedBlob
          ? generateThumbnailFromBlob(
              normalizedBlob,
              thumbnailTake.mirrorPlayback !== false,
              thumbnailTake.recordingOrientation,
            ).then((dataUrl) =>
              persistTakeThumbnail(
                takeId,
                dataUrl,
                thumbnailTake.recordingOrientation ?? 'portrait',
              ),
            )
          : captureAndPersistTakeThumbnail(thumbnailTake)

        void thumbnailPromise
          .then((thumbnailUrl) => {
            if (!thumbnailUrl) return
            setTakes((current) =>
              current.map((take) =>
                take.id === takeId ? { ...take, thumbnailUrl } : take,
              ),
            )
          })
          .catch(() => {
            /* vault falls back to placeholder until thumbnail is ready */
          })
    })()
  }, [])

  youtubeUrlRef.current = youtubeUrl

  useEffect(() => {
    setYoutubeReferenceActive(Boolean(youtubeUrl))
  }, [youtubeUrl])

  const handleYoutubeHostChange = useCallback((el: HTMLDivElement | null) => {
    setYoutubeHostEl(el)
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
    setCameraResumeNonce((nonce) => nonce + 1)
  }, [pauseYoutubeReference])

  const {
    previewRef,
    streamRef,
    streamGeneration,
    needsPermission: cameraNeedsPermission,
    permissionRequestInFlight: cameraPermissionRequestInFlight,
    requestCameraAccess,
    ready,
    isRecording,
    elapsed,
    recordingMode,
    changeRecordingMode,
    toggleRecording,
    startAutoAudioRecording,
    stopRecording,
    warmAutoAudioRecorder,
    disarmAutoAudioRecorder,
    tryMarkAutoPerformanceStart,
    isAutoPreRollCaptureActive,
    getAutoPreRollAgeMs,
    restartAutoPreRollCapture,
    refreshCameraSession,
    requestCameraPreviewResume,
    suspendCameraForBackground,
    suspendMicForPlayback,
    resumeMicAfterPlayback,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
    secondaryPreviewRef: splitPreviewRef,
    onBeforeForegroundRestart: handleBeforeForegroundRestart,
    onAfterForegroundRestart: resumeYoutubeReference,
  })

  useEffect(() => {
    registerYoutubeStereoGuard(
      () =>
        !isRecording &&
        !autoPlaybackPlaying &&
        !handsFreePlaybackPending,
    )
  }, [autoPlaybackPlaying, handsFreePlaybackPending, isRecording])

  // Re-assert the mic preference whenever the camera (re)starts so it survives
  // cold launch / foreground / mode changes. Gentle input-only switch — no reacquire.
  useEffect(() => {
    if (!ready) return
    if (isPlaybackRouteHoldActive()) return
    void applyUseIphoneMicForRecording(settings.useIphoneMicForRecording)
  }, [settings.useIphoneMicForRecording, ready])

  useEffect(() => {
    if (isPlaybackRouteHoldActive()) return
    void syncNativeCameraSessionState({
      previewActive: ready && recordingMode === 'video',
      recordingActive: isRecording,
    })
  }, [ready, isRecording, recordingMode])

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
      hasLivePreview: () =>
        cameraReadyRef.current && recordingModeRef.current === 'video',
    })
    installPlaybackRouteEndedListener(() => {
      void refreshCameraSession()
    })
    registerAutoPlaybackHold(
      () =>
        pendingAutoPlaybackRef.current ||
        autoPlaybackPlayingRef.current ||
        handsFreePlaybackPending,
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

  const autoMonitoringAllowed =
    !isVaultOpen && !isSettingsOpen && !isReviewOpen && ready

  const { handsFreeRecording, restartHandsFreeMonitor } = useAutoSoundRecording({
    enabled: settings.autoSoundRecording,
    monitoringAllowed: autoMonitoringAllowed,
    suppressStart: autoRecordStartSuppressed,
    monitoringPaused:
      handsFreePlaybackPending ||
      autoPlaybackPlaying ||
      benchmarkPipPlaying ||
      challengerPipPlaying,
    recordingMode,
    ready,
    isRecording,
    streamRef,
    streamGeneration,
    silenceMs: settings.soundSilenceSeconds * 1000,
    volumeThreshold: settings.soundVolumeThreshold,
    startRecording: startAutoAudioRecording,
    stopRecording,
    warmRecorder: () => {
      void warmAutoAudioRecorder()
    },
    disarmRecorder: () => {
      void disarmAutoAudioRecorder()
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
      void refreshCameraSession()
    },
  })

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
  }, [
    isRecording,
    pauseYoutubeReference,
    settings.excludeYoutubeFromRecording,
    streamGeneration,
  ])

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
    if (!settings.autoSoundRecording || recordingMode !== 'audio') return

    const recoverHandsFreeMonitor = () => {
      if (document.visibilityState !== 'visible') return
      window.setTimeout(() => {
        void refreshCameraSession().finally(() => {
          restartHandsFreeMonitor()
        })
      }, 800)
    }

    if (Capacitor.isNativePlatform()) {
      let removeListener: (() => void) | undefined
      void import('@capacitor/app').then(({ App }) => {
        void App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) recoverHandsFreeMonitor()
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

    document.addEventListener('visibilitychange', recoverHandsFreeMonitor)
    return () => {
      document.removeEventListener('visibilitychange', recoverHandsFreeMonitor)
    }
  }, [
    recordingMode,
    refreshCameraSession,
    restartHandsFreeMonitor,
    settings.autoSoundRecording,
  ])

  const autoSoundListening =
    settings.autoSoundRecording &&
    recordingMode === 'audio' &&
    autoMonitoringAllowed &&
    !isRecording &&
    !autoRecordStartSuppressed &&
    !handsFreePlaybackPending

  const wasVaultOpenRef = useRef(false)
  const vaultEnterLoadDoneRef = useRef(false)
  const vaultHydrateInFlightRef = useRef(false)

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
          priorityIds: [bestId, defaultChallengerId].filter(
            (id): id is string => Boolean(id),
          ),
        })
        setTakes((current) => mergeHydratedTakes(current, loaded))
        setBenchmarkId(bestId)
        void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnails)
      } finally {
        vaultHydrateInFlightRef.current = false
      }
    },
    [applyTakeThumbnails],
  )

  useEffect(() => {
    if (wasVaultOpenRef.current && !isVaultOpen) {
      stabilizeViewportAfterMediaInteraction()
      const timer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 350)
      wasVaultOpenRef.current = isVaultOpen
      return () => window.clearTimeout(timer)
    }
    wasVaultOpenRef.current = isVaultOpen
  }, [isVaultOpen, refreshCameraSession])

  const wasSettingsOpenRef = useRef(false)
  useEffect(() => {
    if (wasSettingsOpenRef.current && !isSettingsOpen) {
      stabilizeViewportAfterMediaInteraction()
      const timer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 350)
      wasSettingsOpenRef.current = isSettingsOpen
      return () => window.clearTimeout(timer)
    }
    wasSettingsOpenRef.current = isSettingsOpen
  }, [isSettingsOpen, refreshCameraSession])

  const wasReviewOpenRef = useRef(false)
  useEffect(() => {
    if (wasReviewOpenRef.current && !isReviewOpen) {
      stabilizeViewportAfterMediaInteraction()
      void finalizeTakePlaybackCleanup()
      wasReviewOpenRef.current = isReviewOpen
      return
    }
    wasReviewOpenRef.current = isReviewOpen
  }, [isReviewOpen])

  const deferHudMediaPause = useCallback(() => {
    scheduleAfterPaint(() => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
    })
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const handleCloseVault = useCallback(() => {
    startTransition(() => {
      setIsVaultOpen(false)
    })
  }, [])

  const handleOpenVault = useCallback(() => {
    setShowPitch(false)
    startTransition(() => {
      setIsSettingsOpen(false)
      setIsVaultOpen(true)
    })
    deferHudMediaPause()
  }, [deferHudMediaPause])

  const handleVaultEnterComplete = useCallback(() => {
    if (vaultEnterLoadDoneRef.current) return
    vaultEnterLoadDoneRef.current = true

    const projectId = activeProjectIdRef.current
    if (!projectId) return

    void loadVaultTakesFromFilesystem(projectId)
  }, [loadVaultTakesFromFilesystem])

  const handleOpenSettings = useCallback(() => {
    setShowPitch(false)
    startTransition(() => {
      setIsVaultOpen(false)
      setIsSettingsOpen(true)
    })
    deferHudMediaPause()
  }, [deferHudMediaPause])

  const handleRecordingModeChange = useCallback(
    (mode: RecordingMode) => {
      if (mode !== recordingModeRef.current) {
        setShowPitch(false)
        resetToAudioTab()
        sharedMetronomeEngine.reconcileAfterModeSwitch()
        if (import.meta.env.DEV) {
          console.log(mode === 'video' ? '[ModeSwitch] entering camera' : '[ModeSwitch] entering audio')
        }
      }
      changeRecordingMode(mode)
      if (mode === 'video') {
        scheduleAfterPaint(() => {
          void requestCameraPreviewResume('mode-switch')
        })
      }
    },
    [changeRecordingMode, requestCameraPreviewResume, resetToAudioTab],
  )

  const handleCloseSettings = useCallback(() => {
    startTransition(() => {
      setIsSettingsOpen(false)
    })
  }, [])

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
    [updateSettings],
  )

  const hudQuickSettings = useMemo(
    () => ({
      ...pickHudQuickSettings(settings),
      pitchTrackerEnabled:
        pendingPitchTrackerEnabled ?? settings.pitchTrackerEnabled,
    }),
    [
      pendingPitchTrackerEnabled,
      settings.audioEnhancerEnabled,
      settings.pitchTrackerEnabled,
      settings.showMetronome,
      settings.showTakeCards,
    ],
  )

  const pitchTrackerActive =
    pendingPitchTrackerEnabled ?? settings.pitchTrackerEnabled

  const handlePitchTrackerSettingChange = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setShowPitch(false)
      } else {
        pitchUserDismissedRef.current = false
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
    [schedulePitchTrackerCommit, updateSettings],
  )

  const handleShowTakeCardsSettingChange = useCallback(
    (show: boolean) => {
      updateSettings({ showTakeCards: show })
    },
    [updateSettings],
  )

  const handleShowMetronomeSettingChange = useCallback(
    (show: boolean) => {
      updateSettings({ showMetronome: show })
    },
    [updateSettings],
  )

  const handleAudioEnhancerSettingChange = useCallback(
    (enabled: boolean) => {
      startTransition(() => {
        updateSettings({ audioEnhancerEnabled: enabled })
      })
    },
    [updateSettings],
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

  const suspendPipPlayback = isVaultOpen || isReviewOpen || isSettingsOpen

  /** Audio-mode hands-free plays through hidden `<audio>` — PiP must not auto-play the same take. */
  const challengerHandsFreeAutoPlayRequestId =
    recordingMode === 'audio' ? null : autoPlaybackTakeId

  const benchmarkTake = useMemo(
    () => takes.find((t) => t.id === benchmarkId) ?? null,
    [takes, benchmarkId],
  )

  const challengerTake = useMemo(
    () => takes.find((t) => t.id === challengerId) ?? null,
    [takes, challengerId],
  )

  takesRef.current = takes

  const refreshStaleTakePlaybackUrls = useCallback(() => {
    void (async () => {
      const snapshot = takesRef.current
      const activeIds = new Set(
        [benchmarkId, challengerId].filter((id): id is string => Boolean(id)),
      )
      const targets = snapshot.filter(
        (take) => take.filePath && (activeIds.has(take.id) || !take.videoUrl),
      )
      if (targets.length === 0) return

      const refreshed = await Promise.all(
        targets.map(async (take) => {
          const resolved = await resolveTakePlaybackUrl(take.filePath, take.videoUrl)
          const safe = resolveMediaPlaybackSrc(resolved)
          return safe && safe !== take.videoUrl ? { ...take, videoUrl: safe } : take
        }),
      )

      if (!refreshed.some((take, index) => take !== targets[index])) return

      const refreshedById = new Map(refreshed.map((take) => [take.id, take]))
      setTakes((current) =>
        current.map((take) => refreshedById.get(take.id) ?? take),
      )
    })()
  }, [benchmarkId, challengerId])

  useEffect(() => {
    let debounceTimer: number | null = null
    let youtubeTimer: number | null = null

    const runRecovery = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        refreshStaleTakePlaybackUrls()
        if (youtubeTimer !== null) {
          window.clearTimeout(youtubeTimer)
        }
        youtubeTimer = window.setTimeout(() => {
          youtubeTimer = null
          resumeYoutubeReference()
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
  }, [refreshStaleTakePlaybackUrls, resumeYoutubeReference])

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
  }, [
    pitchTrackerActive,
    recordingMode,
    ready,
    isRecording,
  ])

  const pitchHudSuspended = isVaultOpen || isSettingsOpen || isReviewOpen

  const showMainPitchWidget = mainAudioPitchSource !== null || mainVideoPitchSource !== null

  const showMetronomeWidget = settings.showMetronome

  const metronomeHudSuspended = isVaultOpen || isSettingsOpen || isReviewOpen

  const metronomeWidgetInteractive = showMetronomeWidget && !metronomeHudSuspended

  const takePlaybackActive =
    autoPlaybackPlaying || benchmarkPipPlaying || challengerPipPlaying

  useAppShellPolicies({
    keepAwake: isRecording || isReviewOpen || takePlaybackActive,
    hudSurface: hudModalState,
  })

  useEffect(() => {
    setTakePlaybackEnhancerState(
      settings.audioEnhancerEnabled,
      settings.audioEnhancerEnabled ? settings.audioEnhancerSettings : undefined,
    )
  }, [settings.audioEnhancerEnabled, settings.audioEnhancerSettings])

  useEffect(() => {
    setSpeakerLoudnessPreset(settings.speakerLoudnessPreset)
  }, [settings.speakerLoudnessPreset])

  useEffect(() => {
    setActiveCaptureProfile('natural')
  }, [])

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

  const metronomeStageActive = false

  const isAudioPracticeMainTab =
    recordingMode !== 'audio' || audioPracticeTab === 'audio'

  const isAudioPracticeMetronomeTab =
    recordingMode === 'audio' && audioPracticeTab === 'metronome'

  const isAudioPracticeTunerTab =
    recordingMode === 'audio' && audioPracticeTab === 'tuner'

  const isAudioPracticeComboTab =
    recordingMode === 'audio' && audioPracticeTab === 'combo'

  const isAudioPracticeToolTab =
    isAudioPracticeMetronomeTab || isAudioPracticeTunerTab || isAudioPracticeComboTab

  const showFloatingMainPitch =
    showPitch &&
    mainAudioPitchSource !== null &&
    !isAudioPracticeTunerTab

  const pitchContextKey =
    mainAudioPitchSource?.mediaKey ?? mainVideoPitchSource?.mediaKey ?? null

  useEffect(() => {
    pitchUserDismissedRef.current = false
  }, [pitchContextKey, recordingMode])

  useEffect(() => {
    if (!pitchTrackerActive) {
      setShowPitch(false)
      pitchUserDismissedRef.current = false
      return
    }

    if (!showMainPitchWidget) {
      setShowPitch(false)
      return
    }

    if (pitchHudSuspended) {
      return
    }

    if (!pitchUserDismissedRef.current) {
      setShowPitch(true)
    }
  }, [pitchTrackerActive, showMainPitchWidget, pitchHudSuspended])

  const handleClosePitch = useCallback(() => {
    pitchUserDismissedRef.current = true
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
      if (current && pendingChallengerIdRef.current === current) return current
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

  const sortedTakes = useMemo(
    () => sortTakes(takes, sortMode),
    [takes, sortMode],
  )

  const handlePinBenchmark = useCallback(
    (id: string) => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setYoutubeUrl(null)
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
    [pausePipVideos, releaseAutoRecordSuppress, sortMode, stopAutoPlaybackAudio, takes],
  )

  const handlePinChallenger = useCallback(
    (id: string) => {
      pausePipVideos()
      setChallengerId(id)
    },
    [pausePipVideos],
  )

  const handleOpenVaultTake = useCallback(
    (take: Take) => {
      const index = sortedTakes.findIndex((entry) => entry.id === take.id)
      startTransition(() => {
        setVaultReviewIndex(index >= 0 ? index : 0)
        setReviewContext('vault')
        setReviewSlot('benchmark')
        setIsVaultOpen(false)
      })
      deferHudMediaPause()
    },
    [deferHudMediaPause, sortedTakes],
  )

  const handleOpenCompareReview = useCallback(
    (slot: ReviewSlot) => {
      setReviewContext('compare')
      setReviewSlot(slot)
      deferHudMediaPause()
    },
    [deferHudMediaPause],
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
    releaseAutoRecordSuppress(0)
    stabilizeViewportAfterMediaInteraction()
    window.setTimeout(() => {
      void refreshCameraSession()
    }, 350)
  }, [
    pausePipVideos,
    refreshCameraSession,
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
        const safeVideoUrl = await resolveTakePlaybackUrl(
          persisted.filePath,
          persisted.videoUrl,
        )

        const uploadedTake: Take = {
          ...createTake(
            takeId,
            takes.length + 1,
            safeVideoUrl,
            persisted.filePath,
            mimeType,
            mediaType,
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
              current.map((take) =>
                take.id === takeId ? { ...take, thumbnailUrl } : take,
              ),
            )
          })
          .catch(() => {
            /* PiP shows placeholder until thumbnail is ready */
          })
      })()
    },
    [pausePipVideos, takes.length],
  )

  const handleUpdateTake = useCallback((id: string, updates: TakeUpdate) => {
    setTakes((prev) =>
      prev.map((take) => (take.id === id ? { ...take, ...updates } : take)),
    )
    void updateVaultTake(id, updates)
  }, [])

  const removeTakeResources = useCallback((take: Take) => {
    void deleteCachedTakeThumbnail(take.id)
    if (take.filePath) {
      void deleteTakeFile(take.filePath)
    } else if (take.videoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(take.videoUrl)
    }
  }, [])

  const handleDeleteTakes = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return

      const idSet = new Set(ids)
      if (autoPlaybackTakeId && idSet.has(autoPlaybackTakeId)) {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(0)
      }

      if (ids.some((id) => id === benchmarkId || id === challengerId)) {
        pausePipVideos()
      }

      const removed = takes.filter((take) => idSet.has(take.id))

      setTakes((prev) => prev.filter((take) => !idSet.has(take.id)))
      void Promise.all(ids.map((id) => deleteVaultTake(id)))
      setBenchmarkId((current) => (current && idSet.has(current) ? null : current))
      setChallengerId((current) => (current && idSet.has(current) ? null : current))

      for (const take of removed) {
        removeTakeResources(take)
      }
    },
    [
      autoPlaybackTakeId,
      benchmarkId,
      challengerId,
      pausePipVideos,
      releaseAutoRecordSuppress,
      removeTakeResources,
      stopAutoPlaybackAudio,
      takes,
    ],
  )

  const handleDragDeleteTake = useCallback(
    (id: string) => {
      pausePipVideos()
      handleDeleteTakes([id])
    },
    [handleDeleteTakes, pausePipVideos],
  )

  const handleDeleteTake = useCallback(
    (id: string) => {
      handleDeleteTakes([id])
    },
    [handleDeleteTakes],
  )

  const handleClearAllTakes = useCallback(() => {
    const projectId = activeProjectIdRef.current
    if (!projectId || takes.length === 0) return

    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)

    const takesToRemove = takes
    setTakes([])
    setBenchmarkId(null)
    setChallengerId(null)

    void (async () => {
      await Promise.all([
        deleteTakesByProject(projectId),
        ...takesToRemove.map(async (take) => {
          await deleteCachedTakeThumbnail(take.id)
          if (take.filePath) {
            await deleteTakeFile(take.filePath)
          } else if (take.videoUrl.startsWith('blob:')) {
            URL.revokeObjectURL(take.videoUrl)
          }
        }),
      ])
    })()
  }, [releaseAutoRecordSuppress, stopAutoPlaybackAudio, takes])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )

  const handleUnpinBenchmark = useCallback(() => {
    teardownPipMedia(benchmarkPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setBenchmarkPipPlaying(false)
    setBenchmarkId(null)
  }, [teardownPipMedia])

  const handleUnpinChallenger = useCallback(() => {
    if (challengerId && autoPlaybackTakeId === challengerId) {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
    }
    teardownPipMedia(challengerPipVideoRef.current)
    void releaseTakePlaybackAudio()
    stabilizeViewportAfterMediaInteraction()
    setChallengerPipPlaying(false)
    setChallengerId(null)
  }, [
    autoPlaybackTakeId,
    challengerId,
    releaseAutoRecordSuppress,
    stopAutoPlaybackAudio,
    teardownPipMedia,
  ])
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
      takeHasPlaybackMedia(benchmarkTake)
        ? () => handleOpenCompareReview('benchmark')
        : undefined,
    [benchmarkTake, handleOpenCompareReview],
  )

  const handleExpandChallenger = useMemo(
    () =>
      takeHasPlaybackMedia(challengerTake)
        ? () => handleOpenCompareReview('challenger')
        : undefined,
    [challengerTake, handleOpenCompareReview],
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

  const handleChallengerAutoPlayComplete = useCallback(() => {
    finishAutoPlayback()
  }, [finishAutoPlayback])

  const handleChallengerPlaybackChange = useCallback(
    (playing: boolean) => {
      setChallengerPipPlaying(playing)
      if (playing && autoPlaybackTakeId) {
        pendingAutoPlaybackRef.current = false
        setHandsFreePlaybackPending(false)
        setAutoPlaybackPlaying(true)
      }
    },
    [autoPlaybackTakeId],
  )

  const handleSubmitYoutube = useCallback((embedUrl: string) => {
    prepareNewYoutubeReference()
    setYoutubeUrl(embedUrl)
  }, [])

  const handleClearYoutube = useCallback(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
    prepareNewYoutubeReference()
    setYoutubeUrl(null)
    setYoutubeHostEl(null)
    stabilizeViewportAfterMediaInteraction()
  }, [])

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((current) => {
      const next = !current
      if (next && youtubeUrlRef.current) {
        window.requestAnimationFrame(() => {
          startYoutubeProxyPlayback(youtubeIframeRef.current, 1)
        })
      }
      if (!next) {
        window.requestAnimationFrame(() => {
          void refreshCameraSession()
        })
      }
      return next
    })
  }, [refreshCameraSession])

  const handleExitSplitView = useCallback(() => {
    setIsSplitView(false)
    window.requestAnimationFrame(() => {
      void refreshCameraSession()
    })
  }, [refreshCameraSession])

  const hasBestTakeReference =
    Boolean(youtubeUrl) || takeHasPlaybackMedia(benchmarkTake)

  const showPinCurrentAsBest = Boolean(
    hasBestTakeReference &&
      takeHasPlaybackMedia(challengerTake) &&
      challengerId &&
      challengerId !== benchmarkId,
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
    }),
    [isRecording, isReviewOpen, isSplitView, isVaultOpen, settings.autoSoundRecording],
  )

  useEffect(() => {
    if (!showOnboardingTutorial) return
    const step = INTERACTIVE_TUTORIAL_STEPS[tutorialStepIndex]
    if (step?.id === 'auto-record' && recordingMode !== 'audio' && !isRecording) {
      changeRecordingMode('audio')
    }
  }, [
    changeRecordingMode,
    isRecording,
    recordingMode,
    showOnboardingTutorial,
    tutorialStepIndex,
  ])

  return (
    <TutorialProvider
      active={showOnboardingTutorial}
      stepIndex={tutorialStepIndex}
      onStepIndexChange={setTutorialStepIndex}
      onComplete={handleTutorialComplete}
      signals={tutorialSignals}
    >
    <ActionSheetProvider>
    <MetronomeProvider
      isTakePlaying={takePlaybackActive}
      muteDuringPlayback={settings.muteMetronomeDuringPlayback}
    >
    <div ref={appShellRef} className="app-shell">
      <audio
        ref={autoPlaybackAudioRef}
        className="sr-only"
        preload="none"
        playsInline
        {...({ 'webkit-playsinline': 'true' } as React.AudioHTMLAttributes<HTMLAudioElement>)}
      />

      {youtubeUrl && (
        <YoutubeBenchmarkPlayer
          embedUrl={youtubeUrl}
          hostEl={youtubeHostEl}
          iframeRef={youtubeIframeRef}
        />
      )}

      {isAudioPracticeMetronomeTab && (
        <div className="audio-practice-metronome-scrim pointer-events-none" aria-hidden />
      )}

      <LiveCameraBackground
        previewRef={previewRef}
        streamRef={streamRef}
        streamGeneration={streamGeneration}
        recordingMode={recordingMode}
        isRecording={isRecording}
        resumeNonce={cameraResumeNonce}
        modePreparing={!ready && !isRecording && !cameraNeedsPermission}
        pitchStageActive={
          isAudioPracticeTunerTab ||
          (showPitch && mainVideoPitchSource !== null)
        }
        metronomeStageActive={metronomeStageActive}
        audioPracticeOverlayActive={isAudioPracticeToolTab}
        visuallySuppressed={isSplitView}
      />

      {cameraNeedsPermission && (
        <CameraPermissionPrompt
          recordingMode={recordingMode}
          requesting={cameraPermissionRequestInFlight}
          onRequestPermission={requestCameraAccess}
        />
      )}

      <div
        className={`pitch-display-layer${pitchHudSuspended ? ' floating-widget-layer--inert' : ''}`}
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
        className={`metronome-display-layer${metronomeWidgetInteractive ? '' : ' floating-widget-layer--inert'}`}
        aria-hidden={!metronomeWidgetInteractive}
      >
        {showMetronomeWidget && (
          <Suspense fallback={null}>
            <AnimatePresence>
              {recordingMode === 'video' && (
                <DraggableMetronomeWidget
                  key="main-metronome"
                  boundaryRef={appShellRef}
                  positionId="main-metronome"
                  isTakePlaying={takePlaybackActive}
                  muteDuringPlayback={settings.muteMetronomeDuringPlayback}
                  onClose={handleCloseMetronome}
                />
              )}
            </AnimatePresence>
          </Suspense>
        )}
      </div>

      <div id={PHYSICAL_UI_ROOT_ID} className="app-ui-rotator">
      {showMainPitchWidget && mainVideoPitchSource && (
        <Suspense fallback={null}>
        <AnimatePresence>
          {showPitch && mainVideoPitchSource && (
            <div className={pitchHudSuspended ? 'floating-widget-layer--inert fixed inset-0 z-[5]' : 'contents'}>
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
        className={`app-ui-overlay ${pitchAudioHudLock ? 'app-ui-overlay--pitch-hud-lock' : ''} ${metronomeAudioHudLock ? 'app-ui-overlay--metronome-hud-lock' : ''} ${quickSettingsOpen ? 'app-ui-overlay--quick-settings' : ''} ${showOnboardingTutorial ? 'app-ui-overlay--tutorial' : ''} ${isVaultOpen || isSettingsOpen ? 'app-ui-overlay--sheet-open' : ''} ${isAudioPracticeMetronomeTab ? 'app-ui-overlay--audio-practice-metronome' : ''} ${isAudioPracticeTunerTab ? 'app-ui-overlay--audio-practice-tuner' : ''} ${isAudioPracticeComboTab ? 'app-ui-overlay--audio-practice-combo' : ''}`}
        aria-hidden={hudModalState === 'review'}
        animate={{
          opacity: hudModalState === 'review' ? 0 : hudModalState === 'sheet' ? 0.78 : 1,
          scale: hudModalState === 'review' ? 0.94 : hudModalState === 'sheet' ? 0.985 : 1,
        }}
        transition={iosHudDim}
        style={{
          ...motionGpuLayer,
          pointerEvents:
            pitchAudioHudLock || metronomeAudioHudLock || showOnboardingTutorial
              ? 'auto'
              : hudModalState !== 'idle' && !showOnboardingTutorial
                ? 'none'
                : undefined,
        }}
      >
        <HudHeader
          sessionName={activeProject?.name ?? 'BestTake'}
          onOpenVault={handleOpenVault}
          className={quickSettingsOpen ? 'hud-header-hidden' : undefined}
        />

        {recordingMode === 'audio' && !quickSettingsOpen && (
          <AudioPracticeTopTabs
            activeTab={audioPracticeTab}
            onTabChange={setAudioPracticeTab}
          />
        )}

        {recordingMode === 'audio' && audioPracticeTab === 'metronome' && !quickSettingsOpen && (
          <div
            key="audio-practice-metronome-layer"
            className="audio-practice-metronome-layer pointer-events-auto flex min-h-0 flex-1 flex-col"
          >
            <AudioMetronomeTab key="audio-metronome-tab" />
          </div>
        )}

        {recordingMode === 'audio' && isAudioPracticeTunerTab && !quickSettingsOpen && (
          <div
            key="audio-practice-tuner-layer"
            className="audio-practice-tuner-layer pointer-events-auto flex min-h-0 flex-1 flex-col"
          >
            <AudioTunerTab
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              ready={ready}
              isRecording={isRecording}
              tunerInstrument={settings.tunerInstrument}
              liveMicTunerEnabled={settings.liveMicTunerEnabled}
            />
          </div>
        )}

        {!quickSettingsOpen && settings.showTakeCards && isSplitView && isAudioPracticeMainTab && (
          <div
            className="split-compare-host pointer-events-auto min-h-0 flex-1 px-2 pb-2"
            style={pipScaleStyle}
          >
            <SplitCompareLayout
              splitRatio={splitRatio}
              onSplitRatioChange={setSplitRatio}
              benchmarkTake={benchmarkTake}
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
              pitchStageActive={
                showPitch && (mainAudioPitchSource !== null || mainVideoPitchSource !== null)
              }
              metronomeStageActive={metronomeStageActive}
              onUnpinBenchmark={handleUnpinBenchmark}
              onUnpinChallenger={handleUnpinChallenger}
              onClearYoutube={handleClearYoutube}
              onSubmitYoutube={handleSubmitYoutube}
              onUploadBenchmark={handleUploadBenchmark}
              onToggleSplitView={handleExitSplitView}
              onExpandBenchmark={handleExpandBenchmark}
              onExpandChallenger={handleExpandChallenger}
              onBenchmarkPlaybackChange={setBenchmarkPipPlaying}
              onChallengerPlaybackChange={handleChallengerPlaybackChange}
              challengerAutoPlayRequestId={challengerHandsFreeAutoPlayRequestId}
              onChallengerAutoPlayComplete={handleChallengerAutoPlayComplete}
              showPinCurrentAsBest={showPinCurrentAsBest}
              onPinCurrentAsBest={handlePinCurrentAsBest}
              onYoutubeHostChange={handleYoutubeHostChange}
              youtubeIframeRef={youtubeIframeRef}
              deleteDropRef={recordDeleteDropRef}
              onPinBenchmark={handlePinBenchmark}
              onDeleteTake={handleDragDeleteTake}
              onDragStateChange={handlePipDragStateChange}
              hapticFeedback={settings.hapticFeedback}
            />
          </div>
        )}

        {recordingMode === 'audio' && isAudioPracticeComboTab && !quickSettingsOpen && (
          <div
            className={`audio-practice-combo-layer flex min-h-0 flex-1 flex-col ${isVaultOpen || isSettingsOpen || isReviewOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}
          >
            <AudioComboTab
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              ready={ready}
              isRecording={isRecording}
              elapsed={elapsed}
              tunerInstrument={settings.tunerInstrument}
              liveMicTunerEnabled={settings.liveMicTunerEnabled}
              benchmarkTake={benchmarkTake}
              challengerTake={challengerTake}
              benchmarkId={benchmarkId}
              challengerId={challengerId}
              interactionSuspended={isVaultOpen || isSettingsOpen || isReviewOpen}
              onPinCurrentAsBest={handlePinCurrentAsBest}
              onDiscardCurrentTake={handleDragDeleteTake}
              onOpenVault={handleOpenVault}
            />
          </div>
        )}

        {!isAudioPracticeMetronomeTab && (
        <div className="app-hud-bottom pointer-events-none flex flex-col">
          {!quickSettingsOpen && settings.showTakeCards && !isSplitView && isAudioPracticeMainTab && (
              <motion.div
                key="pip-row"
                className="app-pip-row-wrap pointer-events-auto w-full"
                data-tutorial="review-mode-button"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={iosHudDim}
                style={{ ...motionGpuLayer, ...pipScaleStyle }}
              >
                <PipCompareRow
                  benchmarkTake={benchmarkTake}
                  challengerTake={challengerTake}
                  youtubeEmbedUrl={youtubeUrl}
                  suspendPipPlayback={suspendPipPlayback}
                  benchmarkPipVideoRef={benchmarkPipVideoRef}
                  challengerPipVideoRef={challengerPipVideoRef}
                  deleteDropRef={recordDeleteDropRef}
                  onPinBenchmark={handlePinBenchmark}
                  onDeleteTake={handleDragDeleteTake}
                  onUnpinBenchmark={handleUnpinBenchmark}
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
                  challengerAutoPlayRequestId={challengerHandsFreeAutoPlayRequestId}
                  onChallengerAutoPlayComplete={handleChallengerAutoPlayComplete}
                  showPinCurrentAsBest={showPinCurrentAsBest}
                  onPinCurrentAsBest={handlePinCurrentAsBest}
                  onYoutubeHostChange={handleYoutubeHostChange}
                  youtubeIframeRef={youtubeIframeRef}
                  hapticFeedback={settings.hapticFeedback}
                />
              </motion.div>
          )}

          <ControlDeck
            isRecording={isRecording}
            elapsed={elapsed}
            ready={ready}
            recordingMode={recordingMode}
            onRecordingModeChange={handleRecordingModeChange}
            onToggleRecord={toggleRecording}
            onOpenVault={handleOpenVault}
            onOpenSettings={handleOpenSettings}
            takeCount={takes.length}
            autoSoundListening={autoSoundListening}
            handsFreeRecording={handsFreeRecording}
            handsFreePlaybackPending={handsFreePlaybackPending || autoPlaybackPlaying}
            autoSoundRecording={settings.autoSoundRecording}
            onAutoSoundRecordingChange={(enabled) =>
              updateSettings({ autoSoundRecording: enabled })
            }
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
            settingsBranchDisabled={isSettingsOpen || isVaultOpen || isReviewOpen}
            onBranchOpenChange={handleQuickSettingsOpenChange}
            hapticFeedback={settings.hapticFeedback}
          />
        </div>
        )}
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
          benchmarkSrc={benchmarkTake?.videoUrl ?? null}
          challengerSrc={challengerTake?.videoUrl ?? null}
          benchmarkFilePath={benchmarkTake?.filePath}
          challengerFilePath={challengerTake?.filePath}
          benchmarkName={benchmarkTake?.name}
          challengerName={challengerTake?.name}
          benchmarkMimeType={
            benchmarkTake?.videoMimeType ??
            (benchmarkTake?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
          }
          challengerMimeType={
            challengerTake?.videoMimeType ??
            (challengerTake?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
          }
          benchmarkMediaType={benchmarkTake?.mediaType}
          challengerMediaType={challengerTake?.mediaType}
          benchmarkMirror={benchmarkTake?.mirrorPlayback !== false}
          challengerMirror={challengerTake?.mirrorPlayback !== false}
          benchmarkRecordingOrientation={benchmarkTake?.recordingOrientation}
          challengerRecordingOrientation={challengerTake?.recordingOrientation}
          liveMicTunerEnabled={settings.liveMicTunerEnabled}
          tunerInstrument={settings.tunerInstrument}
          micStreamRef={streamRef}
          isOpen
          onClose={handleCloseReview}
          onSlotChange={handleReviewSlotChange}
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
        challengerId={challengerId}
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
        onEnterComplete={handleVaultEnterComplete}
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
        recordingMode={recordingMode}
      />
      </Suspense>

      <Suspense fallback={null}>
        <AnimatePresence>
          {showOnboardingTutorial && (
            <OnboardingTutorial
              key="onboarding-tutorial"
              onClose={handleCloseOnboardingTutorial}
              hapticFeedback={settings.hapticFeedback}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </div>
    </div>
    </MetronomeProvider>
    </ActionSheetProvider>
    </TutorialProvider>
  )
}
