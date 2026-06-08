import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { deleteTakeFile, resolveTakePlaybackUrl, type RecordingCompletePayload } from './utils/takeStorage'
import ReviewModeOverlay from './components/ReviewModeOverlay'
import type { ReviewSlot, SortMode, Take, TakeUpdate } from './types'

export default function App() {
  const [takes, setTakes] = useState<Take[]>([])
  const [benchmarkId, setBenchmarkId] = useState<string | null>(null)
  const [challengerId, setChallengerId] = useState<string | null>(null)
  const [isVaultOpen, setIsVaultOpen] = useState(false)
  const [reviewSlot, setReviewSlot] = useState<ReviewSlot | null>(null)
  const [soloReviewTake, setSoloReviewTake] = useState<Take | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('newest')

  const isReviewOpen = reviewSlot !== null

  const handleSaveTake = useCallback((payload: RecordingCompletePayload) => {
    const { takeId, mimeType, filePath, videoUrl, blob } = payload

    void (async () => {
      const safeVideoUrl = await resolveTakePlaybackUrl(filePath, videoUrl)

      setTakes((prev) => {
        const next = createTake(
          takeId,
          prev.length + 1,
          safeVideoUrl,
          filePath,
          mimeType,
        )
        setChallengerId(next.id)
        return [...prev, next]
      })

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
    error: cameraError,
    ready,
    isRecording,
    elapsed,
    toggleRecording,
  } = useCameraSession({
    onRecordingComplete: handleSaveTake,
  })

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

  const handleOpenVaultTake = useCallback(
    (take: Take) => {
      setIsVaultOpen(false)
      setSoloReviewTake(null)

      if (take.id === benchmarkId) {
        setReviewSlot('benchmark')
      } else if (take.id === challengerId) {
        setReviewSlot('challenger')
      } else {
        setSoloReviewTake(take)
        setReviewSlot('benchmark')
      }
    },
    [benchmarkId, challengerId],
  )

  const handleCloseReview = useCallback(() => {
    setReviewSlot(null)
    setSoloReviewTake(null)
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
      <LiveCameraBackground
        previewRef={previewRef}
        streamRef={streamRef}
        error={cameraError}
      />

      <div
        className={`absolute inset-0 z-10 ${isReviewOpen ? 'pointer-events-none invisible' : ''}`}
        aria-hidden={isReviewOpen}
      >
        <HudHeader />

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-4 transition-opacity duration-200 ease-in"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex items-end justify-between gap-3 px-3 sm:px-4">
            <PipWindow
              className="pointer-events-auto shrink-0"
              src={benchmarkTake?.videoUrl ?? null}
              filePath={benchmarkTake?.filePath}
              mimeType={benchmarkTake?.videoMimeType ?? 'video/mp4'}
              takeName={benchmarkTake?.name}
              label="Benchmark"
              variant="benchmark"
              emptyMessage="Pin a benchmark take from the vault."
              suspendPlayback={suspendPipPlayback}
              onUnpin={() => setBenchmarkId(null)}
              onExpand={
                benchmarkTake?.videoUrl
                  ? () => {
                      setSoloReviewTake(null)
                      setReviewSlot('benchmark')
                    }
                  : undefined
              }
            />

            <PipWindow
              className="pointer-events-auto shrink-0"
              src={challengerTake?.videoUrl ?? null}
              filePath={challengerTake?.filePath}
              mimeType={challengerTake?.videoMimeType ?? 'video/mp4'}
              takeName={challengerTake?.name}
              label="Challenger"
              variant="challenger"
              emptyMessage="Pin a challenger take from the vault."
              suspendPlayback={suspendPipPlayback}
              onUnpin={() => setChallengerId(null)}
              onExpand={
                challengerTake?.videoUrl
                  ? () => {
                      setSoloReviewTake(null)
                      setReviewSlot('challenger')
                    }
                  : undefined
              }
            />
          </div>

          <ControlDeck
            isRecording={isRecording}
            elapsed={elapsed}
            ready={ready}
            onToggleRecord={toggleRecording}
            onOpenVault={() => setIsVaultOpen(true)}
            takeCount={takes.length}
          />
        </div>
      </div>

      <ReviewModeOverlay
        activeSlot={reviewSlot ?? 'benchmark'}
        soloTake={soloReviewTake}
        benchmarkSrc={benchmarkTake?.videoUrl ?? null}
        challengerSrc={challengerTake?.videoUrl ?? null}
        benchmarkFilePath={benchmarkTake?.filePath}
        challengerFilePath={challengerTake?.filePath}
        benchmarkName={benchmarkTake?.name}
        challengerName={challengerTake?.name}
        benchmarkMimeType={benchmarkTake?.videoMimeType ?? 'video/mp4'}
        challengerMimeType={challengerTake?.videoMimeType ?? 'video/mp4'}
        isOpen={isReviewOpen}
        onClose={handleCloseReview}
        onSlotChange={(slot) => {
          setSoloReviewTake(null)
          setReviewSlot(slot)
        }}
      />

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
        onOpenTake={handleOpenVaultTake}
      />
    </div>
  )
}
