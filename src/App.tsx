import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { deleteTakeFile, type RecordingCompletePayload } from './utils/takeStorage'
import ReviewModeOverlay from './components/ReviewModeOverlay'
import type { ReviewSlot, SortMode, Take, TakeUpdate } from './types'

export default function App() {
  const [takes, setTakes] = useState<Take[]>([])
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null)
  const [challengerId, setChallengerId] = useState<string | null>(null)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('newest')

  const handleSaveTake = useCallback((payload: RecordingCompletePayload) => {
    const { takeId, mimeType, filePath, videoUrl, blob } = payload

    setTakes((prev) => {
      const next = createTake(
        takeId,
        prev.length + 1,
        videoUrl,
        filePath,
        mimeType,
      )
      setChallengerId(next.id)
      return [...prev, next]
    })

    const thumbnailPromise = blob
      ? generateThumbnailFromBlob(blob)
      : generateThumbnailFromUrl(videoUrl)

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
  }, [])

  const isReviewOpen = reviewSlot !== null
  const isCameraActive = !isVaultOpen && !isReviewOpen

  const {
    previewRef,
    stream,
    error: cameraError,
    ready,
    isRecording,
    elapsed,
    toggleRecording,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
    enabled: isCameraActive,
  })

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
      setBenchmarkId(id)
      setChallengerId((current) => {
        if (current && current !== id) return current
        const other = takes.find((t) => t.id !== id)
        return other?.id ?? null
      })
    },
    [takes],
  )

  const handlePinChallenger = useCallback((id: string) => {
    setChallengerId(id)
  }, [])

  const handleUpdateTake = useCallback((id: string, updates: TakeUpdate) => {
    setTakes((prev) =>
      prev.map((take) => (take.id === id ? { ...take, ...updates } : take)),
    )
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
    setBenchmarkId((current) => (current === id ? null : current))
    setChallengerId((current) => (current === id ? null : current))
  }, [])

  const takesRef = useRef(takes)
  takesRef.current = takes

  useEffect(() => {
    return () => {
      takesRef.current.forEach((take) => {
        if (take.filePath) {
          void deleteTakeFile(take.filePath)
        } else if (take.videoUrl.startsWith('blob:')) {
          URL.revokeObjectURL(take.videoUrl)
        }
      })
    }
  }, [])

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-black">
      {isCameraActive && (
        <LiveCameraBackground
          previewRef={previewRef}
          stream={stream}
          error={cameraError}
        />
      )}

      {!isReviewOpen && <HudHeader />}

      {!isReviewOpen && (
        <PipWindow
          className="pointer-events-auto absolute bottom-16 left-3 z-20 sm:left-4"
          src={benchmarkTake?.videoUrl ?? null}
          filePath={benchmarkTake?.filePath}
          takeName={benchmarkTake?.name}
          label="Benchmark"
          variant="benchmark"
          emptyMessage="Pin a benchmark take from the vault."
          onUnpin={() => setBenchmarkId(null)}
          onExpand={
            benchmarkTake?.videoUrl
              ? () => setReviewSlot('benchmark')
              : undefined
          }
        />
      )}

      {!isReviewOpen && (
        <PipWindow
          className="pointer-events-auto absolute bottom-16 right-3 z-20 sm:right-4"
          src={challengerTake?.videoUrl ?? null}
          filePath={challengerTake?.filePath}
          takeName={challengerTake?.name}
          label="Challenger"
          variant="challenger"
          autoPlay
          emptyMessage="Pin a challenger take from the vault."
          onUnpin={() => setChallengerId(null)}
          onExpand={
            challengerTake?.videoUrl
              ? () => setReviewSlot('challenger')
              : undefined
          }
        />
      )}

      {!isReviewOpen && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ControlDeck
            isRecording={isRecording}
            elapsed={elapsed}
            ready={ready}
            onToggleRecord={toggleRecording}
            onOpenVault={() => setIsVaultOpen(true)}
            takeCount={takes.length}
          />
        </div>
      )}

      {isReviewOpen && reviewSlot && (
        <ReviewModeOverlay
          activeSlot={reviewSlot}
          benchmarkSrc={benchmarkTake?.videoUrl ?? null}
          challengerSrc={challengerTake?.videoUrl ?? null}
          benchmarkFilePath={benchmarkTake?.filePath}
          challengerFilePath={challengerTake?.filePath}
          benchmarkName={benchmarkTake?.name}
          challengerName={challengerTake?.name}
          videoMimeType={
            (reviewSlot === 'benchmark'
              ? benchmarkTake?.videoMimeType
              : challengerTake?.videoMimeType) || 'video/mp4'
          }
          onClose={() => setReviewSlot(null)}
          onSlotChange={setReviewSlot}
        />
      )}

      <TakeVaultDrawer
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        takes={takes}
        sortedTakes={sortedTakes}
        sortMode={sortMode}
        onSortChange={setSortMode}
        benchmarkId={benchmarkId}
        challengerId={challengerId}
        onPinBenchmark={handlePinBenchmark}
        onPinChallenger={handlePinChallenger}
        onUpdateTake={handleUpdateTake}
        onDeleteTake={handleDeleteTake}
      />
    </div>
  )
}
