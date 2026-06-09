import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
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
import {
  generateThumbnailFromBlob,
  generateThumbnailFromUrl,
} from './utils/generateThumbnail'
import { createTake, sortTakes } from './utils/takes'
import {
  deleteTakeFile,
  NATIVE_VIDEO_MIME,
  persistUploadedVideo,
  resolveTakePlaybackUrl,
  type RecordingCompletePayload,
} from './utils/takeStorage'
import { resetVideoPlayback } from './utils/videoPlayback'
import ReviewModeOverlay from './components/ReviewModeOverlay'
import PitchAnalysis from './components/PitchAnalysis'
import type { ReviewContext, ReviewSlot, SortMode, Take, TakeUpdate } from './types'
import { AUDIO_TAKE_THUMBNAIL, inferMediaTypeFromMime, isAudioTake } from './utils/mediaType'
import { applyViewportCssVars, scheduleViewportSync } from './utils/viewportSync'
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

async function hydrateTakeThumbnailsInBackground(
  takes: Take[],
  applyThumbnail: (takeId: string, thumbnailUrl: string) => void,
): Promise<void> {
  for (const take of takes) {
    if (take.thumbnailUrl || isAudioTake(take)) continue
    try {
      const thumbnailUrl = await generateThumbnailFromUrl(take.videoUrl)
      applyThumbnail(take.id, thumbnailUrl)
    } catch {
      /* vault cards show placeholder until thumbnail is ready */
    }
  }
}

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
  const [isPitchAnalysisOpen, setIsPitchAnalysisOpen] = useState(false)
  const [pipDragState, setPipDragState] = useState<PipDragUiState>({
    isDragging: false,
    isArming: false,
    overDelete: false,
  })

  const { settings, updateSettings, resetSettings } = useAppSettings()
  const pendingAutoPlaybackRef = useRef(false)
  const autoPlaybackAudioRef = useRef<HTMLAudioElement | null>(null)
  const autoPlaybackReleaseTimerRef = useRef<number | null>(null)
  const playAutoTakeAudioRef = useRef<(playbackUrl: string) => void>(() => {})
  const recordDeleteDropRef = useRef<HTMLDivElement>(null)
  const [autoRecordStartSuppressed, setAutoRecordStartSuppressed] = useState(false)

  const benchmarkPipVideoRef = useRef<HTMLMediaElement>(null)
  const challengerPipVideoRef = useRef<HTMLMediaElement>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  activeProjectIdRef.current = activeProjectId

  const isReviewOpen = reviewSlot !== null

  useLayoutEffect(() => {
    return scheduleViewportSync((height) => {
      setWindowHeight((prev) => (prev === height ? prev : height))
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

  const stopAutoPlaybackAudio = useCallback(() => {
    const audio = autoPlaybackAudioRef.current
    if (!audio) return

    audio.onended = null
    audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    autoPlaybackAudioRef.current = null
  }, [])

  const playAutoTakeAudio = useCallback(
    (playbackUrl: string) => {
      stopAutoPlaybackAudio()

      const audio = new Audio()
      autoPlaybackAudioRef.current = audio
      audio.preload = 'auto'
      audio.src = playbackUrl

      const finish = () => {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(350)
      }

      setAutoRecordStartSuppressed(true)
      audio.muted = false
      audio.onended = finish
      audio.onerror = finish

      void audio.play().catch(() => {
        stopAutoPlaybackAudio()
        releaseAutoRecordSuppress(0)
      })
    },
    [releaseAutoRecordSuppress, stopAutoPlaybackAudio],
  )

  playAutoTakeAudioRef.current = playAutoTakeAudio

  const applyTakeThumbnail = useCallback((takeId: string, thumbnailUrl: string) => {
    setTakes((prev) =>
      prev.map((take) =>
        take.id === takeId ? { ...take, thumbnailUrl } : take,
      ),
    )
  }, [])

  const reloadProjectTakes = useCallback(
    async (projectId: string) => {
      const rows = await getTakesByProject(projectId)
      const loaded = await uiTakesFromVaultRows(rows)

      setTakes(loaded)
      setBenchmarkId(findBestTakeId(rows))
      setChallengerId((current) => {
        if (current && rows.some((row) => row.id === current)) return current
        return rows.find((row) => !row.isBestTake)?.id ?? null
      })

      void hydrateTakeThumbnailsInBackground(loaded, applyTakeThumbnail)
    },
    [applyTakeThumbnail],
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

      pausePipVideos()
      setActiveProjectId(projectId)
      setTakes([])
      setBenchmarkId(null)
      setChallengerId(null)
      await reloadProjectTakes(projectId)
    },
    [pausePipVideos, reloadProjectTakes],
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
    const { takeId, mimeType, filePath, videoUrl, blob, mediaType, durationSeconds } =
      payload

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
          name: mediaType === 'audio' ? `Audio ${takeIndex}` : `Take ${takeIndex}`,
        })
      }

      setTakes((prev) => {
        const index = projectId ? takeIndex : prev.length + 1
        const next = createTake(
          takeId,
          index,
          safeVideoUrl,
          filePath,
          mimeType,
          mediaType,
        )
        setChallengerId(next.id)
        return [...prev, next]
      })

      if (mediaType === 'audio' && pendingAutoPlaybackRef.current) {
        pendingAutoPlaybackRef.current = false
        playAutoTakeAudioRef.current(safeVideoUrl)
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
        ? generateThumbnailFromBlob(blob)
        : (async () => {
            if (Capacitor.isNativePlatform()) {
              await new Promise((resolve) => window.setTimeout(resolve, 1200))
            }
            return generateThumbnailFromUrl(safeVideoUrl)
          })()

      void thumbnailPromise
        .then((thumbnailUrl) => {
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

  const autoMonitoringAllowed =
    !isVaultOpen && !isSettingsOpen && !isReviewOpen && !isPitchAnalysisOpen && ready

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

  useEffect(() => {
    if (wasVaultOpenRef.current && !isVaultOpen) {
      void refreshCameraSession()
    }
    wasVaultOpenRef.current = isVaultOpen
  }, [isVaultOpen, refreshCameraSession])

  const handleCloseVault = useCallback(() => {
    setIsVaultOpen(false)
  }, [])

  const handleOpenVault = useCallback(() => {
    pausePipVideos()
    setIsSettingsOpen(false)
    setIsVaultOpen(true)
  }, [pausePipVideos])

  const handleOpenSettings = useCallback(() => {
    pausePipVideos()
    setIsVaultOpen(false)
    setIsSettingsOpen(true)
  }, [pausePipVideos])

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

  const suspendPipPlayback = isVaultOpen || isReviewOpen || isSettingsOpen || isPitchAnalysisOpen

  const benchmarkTake = useMemo(
    () => takes.find((t) => t.id === benchmarkId) ?? null,
    [takes, benchmarkId],
  )

  const challengerTake = useMemo(
    () => takes.find((t) => t.id === challengerId) ?? null,
    [takes, challengerId],
  )

  const sortedTakes = useMemo(
    () => sortTakes(takes, sortMode),
    [takes, sortMode],
  )

  const handlePinBenchmark = useCallback(
    (id: string) => {
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
    [pausePipVideos, takes],
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
      setVaultReviewIndex(index >= 0 ? index : 0)
      setReviewContext('vault')
      setReviewSlot('benchmark')
      setIsVaultOpen(false)
    },
    [sortedTakes],
  )

  const handleOpenCompareReview = useCallback((slot: ReviewSlot) => {
    setReviewContext('compare')
    setReviewSlot(slot)
  }, [])

  const handleCloseReview = useCallback(() => {
    setReviewSlot(null)
    setReviewContext((context) => {
      if (context === 'vault') {
        setIsVaultOpen(true)
      }
      return 'compare'
    })
    pausePipVideos()
  }, [pausePipVideos])

  const handleOpenPitchAnalysis = useCallback(() => {
    pausePipVideos()
    setReviewSlot(null)
    setIsVaultOpen(false)
    setIsPitchAnalysisOpen(true)
  }, [pausePipVideos])

  const handleClosePitchAnalysis = useCallback(() => {
    setIsPitchAnalysisOpen(false)
    pausePipVideos()
  }, [pausePipVideos])

  const pitchComparison = useMemo(() => {
    const current = challengerTake
    if (!current?.videoUrl || isAudioTake(current)) return null

    let best = benchmarkTake
    if (!best?.videoUrl || isAudioTake(best) || best.id === current.id) {
      best =
        takes.find(
          (take) =>
            take.id !== current.id && take.videoUrl && !isAudioTake(take),
        ) ?? null
    }

    if (!best?.videoUrl || best.id === current.id) return null

    return { currentTake: current, bestTake: best }
  }, [benchmarkTake, challengerTake, takes])

  const canOpenPitchAnalysis = pitchComparison != null

  useEffect(() => {
    if (isPitchAnalysisOpen && !canOpenPitchAnalysis) {
      setIsPitchAnalysisOpen(false)
    }
  }, [isPitchAnalysisOpen, canOpenPitchAnalysis])

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

        void generateThumbnailFromUrl(safeVideoUrl)
          .then((thumbnailUrl) => {
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
      const removed = takes.filter((take) => idSet.has(take.id))

      setTakes((prev) => prev.filter((take) => !idSet.has(take.id)))
      void Promise.all(ids.map((id) => deleteVaultTake(id)))
      setBenchmarkId((current) => (current && idSet.has(current) ? null : current))
      setChallengerId((current) => (current && idSet.has(current) ? null : current))

      for (const take of removed) {
        removeTakeResources(take)
      }
    },
    [removeTakeResources, takes],
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
  }, [removeTakeResources, takes])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
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
    <div className="app-shell">
      <LiveCameraBackground
        previewRef={previewRef}
        streamRef={streamRef}
        streamGeneration={streamGeneration}
        error={cameraError}
        recordingMode={recordingMode}
        isRecording={isRecording}
        previewLive={ready}
        viewportKey={windowHeight}
      />

      <div
        className={`app-ui-overlay ${isReviewOpen || isPitchAnalysisOpen ? 'pointer-events-none invisible' : ''}`}
        aria-hidden={isReviewOpen || isPitchAnalysisOpen}
      >
        <HudHeader
          sessionName={activeProject?.name ?? 'BestTake'}
          onOpenVault={handleOpenVault}
        />

        <div className="app-hud-bottom pointer-events-none flex flex-col">
          <PipCompareRow
            benchmarkTake={benchmarkTake}
            challengerTake={challengerTake}
            suspendPipPlayback={suspendPipPlayback}
            benchmarkPipVideoRef={benchmarkPipVideoRef}
            challengerPipVideoRef={challengerPipVideoRef}
            deleteDropRef={recordDeleteDropRef}
            onPinBenchmark={handlePinBenchmark}
            onDeleteTake={handleDragDeleteTake}
            onUnpinBenchmark={() => setBenchmarkId(null)}
            onUnpinChallenger={() => setChallengerId(null)}
            onUploadBenchmark={handleUploadBenchmark}
            onExpandBenchmark={
              benchmarkTake?.videoUrl
                ? () => handleOpenCompareReview('benchmark')
                : undefined
            }
            onExpandChallenger={
              challengerTake?.videoUrl
                ? () => handleOpenCompareReview('challenger')
                : undefined
            }
            onOpenPitchAnalysis={
              canOpenPitchAnalysis ? handleOpenPitchAnalysis : undefined
            }
            onDragStateChange={setPipDragState}
            hapticFeedback={settings.hapticFeedback}
          />

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
          />
        </div>
      </div>

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
        benchmarkMimeType={benchmarkTake?.videoMimeType ?? 'video/mp4'}
        challengerMimeType={challengerTake?.videoMimeType ?? 'video/mp4'}
        benchmarkMirror={benchmarkTake?.mirrorPlayback !== false}
        challengerMirror={challengerTake?.mirrorPlayback !== false}
        isOpen={isReviewOpen}
        onClose={handleCloseReview}
        onSlotChange={(slot) => {
          setReviewContext('compare')
          setReviewSlot(slot)
        }}
        onOpenPitchAnalysis={canOpenPitchAnalysis ? handleOpenPitchAnalysis : undefined}
      />

      {pitchComparison && (
        <PitchAnalysis
          isOpen={isPitchAnalysisOpen}
          onClose={handleClosePitchAnalysis}
          currentTake={pitchComparison.currentTake}
          bestTake={pitchComparison.bestTake}
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
