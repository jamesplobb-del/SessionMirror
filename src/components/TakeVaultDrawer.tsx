import { useCallback, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { X } from 'lucide-react'
import TakeCard from './TakeCard'
import GallerySortStrip from './GallerySortStrip'
import TakeVideoPlayer from './TakeVideoPlayer'
import { toCapacitorPlaybackSrc } from '../utils/takeStorage'
import { resetVideosInContainer } from '../utils/videoPlayback'
import type { SortMode, Take, TakeUpdate } from '../types'

/** Resolves a on-disk take to a WebView-safe URL via Capacitor.convertFileSrc. */
export async function resolveVaultVideoSrc(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return fallbackUrl
  }
  if (filePath) {
    return toCapacitorPlaybackSrc(filePath)
  }
  return toCapacitorPlaybackSrc(fallbackUrl)
}

interface TakeVaultDrawerProps {
  isOpen: boolean
  onClose: () => void
  takes: Take[]
  sortedTakes: Take[]
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  benchmarkId: string | null
  challengerId: string | null
  onPinBenchmark: (id: string) => void
  onPinChallenger: (id: string) => void
  onBeforePin?: () => void
  onUpdateTake: (id: string, updates: TakeUpdate) => void
  onDeleteTake: (id: string) => void
  onOpenTake: (take: Take) => void
}

interface VaultTakeVideoProps {
  take: Take
  className?: string
  /** List tile — eager WebKit thumbnail fetch, no controls. */
  thumbnail?: boolean
}

export function VaultTakeVideo({
  take,
  className = 'h-full w-full object-cover pointer-events-none',
  thumbnail = false,
}: VaultTakeVideoProps) {
  return (
    <TakeVideoPlayer
      filePath={take.filePath}
      videoUrl={take.videoUrl}
      mimeType={take.videoMimeType || 'video/mp4'}
      className={className}
      poster={take.thumbnailUrl || undefined}
      loadingClassName="h-full w-full animate-pulse bg-stone-200"
      controls={false}
      mirror
      thumbnailPreview={thumbnail}
      eagerLoad={thumbnail}
      preload="metadata"
    />
  )
}

export default function TakeVaultDrawer({
  isOpen,
  onClose,
  takes,
  sortedTakes,
  sortMode,
  onSortChange,
  benchmarkId,
  challengerId,
  onPinBenchmark,
  onPinChallenger,
  onBeforePin,
  onUpdateTake,
  onDeleteTake,
  onOpenTake,
}: TakeVaultDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)

  const silenceAllVaultVideos = useCallback(() => {
    resetVideosInContainer(drawerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      silenceAllVaultVideos()
    }
  }, [isOpen, silenceAllVaultVideos])

  useEffect(() => {
    return () => {
      silenceAllVaultVideos()
    }
  }, [silenceAllVaultVideos])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ease-in ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <div
        ref={drawerRef}
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[75vh] rounded-t-3xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl transition-[transform,opacity] duration-200 ease-in ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Take Vault"
      >
        <div className="flex items-center justify-between border-b border-stone-200/80 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Take Vault</h2>
            <p className="text-xs text-stone-500">Pin takes to the HUD windows above</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
            aria-label="Close vault"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-8 pt-4">
          {takes.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50">
              <p className="text-sm text-stone-400">
                No takes yet. Hit Record to start your session.
              </p>
            </div>
          ) : (
            <>
              <GallerySortStrip
                sortMode={sortMode}
                onSortChange={onSortChange}
                takeCount={takes.length}
              />
              <div className="flex gap-4 overflow-x-auto pb-2">
                {isOpen &&
                  sortedTakes.map((take) => (
                    <TakeCard
                      key={take.id}
                      take={take}
                      isBenchmark={take.id === benchmarkId}
                      isChallenger={take.id === challengerId}
                      onOpenTake={() => {
                        silenceAllVaultVideos()
                        onOpenTake(take)
                      }}
                      onPinBenchmark={() => {
                        onBeforePin?.()
                        silenceAllVaultVideos()
                        onPinBenchmark(take.id)
                      }}
                      onPinChallenger={() => {
                        onBeforePin?.()
                        silenceAllVaultVideos()
                        onPinChallenger(take.id)
                      }}
                      onUpdate={(updates) => onUpdateTake(take.id, updates)}
                      onDelete={() => onDeleteTake(take.id)}
                      thumbnailVideo={<VaultTakeVideo take={take} thumbnail />}
                    />
                  ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
