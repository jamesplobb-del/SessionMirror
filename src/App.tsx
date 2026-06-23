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
import HudHeader from './components/HudHeader'
import PipCompareRow from './components/PipCompareRow'
import SplitCompareLayout from './components/SplitCompareLayout'
import YoutubeBenchmarkPlayer from './components/YoutubeBenchmarkPlayer'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import { useCameraSession } from './hooks/useCameraSession'
import { usePhysicalOrientation } from './hooks/usePhysicalOrientation'
import { useAppSettings } from './hooks/useAppSettings'
import { useAutoSoundRecording } from './hooks/useAutoSoundRecording'
import { pausePitchGraphsForMedia } from './hooks/useLivePitchTracker'
import {
  registerAutoPlaybackHold,
  registerTakePlaybackMicHandlers,
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
  playYoutubeProxy,
  setYoutubeProxyVolumeFromUi,
} from './utils/playalong/youtubeBridge'
import {
  deleteTakeFile,
  NATIVE_AUDIO_MIME,
  NATIVE_VIDEO_MIME,
  persistUploadedVideo,
  isConvertedPlaybackUrl,
  readCachedPlaybackSrc,
  resolveTakePlaybackUrl,
  type RecordingCompletePayload,
} from './utils/takeStorage'
import { resetVideoPlayback } from './utils/videoPlayback'
import type { ReviewContext, ReviewSlot, RecordingMode, SortMode, Take, TakeUpdate } from './types'
import { AUDIO_TAKE_THUMBNAIL, inferMediaTypeFromMime } from './utils/mediaType'
import { scheduleViewportSync } from './utils/viewportSync'
import { lockPortraitOrientation, syncAppOrientationLock } from './utils/lockPortraitOrientation'
import { PHYSICAL_UI_ROOT_ID } from './utils/physicalUiPortal'
import { scheduleAfterPaint, scheduleIdle } from './utils/scheduleDeferred'
import { iosHudDim, motionGpuLayer } from './utils/motionPresets'
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
import { setTakePlaybackEnhancerState } from './utils/takePlaybackSpeaker'
import {
  registerAudioSessionLifecycle,
  restoreRecordingRouteAfterVault,
  setAudioSessionStereoBlocked,
} from './utils/audioSessionRoute'
import { useMediaAudioSessionRouting } from './hooks/useMediaAudioSessionRouting'
import { pickHudQuickSettings } from './utils/hudQuickSettings'
import { initAppFilesystem } from './utils/filesystemInit'
import { bootstrapViewport } from './utils/viewportSync'
import { resumePlaybackAudioContext } from './utils/playbackAudioContext'
import { loadAppSettingsForSessionStart } from './utils/appSettings'
import AppBootGate from './components/ui/AppBootGate'

const AUTO_PLAYBACK_POST_COOLDOWN_MS = 2800
const AUTO_PLAYBACK_NATIVE_PRIME_MS = 150

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

        setBootError(
          'BestTake could not open its vault database. Restart the app or reinstall if this continues.',
        )
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

  const { settings, updateSettings, resetSettings } = useAppSettings()
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
  const mainAudioPitchSourceCacheRef = useRef<{
    signature: string
    value: MainAudioPitchSource | null
  }>({ signature: '', value: null })

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
    void releaseTakePlaybackAudio().finally(() => {
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
        if (Capacitor.isNativePlatform()) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, AUTO_PLAYBACK_NATIVE_PRIME_MS),
          )
        }

        const ready = await waitForMediaReadyWithRetry(audio)
        if (autoPlaybackGenerationRef.current !== playbackGeneration) return
        if (!ready || queuedAutoPlayRef.current?.takeId !== takeId) {
          finishAutoPlayback()
          return
        }

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

  const handleYoutubeHostChange = useCallback((el: HTMLDivElement | null) => {
    setYoutubeHostEl(el)
  }, [])

  const pauseYoutubeReference = useCallback(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
  }, [])

  const resumeYoutubeReference = useCallback(() => {
    if (!youtubeUrlRef.current) return
    playYoutubeProxy(youtubeIframeRef.current)
    setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, 1)
  }, [])

  const {
    previewRef,
    streamRef,
    streamGeneration,
    error: cameraError,
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
    refreshCameraSession,
    suspendCameraForBackground,
    suspendMicForPlayback,
    resumeMicAfterPlayback,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
    secondaryPreviewRef: splitPreviewRef,
    onBeforeForegroundRestart: pauseYoutubeReference,
    onAfterForegroundRestart: resumeYoutubeReference,
  })

  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

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
  }, [isSplitView, recordingMode, refreshCameraSession, youtubeUrl])

  recordingModeRef.current = recordingMode

  const autoPlaybackPlayingRef = useRef(autoPlaybackPlaying)
  autoPlaybackPlayingRef.current = autoPlaybackPlaying

  useEffect(() => {
    registerTakePlaybackMicHandlers({
      suspendMic: suspendMicForPlayback,
      resumeMic: resumeMicAfterPlayback,
    })
    registerAutoPlaybackHold(
      () =>
        pendingAutoPlaybackRef.current ||
        autoPlaybackPlayingRef.current ||
        handsFreePlaybackPending,
    )
  }, [handsFreePlaybackPending, resumeMicAfterPlayback, suspendMicForPlayback])

  useEffect(() => {
    if (recordingMode === 'audio') return

    pendingAutoPlaybackRef.current = false
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
  }, [recordingMode, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

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
      const timer = window.setTimeout(() => {
        void restoreRecordingRouteAfterVault()
      }, 350)
      wasVaultOpenRef.current = isVaultOpen
      return () => window.clearTimeout(timer)
    }
    wasVaultOpenRef.current = isVaultOpen
  }, [isVaultOpen])

  const wasSettingsOpenRef = useRef(false)
  useEffect(() => {
    if (wasSettingsOpenRef.current && !isSettingsOpen) {
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
      const timer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 350)
      wasReviewOpenRef.current = isReviewOpen
      return () => window.clearTimeout(timer)
    }
    wasReviewOpenRef.current = isReviewOpen
  }, [isReviewOpen, refreshCameraSession])

  useEffect(() => {
    if (!isSplitView || recordingMode !== 'video' || isRecording) return
    if (challengerId !== null) return

    const timer = window.setTimeout(() => {
      void refreshCameraSession()
    }, 150)
    return () => window.clearTimeout(timer)
  }, [challengerId, isRecording, isSplitView, recordingMode, refreshCameraSession])

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
      }
      changeRecordingMode(mode)
    },
    [changeRecordingMode],
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
      startTransition(() => {
        updateSettings({ showMetronome: show })
      })
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

  const autoPlaybackTake = useMemo(
    () =>
      autoPlaybackTakeId
        ? takes.find((take) => take.id === autoPlaybackTakeId) ?? null
        : null,
    [autoPlaybackTakeId, takes],
  )

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

  const mainAudioPitchSource = useMemo(() => {
    let next: MainAudioPitchSource | null = null

    if (pitchTrackerActive && recordingMode === 'audio') {
      if (isRecording && ready) {
          next = {
            mediaRef: liveMicPlaceholderRef,
            take: null,
            isPlaying: true,
            mediaKey: 'main-recording-audio',
            liveMicOnly: true,
          }
        } else if (
          autoPlaybackPlaying &&
          autoPlaybackTake &&
          autoPlaybackAudioRef.current
        ) {
          next = {
            mediaRef: autoPlaybackAudioRef,
            take: autoPlaybackTake,
            isPlaying: true,
            mediaKey: `main-auto-${autoPlaybackTake.id}`,
            liveMicOnly: false,
          }
        } else if (
          autoPlaybackTakeId &&
          autoPlaybackTake &&
          challengerTake?.id === autoPlaybackTakeId &&
          (challengerPipPlaying || autoPlaybackPlaying)
        ) {
          next = {
            mediaRef: challengerPipVideoRef,
            take: autoPlaybackTake,
            isPlaying: challengerPipPlaying || autoPlaybackPlaying,
            mediaKey: `main-auto-pip-${autoPlaybackTake.id}`,
            liveMicOnly: false,
          }
        } else if (
          challengerTake?.mediaType === 'audio' &&
          challengerTake.videoUrl &&
          challengerPipPlaying
        ) {
          next = {
            mediaRef: challengerPipVideoRef,
            take: challengerTake,
            isPlaying: challengerPipPlaying,
            mediaKey: `main-pip-ch-${challengerTake.id}-${challengerTake.filePath}`,
            liveMicOnly: false,
          }
        } else if (
          benchmarkTake?.mediaType === 'audio' &&
          benchmarkTake.videoUrl &&
          benchmarkPipPlaying
        ) {
          next = {
            mediaRef: benchmarkPipVideoRef,
            take: benchmarkTake,
            isPlaying: benchmarkPipPlaying,
            mediaKey: `main-pip-bm-${benchmarkTake.id}-${benchmarkTake.filePath}`,
            liveMicOnly: false,
          }
        } else if (ready) {
          next = {
            mediaRef: liveMicPlaceholderRef,
            take: null,
            isPlaying: false,
            mediaKey: 'main-live-mic-audio',
            liveMicOnly: true,
          }
        }
    }

    const signature = next
      ? `${next.mediaKey}|${next.isPlaying}|${next.liveMicOnly}|${next.take?.id ?? ''}`
      : 'null'

    if (signature === mainAudioPitchSourceCacheRef.current.signature) {
      const cached = mainAudioPitchSourceCacheRef.current.value
      if (cached && next) {
        cached.isPlaying = next.isPlaying
        cached.take = next.take
      }
      return cached
    }

    mainAudioPitchSourceCacheRef.current = { signature, value: next }
    return next
  }, [
    pitchTrackerActive,
    recordingMode,
    autoPlaybackTakeId,
    autoPlaybackTake,
    autoPlaybackPlaying,
    challengerTake,
    challengerPipPlaying,
    benchmarkTake,
    benchmarkPipPlaying,
    ready,
    isRecording,
  ])

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

  const metronomeHudSuspended =
    isVaultOpen ||
    isSettingsOpen ||
    isReviewOpen ||
    (!ready && !isRecording)

  const metronomeWidgetInteractive = showMetronomeWidget && !metronomeHudSuspended

  const takePlaybackActive =
    autoPlaybackPlaying || benchmarkPipPlaying || challengerPipPlaying

  useEffect(() => {
    registerAudioSessionLifecycle({
      onBeforeStereo: () => {
        if (!isRecordingRef.current) {
          suspendCameraForBackground()
        }
      },
      onAfterRecordingRouteRestore: () => {
        void refreshCameraSession()
      },
    })
  }, [refreshCameraSession, suspendCameraForBackground])

  useEffect(() => {
    setAudioSessionStereoBlocked(isRecording)
  }, [isRecording])

  useMediaAudioSessionRouting(autoPlaybackAudioRef, true, 'auto-playback')

  useEffect(() => {
    setTakePlaybackEnhancerState(
      settings.audioEnhancerEnabled,
      settings.audioEnhancerEnabled ? settings.audioEnhancerSettings : undefined,
    )
  }, [settings.audioEnhancerEnabled, settings.audioEnhancerSettings])

  const pitchAudioHudLock =
    showPitch &&
    recordingMode === 'audio' &&
    mainAudioPitchSource !== null &&
    hudModalState === 'idle' &&
    !pitchHudSuspended

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
    handlePitchTrackerSettingChange(false)
  }, [handlePitchTrackerSettingChange])

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
      setBenchmarkId(id)
      if (activeProjectIdRef.current) {
        void setProjectBestTake(activeProjectIdRef.current, id)
      }
      setChallengerId((current) => {
        if (current && current !== id) return current
        const other = takes.find((t) => t.id !== id)
        return other?.id ?? null
      })
    },
    [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio, takes],
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
    window.setTimeout(() => {
      void refreshCameraSession()
    }, 350)
  }, [
    pausePipVideos,
    refreshCameraSession,
    releaseAutoRecordSuppress,
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
    setYoutubeUrl(embedUrl)
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        playYoutubeProxy(youtubeIframeRef.current)
        setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, 1)
      }, 400)
    })
  }, [])

  const handleClearYoutube = useCallback(() => {
    pauseYoutubeProxy(youtubeIframeRef.current)
    setYoutubeUrl(null)
    setYoutubeHostEl(null)
  }, [])

  const handleToggleSplitView = useCallback(() => {
    setIsSplitView((current) => {
      const next = !current
      if (next && youtubeUrlRef.current) {
        window.requestAnimationFrame(() => {
          playYoutubeProxy(youtubeIframeRef.current)
          setYoutubeProxyVolumeFromUi(youtubeIframeRef.current, 1)
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
    setYoutubeUrl(null)
    handlePinBenchmark(challengerId)
  }, [challengerId, handlePinBenchmark])

  const pipScaleStyle = {
    '--pip-scale': settings.takeCardScale / 100,
  } as React.CSSProperties

  return (
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

      <LiveCameraBackground
        previewRef={previewRef}
        streamRef={streamRef}
        streamGeneration={streamGeneration}
        error={cameraError}
        recordingMode={recordingMode}
        isRecording={isRecording}
        modePreparing={!ready && !isRecording}
        pitchStageActive={
          showPitch && (mainAudioPitchSource !== null || mainVideoPitchSource !== null)
        }
        visuallySuppressed={isSplitView}
      />

      <div
        className={`pitch-display-layer${pitchHudSuspended ? ' floating-widget-layer--inert' : ''}`}
        aria-hidden={!showPitch || !mainAudioPitchSource || pitchHudSuspended}
      >
        {showMainPitchWidget && (
          <Suspense fallback={null}>
            <AnimatePresence>
              {showPitch && mainAudioPitchSource && (
                <DraggablePitchWidget
                  boundaryRef={appShellRef}
                  mediaRef={mainAudioPitchSource.mediaRef}
                  enabled={settings.pitchTrackerEnabled && !pitchHudSuspended}
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
              <DraggableMetronomeWidget
                key="main-metronome"
                boundaryRef={appShellRef}
                positionId="main-metronome"
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
            <div className={pitchHudSuspended ? 'floating-widget-layer--inert fixed inset-0 z-[5]' : 'contents'}>
            <DraggablePitchWidget
              boundaryRef={appShellRef}
              mediaRef={mainVideoPitchSource.mediaRef}
              enabled={settings.pitchTrackerEnabled && !pitchHudSuspended}
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
        className={`app-ui-overlay ${pitchAudioHudLock ? 'app-ui-overlay--pitch-hud-lock' : ''} ${quickSettingsOpen ? 'app-ui-overlay--quick-settings' : ''}`}
        aria-hidden={hudModalState === 'review'}
        animate={{
          opacity: hudModalState === 'review' ? 0 : hudModalState === 'sheet' ? 0.78 : 1,
          scale: hudModalState === 'review' ? 0.94 : hudModalState === 'sheet' ? 0.985 : 1,
        }}
        transition={iosHudDim}
        style={{
          ...motionGpuLayer,
          ...pipScaleStyle,
          pointerEvents: pitchAudioHudLock
            ? 'auto'
            : hudModalState !== 'idle'
              ? 'none'
              : undefined,
        }}
      >
        <HudHeader
          sessionName={activeProject?.name ?? 'BestTake'}
          onOpenVault={handleOpenVault}
          splitViewActive={isSplitView}
          onExitSplitView={handleExitSplitView}
          className={quickSettingsOpen ? 'hud-header-hidden' : undefined}
        />

        {!quickSettingsOpen && settings.showTakeCards && isSplitView && (
          <div className="split-compare-host pointer-events-auto min-h-0 flex-1 px-2 pb-2">
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
              cameraError={cameraError}
              recordingMode={recordingMode}
              isRecording={isRecording}
              cameraReady={ready}
              pitchStageActive={
                showPitch && (mainAudioPitchSource !== null || mainVideoPitchSource !== null)
              }
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
              challengerAutoPlayRequestId={autoPlaybackTakeId}
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

        <div className="app-hud-bottom pointer-events-none flex flex-col">
          {!quickSettingsOpen && settings.showTakeCards && !isSplitView && (
              <motion.div
                key="pip-row"
                className="app-pip-row-wrap pointer-events-auto w-full"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={iosHudDim}
                style={motionGpuLayer}
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
                  challengerAutoPlayRequestId={autoPlaybackTakeId}
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
            pitchToggleVisible
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
        recordingMode={recordingMode}
      />
      </Suspense>
      </div>
    </div>
  )
}
