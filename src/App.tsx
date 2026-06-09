import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import LiveCameraBackground from './components/LiveCameraBackground'
import HudHeader from './components/HudHeader'
import PipWindow from './components/PipWindow'
import ControlDeck from './components/ControlDeck'
import TakeVaultDrawer from './components/TakeVaultDrawer'
import { useCameraSession } from './hooks/useCameraSession'
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
import type { ReviewContext, ReviewSlot, SortMode, Take, TakeUpdate } from './types'
import { AUDIO_TAKE_THUMBNAIL, inferMediaTypeFromMime, isAudioTake } from './utils/mediaType'
import { applyViewportCssVars, scheduleViewportSync } from './utils/viewportSync'
import {
  createProject,
  deleteVaultTake,
  findBestTakeId,
  getTakesByProject,
  listProjects,
  loadUiTakesForProject,
  saveTake,
  setProjectBestTake,
  updateVaultTake,
  type Project,
} from './db'

async function hydrateTakeThumbnails(takes: Take[]): Promise<Take[]> {
  return Promise.all(
    takes.map(async (take) => {
      if (take.thumbnailUrl || isAudioTake(take)) return take
      try {
        const thumbnailUrl = await generateThumbnailFromUrl(take.videoUrl)
        return { ...take, thumbnailUrl }
      } catch {
        return take
      }
    }),
  )
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

  const reloadProjectTakes = useCallback(async (projectId: string) => {
    const loaded = await loadUiTakesForProject(projectId)
    const withThumbs = await hydrateTakeThumbnails(loaded)
    setTakes(withThumbs)

    const rows = await getTakesByProject(projectId)
    setBenchmarkId(findBestTakeId(rows))
    setChallengerId((current) => {
      if (current && rows.some((row) => row.id === current)) return current
      return rows.find((row) => !row.isBestTake)?.id ?? null
    })
  }, [])

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
      pausePipVideos()
      setActiveProjectId(projectId)
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
    refreshCameraSession,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
  })

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
    setIsVaultOpen(true)
  }, [pausePipVideos])

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

  const suspendPipPlayback = isVaultOpen || isReviewOpen

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

  const handleDeleteTake = useCallback((id: string) => {
    setTakes((prev) => {
      const target = prev.find((t) => t.id === id)
      if (target) {
        if (target.filePath) {
          void deleteTakeFile(target.filePath)
        } else if (target.videoUrl.startsWith('blob:')) {
          URL.revokeObjectURL(target.videoUrl)
        }
      }
      return prev.filter((t) => t.id !== id)
    })
    void deleteVaultTake(id)
    setBenchmarkId((current) => (current === id ? null : current))
    setChallengerId((current) => (current === id ? null : current))
  }, [])

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
        className={`app-ui-overlay ${isReviewOpen ? 'pointer-events-none invisible' : ''}`}
        aria-hidden={isReviewOpen}
      >
        <HudHeader
          sessionName={activeProject?.name ?? 'BestTake'}
          onOpenVault={handleOpenVault}
        />

        <div className="app-hud-bottom pointer-events-none flex flex-col">
          <div className="app-pip-row">
            <PipWindow
              className="pointer-events-auto shrink-0"
              src={benchmarkTake?.videoUrl ?? null}
              filePath={benchmarkTake?.filePath}
              mimeType={benchmarkTake?.videoMimeType ?? 'video/mp4'}
              takeName={benchmarkTake?.name}
              label="Best Take"
              variant="benchmark"
              emptyMessage="Set or upload a Best Take."
              mirror={benchmarkTake?.mirrorPlayback !== false}
              suspendPlayback={suspendPipPlayback}
              videoRef={benchmarkPipVideoRef}
              onUnpin={() => setBenchmarkId(null)}
              onUpload={handleUploadBenchmark}
              onExpand={
                benchmarkTake?.videoUrl
                  ? () => handleOpenCompareReview('benchmark')
                  : undefined
              }
            />

            <PipWindow
              className="pointer-events-auto shrink-0"
              src={challengerTake?.videoUrl ?? null}
              filePath={challengerTake?.filePath}
              mimeType={challengerTake?.videoMimeType ?? 'video/mp4'}
              takeName={challengerTake?.name}
              label="Current Take"
              variant="challenger"
              emptyMessage="Load a take from the vault."
              mirror={challengerTake?.mirrorPlayback !== false}
              suspendPlayback={suspendPipPlayback}
              videoRef={challengerPipVideoRef}
              onUnpin={() => setChallengerId(null)}
              onExpand={
                challengerTake?.videoUrl
                  ? () => handleOpenCompareReview('challenger')
                  : undefined
              }
            />
          </div>

          <ControlDeck
            isRecording={isRecording}
            elapsed={elapsed}
            ready={ready}
            recordingMode={recordingMode}
            onRecordingModeChange={changeRecordingMode}
            onToggleRecord={toggleRecording}
            onOpenVault={handleOpenVault}
            takeCount={takes.length}
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
      />

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
        onOpenTake={handleOpenVaultTake}
      />
    </div>
  )
}
