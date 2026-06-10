import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LiveCameraBackground from './components/LiveCameraBackground'
import HudHeader from './components/HudHeader'
import PipCompareRow from './components/PipCompareRow'
import type { PipDragUiState } from './hooks/useDragToPin'
import ControlDeck from './components/ControlDeck'
import TakeVaultDrawer from './components/TakeVaultDrawer'
import SettingsDrawer from './components/SettingsDrawer'
import { useCameraSession } from './hooks/useCameraSession'
import { useAppSettings } from './hooks/useAppSettings'
import { useAutoSoundRecording } from './hooks/useAutoSoundRecording'
import { pausePitchGraphsForMedia, PITCH_GRAPH_RELEASED_EVENT } from './hooks/useLivePitchTracker'
import {
  generateThumbnailFromBlob,
  captureAndPersistTakeThumbnail,
  hydrateTakeThumbnailsInBackground,
} from './utils/generateThumbnail'
import { createTake, sortTakes } from './utils/takes'
import {
  deleteTakeFile,
  NATIVE_AUDIO_MIME,
  NATIVE_VIDEO_MIME,
  persistUploadedVideo,
  resolveTakePlaybackUrl,
  type RecordingCompletePayload,
} from './utils/takeStorage'
import { resetVideoPlayback } from './utils/videoPlayback'
import ReviewModeOverlay from './components/ReviewModeOverlay'
import DraggablePitchWidget from './components/DraggablePitchWidget'
import type { ReviewContext, ReviewSlot, RecordingMode, SortMode, Take, TakeUpdate } from './types'
import { AUDIO_TAKE_THUMBNAIL, inferMediaTypeFromMime, isAudioTake } from './utils/mediaType'
import { applyViewportCssVars, scheduleViewportSync } from './utils/viewportSync'
import { deleteCachedTakeThumbnail, persistTakeThumbnail } from './utils/takeThumbnailCache'
import {
  createProject,
  deleteVaultTake,
  deleteTakesByProject,
  findBestTakeId,
  getTakesByProject,
  listProjects,
  saveTake,
  setProjectBestTake,
  uiTakesFromVaultRows,
  updateVaultTake,
  type Project,
} from './db'

export default function App() {
  const [takes, setTakes] = useState<Take[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null)
  const [challengerId, setChallengerId] = useState<string | null>(null)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [reviewContext, setReviewContext] = useState<ReviewContext>('compare')
  const [vaultReviewIndex, setVaultReviewIndex] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)
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
  const [autoPlaybackAudioKey, setAutoPlaybackAudioKey] = useState(0)

  const { settings, updateSettings, resetSettings } = useAppSettings()
  const showTakeCardsRef = useRef(settings.showTakeCards)
  showTakeCardsRef.current = settings.showTakeCards
  const pendingAutoPlaybackRef = useRef(false)
  const autoPlaybackAudioRef = useRef<HTMLAudioElement | null>(null)
  const liveMicPlaceholderRef = useRef<HTMLMediaElement | null>(null)
  const queuedAutoPlayRef = useRef<{ url: string; takeId: string } | null>(null)
  const recordingModeRef = useRef<RecordingMode>('video')
  const autoPlaybackReleaseTimerRef = useRef<number | null>(null)
  const playAutoTakeAudioRef = useRef<(playbackUrl: string, takeId: string) => void>(() => {})
  const recordDeleteDropRef = useRef<HTMLDivElement>(null)
  const [autoRecordStartSuppressed, setAutoRecordStartSuppressed] = useState(false)

  const benchmarkPipVideoRef = useRef<HTMLMediaElement>(null)
  const challengerPipVideoRef = useRef<HTMLMediaElement>(null)
  const appShellRef = useRef<HTMLDivElement>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId

  const isReviewOpen = reviewSlot !== null

  useLayoutEffect(() => {
    let debounceTimer: number | null = null
    let lastHeight = window.innerHeight

    return scheduleViewportSync((height) => {
      if (height === lastHeight) return
      lastHeight = height
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer)
      }
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        setWindowHeight(height)
      }, 120)
    })
  }, [])

  const pausePipVideos = useCallback(() => {
    resetVideoPlayback(benchmarkPipVideoRef.current)
    resetVideoPlayback(challengerPipVideoRef.current)
  }, [])

  const releaseAutoRecordSuppress = useCallback((delayMs = 350) => {
    if (autoPlaybackReleaseTimerRef.current !== null) {
      window.clearTimeout(autoPlaybackReleaseTimerRef.current)
      autoPlaybackReleaseTimerRef.current = null
    }

    if (delayMs <= 0) {
      setAutoRecordStartSuppressed(false)
      return
    }

    autoPlaybackReleaseTimerRef.current = window.setTimeout(() => {
      autoPlaybackReleaseTimerRef.current = null
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

  const stopAutoPlaybackAudio = useCallback(() => {
    queuedAutoPlayRef.current = null
    pendingAutoPlaybackRef.current = false
    teardownAutoPlaybackMedia()
    setAutoPlaybackTakeId(null)
    setAutoPlaybackAudioKey((key) => key + 1)
  }, [teardownAutoPlaybackMedia])

  const playAutoTakeAudio = useCallback(
    (playbackUrl: string, takeId: string) => {
      if (recordingModeRef.current !== 'audio') {
        pendingAutoPlaybackRef.current = false
        return
      }

      teardownAutoPlaybackMedia()
      queuedAutoPlayRef.current = { url: playbackUrl, takeId }
      setAutoPlaybackTakeId(takeId)
      setAutoRecordStartSuppressed(true)
      setAutoPlaybackAudioKey((key) => key + 1)
    },
    [teardownAutoPlaybackMedia],
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
      const rows = await getTakesByProject(projectId)
      const loaded = await uiTakesFromVaultRows(rows)

      setTakes(loaded)
      setBenchmarkId(findBestTakeId(rows))
      setChallengerId((current) => {
        if (!showTakeCardsRef.current) return null
        if (current && rows.some((row) => row.id === current)) return current
        return rows.find((row) => !row.isBestTake)?.id ?? null
      })

      void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnails)
    },
    [applyTakeThumbnails],
  )

  useEffect(() => {
    void (async () => {
      const projectList = await listProjects()
      setProjects(projectList)
      const initialId = projectList[0]?.id ?? null
      setActiveProjectId(initialId)
      if (initialId) {
        await reloadProjectTakes(initialId)
      }
    })()
  }, [reloadProjectTakes])

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

    void (async () => {
      const safeVideoUrl = await resolveTakePlaybackUrl(filePath, videoUrl)
      const projectId = activeProjectIdRef.current
      let takeIndex = 1

      if (projectId && filePath) {
        const existing = await getTakesByProject(projectId)
        takeIndex = existing.length + 1
        await saveTake({
          projectId,
          filePath,
          duration: durationSeconds,
          takeId,
          mimeType,
          mediaType,
          recordingOrientation,
          name: mediaType === 'audio' ? `Audio ${takeIndex}` : `Take ${takeIndex}`,
        })
      }

      const savedTake: Take = {
        ...createTake(
          takeId,
          takeIndex,
          safeVideoUrl,
          filePath,
          mimeType,
          mediaType,
        ),
        recordingOrientation: recordingOrientation ?? 'portrait',
      }

      setTakes((prev) => {
        const index = projectId ? takeIndex : prev.length + 1
        const nextTake =
          index === takeIndex
            ? savedTake
            : {
                ...savedTake,
                name: mediaType === 'audio' ? `Audio ${index}` : `Take ${index}`,
              }
        if (showTakeCardsRef.current) {
          setChallengerId(nextTake.id)
        }
        return [...prev, nextTake]
      })

      const thumbnailTake: Take = savedTake

      if (
        mediaType === 'audio' &&
        pendingAutoPlaybackRef.current &&
        recordingModeRef.current === 'audio'
      ) {
        pendingAutoPlaybackRef.current = false
        playAutoTakeAudioRef.current(safeVideoUrl, takeId)
      }

      if (mediaType === 'audio') {
        setTakes((current) =>
          current.map((take) =>
            take.id === takeId ? { ...take, thumbnailUrl: AUDIO_TAKE_THUMBNAIL } : take,
          ),
        )
        return
      }

      const thumbnailPromise = blob
        ? generateThumbnailFromBlob(
            blob,
            thumbnailTake.mirrorPlayback !== false,
            thumbnailTake.recordingOrientation,
          ).then((dataUrl) => persistTakeThumbnail(takeId, dataUrl))
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
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
  })

  recordingModeRef.current = recordingMode

  useEffect(() => {
    if (recordingMode === 'audio') return

    pendingAutoPlaybackRef.current = false
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
  }, [recordingMode, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  useEffect(() => {
    const queued = queuedAutoPlayRef.current
    if (!queued) return

    let cancelled = false

    const startPlayback = () => {
      if (cancelled) return

      const audio = autoPlaybackAudioRef.current
      if (!audio) {
        window.requestAnimationFrame(startPlayback)
        return
      }

      const { url } = queued
      queuedAutoPlayRef.current = null

      const finish = () => {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(500)
      }

      audio.preload = 'auto'
      audio.src = url
      audio.muted = false
      audio.onended = finish
      audio.onerror = finish

      void audio.play().catch(() => {
        finish()
        releaseAutoRecordSuppress(0)
      })
    }

    startPlayback()

    return () => {
      cancelled = true
    }
  }, [
    autoPlaybackAudioKey,
    releaseAutoRecordSuppress,
    stopAutoPlaybackAudio,
  ])

  useEffect(() => {
    const audio = autoPlaybackAudioRef.current
    if (!audio) return

    const syncPlaying = () => {
      setAutoPlaybackPlaying(!audio.paused && !audio.ended)
    }

    audio.addEventListener('play', syncPlaying)
    audio.addEventListener('pause', syncPlaying)
    audio.addEventListener('ended', syncPlaying)

    const onPitchReleased = () => {
      setAutoPlaybackAudioKey((key) => key + 1)
    }
    audio.addEventListener(PITCH_GRAPH_RELEASED_EVENT, onPitchReleased)

    return () => {
      audio.removeEventListener('play', syncPlaying)
      audio.removeEventListener('pause', syncPlaying)
      audio.removeEventListener('ended', syncPlaying)
      audio.removeEventListener(PITCH_GRAPH_RELEASED_EVENT, onPitchReleased)
    }
  }, [autoPlaybackAudioKey])

  const autoMonitoringAllowed =
    !isVaultOpen && !isSettingsOpen && !isReviewOpen && ready

  useAutoSoundRecording({
    enabled: settings.autoSoundRecording,
    monitoringAllowed: autoMonitoringAllowed,
    suppressStart: autoRecordStartSuppressed,
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
    },
    onMonitorStalled: () => {
      void refreshCameraSession()
    },
  })

  useEffect(() => {
    if (!isRecording) return
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
  }, [isRecording, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

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
      setAutoRecordStartSuppressed(false)
      stopAutoPlaybackAudio()
    }, 10000)

    return () => {
      window.clearTimeout(failsafe)
    }
  }, [autoRecordStartSuppressed, stopAutoPlaybackAudio])

  const autoSoundListening =
    settings.autoSoundRecording &&
    recordingMode === 'audio' &&
    autoMonitoringAllowed &&
    !isRecording &&
    !autoRecordStartSuppressed

  const wasVaultOpenRef = useRef(false)
  const thumbnailHydrateRef = useRef(0)

  useEffect(() => {
    if (wasVaultOpenRef.current && !isVaultOpen) {
      const timer = window.setTimeout(() => {
        void refreshCameraSession()
      }, 350)
      wasVaultOpenRef.current = isVaultOpen
      return () => window.clearTimeout(timer)
    }
    wasVaultOpenRef.current = isVaultOpen
  }, [isVaultOpen, refreshCameraSession])

  const handleCloseVault = useCallback(() => {
    setIsVaultOpen(false)
  }, [])

  const handleOpenVault = useCallback(() => {
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
    pausePipVideos()
    setIsSettingsOpen(false)
    setIsVaultOpen(true)
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  useEffect(() => {
    if (!isVaultOpen) return

    const missingThumbnails = takes.filter(
      (take) => !take.thumbnailUrl && !isAudioTake(take),
    )
    if (missingThumbnails.length === 0) return

    const hydrateToken = ++thumbnailHydrateRef.current
    const timer = window.setTimeout(() => {
      void hydrateTakeThumbnailsInBackground(missingThumbnails, applyTakeThumbnails).then(
        () => {
          if (hydrateToken !== thumbnailHydrateRef.current) return
        },
      )
    }, 320)

    return () => {
      window.clearTimeout(timer)
    }
  }, [applyTakeThumbnails, isVaultOpen, takes])

  const handleOpenSettings = useCallback(() => {
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
    pausePipVideos()
    setIsVaultOpen(false)
    setIsSettingsOpen(true)
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false)
  }, [])

  useEffect(() => {
    if (!ready) return

    const syncWhenCameraReady = () => {
      setWindowHeight((prev) => {
        const next = applyViewportCssVars()
        return prev === next ? prev : next
      })
    }

    syncWhenCameraReady()
    const timer = window.setTimeout(syncWhenCameraReady, 150)

    return () => {
      window.clearTimeout(timer)
    }
  }, [ready])

  const suspendPipPlayback =
    isVaultOpen || isReviewOpen || isSettingsOpen || autoRecordStartSuppressed

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

  const mainAudioPitchSource = useMemo(() => {
    if (!settings.pitchTrackerEnabled || recordingMode !== 'audio') return null
    if (isReviewOpen || isVaultOpen || isSettingsOpen) return null

    if (autoPlaybackTakeId && autoPlaybackTake) {
      return {
        mediaRef: autoPlaybackAudioRef,
        take: autoPlaybackTake,
        isPlaying: autoPlaybackPlaying,
        mediaKey: `main-auto-${autoPlaybackTake.id}-${autoPlaybackAudioKey}`,
        liveMicOnly: false,
      }
    }

    if (challengerTake?.mediaType === 'audio' && challengerTake.videoUrl) {
      return {
        mediaRef: challengerPipVideoRef,
        take: challengerTake,
        isPlaying: challengerPipPlaying,
        mediaKey: `main-pip-ch-${challengerTake.id}-${challengerTake.filePath}`,
        liveMicOnly: false,
      }
    }

    if (benchmarkTake?.mediaType === 'audio' && benchmarkTake.videoUrl) {
      return {
        mediaRef: benchmarkPipVideoRef,
        take: benchmarkTake,
        isPlaying: benchmarkPipPlaying,
        mediaKey: `main-pip-bm-${benchmarkTake.id}-${benchmarkTake.filePath}`,
        liveMicOnly: false,
      }
    }

    if (settings.liveMicTunerEnabled && ready) {
      return {
        mediaRef: liveMicPlaceholderRef,
        take: null,
        isPlaying: false,
        mediaKey: `main-live-mic-${streamGeneration}`,
        liveMicOnly: true,
      }
    }

    return null
  }, [
    settings.pitchTrackerEnabled,
    settings.liveMicTunerEnabled,
    recordingMode,
    isReviewOpen,
    isVaultOpen,
    isSettingsOpen,
    autoPlaybackTakeId,
    autoPlaybackTake,
    autoPlaybackPlaying,
    autoPlaybackAudioKey,
    challengerTake,
    challengerPipPlaying,
    benchmarkTake,
    benchmarkPipPlaying,
    streamGeneration,
    ready,
  ])

  const mainVideoPitchSource = useMemo(() => {
    if (!settings.pitchTrackerEnabled || recordingMode !== 'video') return null
    if (isReviewOpen || isVaultOpen || isSettingsOpen) return null
    if (!ready) return null

    return {
      mediaRef: liveMicPlaceholderRef,
      isPlaying: true,
      mediaKey: `main-video-live-${streamGeneration}`,
    }
  }, [
    settings.pitchTrackerEnabled,
    recordingMode,
    isReviewOpen,
    isVaultOpen,
    isSettingsOpen,
    streamGeneration,
    ready,
  ])

  const showMainPitchWidget = mainAudioPitchSource !== null || mainVideoPitchSource !== null

  useEffect(() => {
    setShowPitch(true)
  }, [mainAudioPitchSource?.mediaKey, mainVideoPitchSource?.mediaKey, recordingMode])

  useEffect(() => {
    if (!settings.showTakeCards) {
      setChallengerId(null)
      return
    }

    setChallengerId((current) => {
      if (current && takes.some((take) => take.id === current)) return current
      const bestId = benchmarkId
      const candidate = takes.find((take) => take.id !== bestId)
      return candidate?.id ?? null
    })
  }, [settings.showTakeCards, takes, benchmarkId])

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
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      const index = sortedTakes.findIndex((entry) => entry.id === take.id)
      setVaultReviewIndex(index >= 0 ? index : 0)
      setReviewContext('vault')
      setReviewSlot('benchmark')
      setIsVaultOpen(false)
    },
    [pausePipVideos, releaseAutoRecordSuppress, sortedTakes, stopAutoPlaybackAudio],
  )

  const handleOpenCompareReview = useCallback(
    (slot: ReviewSlot) => {
      stopAutoPlaybackAudio()
      releaseAutoRecordSuppress(0)
      pausePipVideos()
      setReviewContext('compare')
      setReviewSlot(slot)
    },
    [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio],
  )

  const handleCloseReview = useCallback(() => {
    setReviewSlot(null)
    setReviewContext((context) => {
      if (context === 'vault') {
        setIsVaultOpen(true)
      }
      return 'compare'
    })
    pausePipVideos()
    stopAutoPlaybackAudio()
    releaseAutoRecordSuppress(0)
  }, [pausePipVideos, releaseAutoRecordSuppress, stopAutoPlaybackAudio])

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

      const removed = takes.filter((take) => idSet.has(take.id))

      setTakes((prev) => prev.filter((take) => !idSet.has(take.id)))
      void Promise.all(ids.map((id) => deleteVaultTake(id)))
      setBenchmarkId((current) => (current && idSet.has(current) ? null : current))
      setChallengerId((current) => (current && idSet.has(current) ? null : current))

      for (const take of removed) {
        removeTakeResources(take)
      }
    },
    [autoPlaybackTakeId, releaseAutoRecordSuppress, removeTakeResources, stopAutoPlaybackAudio, takes],
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
      await deleteTakesByProject(projectId)
      for (const take of takesToRemove) {
        removeTakeResources(take)
      }
    })()
  }, [releaseAutoRecordSuppress, removeTakeResources, stopAutoPlaybackAudio, takes])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  )

  const handleUnpinBenchmark = useCallback(() => setBenchmarkId(null), [])
  const handleUnpinChallenger = useCallback(() => setChallengerId(null), [])
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
    () => (benchmarkTake?.videoUrl ? () => handleOpenCompareReview('benchmark') : undefined),
    [benchmarkTake?.videoUrl, handleOpenCompareReview],
  )

  const handleExpandChallenger = useMemo(
    () => (challengerTake?.videoUrl ? () => handleOpenCompareReview('challenger') : undefined),
    [challengerTake?.videoUrl, handleOpenCompareReview],
  )

  useLayoutEffect(() => {
    for (const ref of [benchmarkPipVideoRef, challengerPipVideoRef]) {
      resetVideoPlayback(ref.current)
    }
  }, [
    benchmarkId,
    challengerId,
    benchmarkTake?.videoUrl,
    benchmarkTake?.filePath,
    challengerTake?.videoUrl,
    challengerTake?.filePath,
  ])

  return (
    <div ref={appShellRef} className="app-shell">
      <audio
        key={autoPlaybackAudioKey}
        ref={autoPlaybackAudioRef}
        className="sr-only"
        preload="auto"
        playsInline
      />

      <LiveCameraBackground
        previewRef={previewRef}
        streamRef={streamRef}
        streamGeneration={streamGeneration}
        error={cameraError}
        recordingMode={recordingMode}
        isRecording={isRecording}
        previewLive={ready}
        viewportKey={windowHeight}
        pitchStageActive={mainAudioPitchSource !== null && showPitch}
      />

      {showMainPitchWidget && (
        <AnimatePresence>
          {showPitch && mainAudioPitchSource && (
            <DraggablePitchWidget
              boundaryRef={appShellRef}
              defaultBottomOffset={200}
              mediaRef={mainAudioPitchSource.mediaRef}
              enabled={settings.pitchTrackerEnabled}
              isPlaying={mainAudioPitchSource.isPlaying}
              mediaKey={mainAudioPitchSource.mediaKey}
              takeName={mainAudioPitchSource.take?.name}
              label={mainAudioPitchSource.liveMicOnly ? 'Live Tuner' : 'Live Pitch'}
              isAudioMode
              liveMicEnabled={settings.liveMicTunerEnabled}
              micStreamRef={streamRef}
              layoutRegion="main"
              layoutKey={`audio-${recordingMode}-${streamGeneration}`}
              tunerInstrument={settings.tunerInstrument}
              onClose={() => setShowPitch(false)}
            />
          )}
          {showPitch && mainVideoPitchSource && (
            <DraggablePitchWidget
              boundaryRef={appShellRef}
              defaultBottomOffset={200}
              mediaRef={mainVideoPitchSource.mediaRef}
              enabled={settings.pitchTrackerEnabled}
              isPlaying={mainVideoPitchSource.isPlaying}
              mediaKey={mainVideoPitchSource.mediaKey}
              label="Live Pitch"
              pitchSource="microphone"
              micStreamRef={streamRef}
              layoutRegion="main"
              layoutKey={`video-${recordingMode}-${streamGeneration}`}
              tunerInstrument={settings.tunerInstrument}
              onClose={() => setShowPitch(false)}
            />
          )}
        </AnimatePresence>
      )}

      <div
        className={`app-ui-overlay ${isReviewOpen ? 'pointer-events-none invisible' : ''} ${quickSettingsOpen ? 'app-ui-overlay--quick-settings' : ''}`}
        aria-hidden={isReviewOpen}
      >
        <HudHeader
          sessionName={activeProject?.name ?? 'BestTake'}
          onOpenVault={handleOpenVault}
          className={quickSettingsOpen ? 'hud-header-hidden' : undefined}
        />

        <div className="app-hud-bottom pointer-events-none flex flex-col">
          <AnimatePresence>
            {settings.showTakeCards && !quickSettingsOpen && (
              <motion.div
                key="pip-row"
                className="app-pip-row-wrap w-full"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              >
                <PipCompareRow
                  benchmarkTake={benchmarkTake}
                  challengerTake={challengerTake}
                  suspendPipPlayback={suspendPipPlayback}
                  benchmarkPipVideoRef={benchmarkPipVideoRef}
                  challengerPipVideoRef={challengerPipVideoRef}
                  deleteDropRef={recordDeleteDropRef}
                  onPinBenchmark={handlePinBenchmark}
                  onDeleteTake={handleDragDeleteTake}
                  onUnpinBenchmark={handleUnpinBenchmark}
                  onUnpinChallenger={handleUnpinChallenger}
                  onUploadBenchmark={handleUploadBenchmark}
                  onExpandBenchmark={handleExpandBenchmark}
                  onExpandChallenger={handleExpandChallenger}
                  onDragStateChange={handlePipDragStateChange}
                  onBenchmarkPlaybackChange={setBenchmarkPipPlaying}
                  onChallengerPlaybackChange={setChallengerPipPlaying}
                  hapticFeedback={settings.hapticFeedback}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <ControlDeck
            isRecording={isRecording}
            elapsed={elapsed}
            ready={ready}
            recordingMode={recordingMode}
            onRecordingModeChange={changeRecordingMode}
            onToggleRecord={toggleRecording}
            onOpenVault={handleOpenVault}
            onOpenSettings={handleOpenSettings}
            takeCount={takes.length}
            autoSoundListening={autoSoundListening}
            recordDropRef={recordDeleteDropRef}
            dragDeleteActive={pipDragState.isDragging}
            dragOverDelete={pipDragState.overDelete}
            pitchTrackerEnabled={settings.pitchTrackerEnabled}
            showTakeCards={settings.showTakeCards}
            onPitchTrackerChange={(enabled) => {
              updateSettings({ pitchTrackerEnabled: enabled })
              if (enabled) setShowPitch(true)
            }}
            onShowTakeCardsChange={(show) => updateSettings({ showTakeCards: show })}
            settingsBranchDisabled={isSettingsOpen || isVaultOpen || isReviewOpen}
            onBranchOpenChange={setQuickSettingsOpen}
          />
        </div>
      </div>

      {isReviewOpen && (
        <ReviewModeOverlay
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
          pitchTrackerEnabled={settings.pitchTrackerEnabled}
          liveMicTunerEnabled={settings.liveMicTunerEnabled}
          tunerInstrument={settings.tunerInstrument}
          micStreamRef={streamRef}
          isOpen
          onClose={handleCloseReview}
          onSlotChange={handleReviewSlotChange}
        />
      )}

      <TakeVaultDrawer
        isOpen={isVaultOpen}
        onClose={handleCloseVault}
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
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
      />

      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        settings={settings}
        onUpdate={updateSettings}
        onReset={resetSettings}
        recordingMode={recordingMode}
      />
    </div>
  )
}
