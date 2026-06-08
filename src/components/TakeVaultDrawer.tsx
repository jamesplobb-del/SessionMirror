import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { X } from 'lucide-react'
import TakeCard from './TakeCard'
import GallerySortStrip from './GallerySortStrip'
import { mobileVideoProps } from '../utils/mobileVideo'
import type { SortMode, Take, TakeUpdate } from '../types'

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
  onUpdateTake: (id: string, updates: TakeUpdate) => void
  onDeleteTake: (id: string) => void
}

/** Resolve a take file to a WebView-safe playback URL on iOS / native. */
export async function resolveCapacitorVideoSrc(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!filePath || !Capacitor.isNativePlatform()) {
    return fallbackUrl
  }

  const { uri } = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data,
  })
  return Capacitor.convertFileSrc(uri)
}

/** Hook — re-resolves native file paths each mount (stored blob URLs are web-only). */
export function useCapacitorVideoSrc(
  filePath: string,
  fallbackUrl: string,
): string | null {
  const [src, setSrc] = useState<string | null>(fallbackUrl || null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const resolved = await resolveCapacitorVideoSrc(filePath, fallbackUrl)
        if (!cancelled) {
          setSrc(resolved || null)
        }
      } catch {
        if (!cancelled) {
          setSrc(fallbackUrl || null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filePath, fallbackUrl])

  return src
}

interface VaultTakeVideoProps {
  take: Take
  className?: string
  autoPlay?: boolean
  muted?: boolean
  controls?: boolean
}

export function VaultTakeVideo({
  take,
  className = 'h-full w-full object-cover',
  autoPlay = false,
  muted = true,
  controls = false,
}: VaultTakeVideoProps) {
  const src = useCapacitorVideoSrc(take.filePath, take.videoUrl)

  if (!src) {
    return <div className="h-full w-full animate-pulse bg-stone-200" />
  }

  return (
    <video
      src={src}
      className={className}
      poster={take.thumbnailUrl || undefined}
      preload="metadata"
      playsInline
      {...mobileVideoProps}
      muted={muted}
      controls={controls}
      autoPlay={autoPlay}
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
  onUpdateTake,
  onDeleteTake,
}: TakeVaultDrawerProps) {
  const [previewTakeId, setPreviewTakeId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setPreviewTakeId(null)
    }
  }, [isOpen])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <div
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[75vh] transform rounded-t-3xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
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
                {sortedTakes.map((take) => (
                  <TakeCard
                    key={take.id}
                    take={take}
                    isBenchmark={take.id === benchmarkId}
                    isChallenger={take.id === challengerId}
                    isPreviewing={previewTakeId === take.id}
                    onPreview={() =>
                      setPreviewTakeId((current) =>
                        current === take.id ? null : take.id,
                      )
                    }
                    onPinBenchmark={() => onPinBenchmark(take.id)}
                    onPinChallenger={() => onPinChallenger(take.id)}
                    onUpdate={(updates) => onUpdateTake(take.id, updates)}
                    onDelete={() => onDeleteTake(take.id)}
                    previewVideo={
                      previewTakeId === take.id ? (
                        <VaultTakeVideo take={take} controls muted={false} />
                      ) : null
                    }
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
