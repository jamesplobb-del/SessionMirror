import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { CheckSquare, Download, Trash2, X } from 'lucide-react'
import TakeCard from './TakeCard'
import GallerySortStrip from './GallerySortStrip'
import VaultMediaSegment from './VaultMediaSegment'
import { toCapacitorPlaybackSrc } from '../utils/takeStorage'
import { resetVideosInContainer, teardownVideosInContainer } from '../utils/videoPlayback'
import ProjectSessionBar from './ProjectSessionBar'
import { describeSaveTakeResult, describeBulkSaveResult, shareTakeVideo, shareTakeVideos } from '../utils/shareTakeVideo'
import { AUDIO_TAKE_THUMBNAIL, getTakeMediaType, isAudioTake } from '../utils/mediaType'
import type { MediaType, SortMode, Take, TakeUpdate } from '../types'
import type { Project } from '../db/types'

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
  projects: Project[]
  activeProject: Project | null
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string) => void | Promise<void>
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
  onDeleteTakes: (ids: string[]) => void
  onClearAllTakes: () => void
  onOpenTake: (take: Take) => void
}

interface VaultTakeVideoProps {
  take: Take
  className?: string
}

export function VaultTakeVideo({
  take,
  className = 'h-full w-full object-cover pointer-events-none',
}: VaultTakeVideoProps) {
  const audio = isAudioTake(take)
  const poster =
    take.thumbnailUrl ||
    (audio ? AUDIO_TAKE_THUMBNAIL : undefined)

  if (poster) {
    return (
      <img
        src={poster}
        alt=""
        className={className}
        draggable={false}
        loading="lazy"
      />
    )
  }

  return (
    <div
      className={`${className} animate-pulse bg-stone-200`}
      aria-hidden
    />
  )
}

export default function TakeVaultDrawer({
  isOpen,
  onClose,
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
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
  onDeleteTakes,
  onClearAllTakes,
  onOpenTake,
}: TakeVaultDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [vaultMediaTab, setVaultMediaTab] = useState<MediaType>('video')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const videoCount = useMemo(
    () => takes.filter((take) => getTakeMediaType(take) === 'video').length,
    [takes],
  )
  const audioCount = useMemo(
    () => takes.filter((take) => getTakeMediaType(take) === 'audio').length,
    [takes],
  )
  const filteredTakes = useMemo(
    () => sortedTakes.filter((take) => getTakeMediaType(take) === vaultMediaTab),
    [sortedTakes, vaultMediaTab],
  )

  const silenceAllVaultVideos = useCallback(() => {
    resetVideosInContainer(drawerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      teardownVideosInContainer(drawerRef.current)
      setSelectionMode(false)
      setSelectedIds(new Set())
    }
  }, [isOpen])

  useEffect(() => {
    teardownVideosInContainer(drawerRef.current)
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [activeProject?.id])

  const selectedCount = selectedIds.size
  const allFilteredSelected =
    filteredTakes.length > 0 &&
    filteredTakes.every((take) => selectedIds.has(take.id))

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleTakeSelection = useCallback((takeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(takeId)) {
        next.delete(takeId)
      } else {
        next.add(takeId)
      }
      return next
    })
  }, [])

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        for (const take of filteredTakes) {
          next.delete(take.id)
        }
        return next
      }

      const next = new Set(prev)
      for (const take of filteredTakes) {
        next.add(take.id)
      }
      return next
    })
  }, [allFilteredSelected, filteredTakes])

  const handleBulkSave = useCallback(() => {
    const selectedTakes = takes.filter((take) => selectedIds.has(take.id))
    if (selectedTakes.length === 0) return

    setBulkSaving(true)
    silenceAllVaultVideos()
    void shareTakeVideos(selectedTakes)
      .then((result) => {
        const message = describeBulkSaveResult(result)
        if (message) {
          window.alert(message)
        }
      })
      .finally(() => {
        setBulkSaving(false)
      })
  }, [selectedIds, silenceAllVaultVideos, takes])

  const handleBulkDelete = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return

    if (
      !window.confirm(
        `Delete ${ids.length} selected take${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return
    }

    silenceAllVaultVideos()
    onDeleteTakes(ids)
    exitSelectionMode()
  }, [exitSelectionMode, onDeleteTakes, selectedIds, silenceAllVaultVideos])

  const handleClearAll = useCallback(() => {
    if (takes.length === 0) return
    const sessionName = activeProject?.name ?? 'this session'
    if (
      !window.confirm(
        `Delete all ${takes.length} takes in "${sessionName}"? This cannot be undone.`,
      )
    ) {
      return
    }

    teardownVideosInContainer(drawerRef.current)
    silenceAllVaultVideos()
    onClearAllTakes()
    exitSelectionMode()
  }, [
    activeProject?.name,
    exitSelectionMode,
    onClearAllTakes,
    silenceAllVaultVideos,
    takes.length,
  ])

  useEffect(() => {
    return () => {
      teardownVideosInContainer(drawerRef.current)
    }
  }, [])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <div
        ref={drawerRef}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[min(75vh,100dvh)] flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl transition-[transform,opacity] duration-200 ease-in ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Take Vault"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Take Vault</h2>
            <p className="text-xs text-stone-500">
              {selectionMode
                ? `${selectedCount} selected`
                : activeProject
                  ? `Session: ${activeProject.name}`
                  : 'Set your Best Take and load a take to the HUD'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {takes.length > 0 && !selectionMode && (
              <>
                <button
                  type="button"
                  onClick={() => setSelectionMode(true)}
                  className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
                >
                  Select
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-full px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                >
                  Clear All
                </button>
              </>
            )}
            {selectionMode && (
              <button
                type="button"
                onClick={exitSelectionMode}
                className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-100"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
              aria-label="Close vault"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="vault-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4">
          <ProjectSessionBar
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
          />
          {takes.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50">
              <p className="text-sm text-stone-400">
                No takes yet. Hit Record to start your session.
              </p>
            </div>
          ) : (
            <>
              <VaultMediaSegment
                value={vaultMediaTab}
                onChange={setVaultMediaTab}
                videoCount={videoCount}
                audioCount={audioCount}
              />
              {filteredTakes.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50">
                  <p className="text-sm text-stone-400">
                    No {vaultMediaTab} takes yet.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <GallerySortStrip
                      sortMode={sortMode}
                      onSortChange={onSortChange}
                      takeCount={filteredTakes.length}
                    />
                    {selectionMode && (
                      <button
                        type="button"
                        onClick={toggleSelectAllFiltered}
                        className="shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
                      >
                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-start gap-4 overflow-x-auto overscroll-x-contain pb-2">
                    {isOpen &&
                      filteredTakes.map((take) => (
                        <TakeCard
                          key={take.id}
                          take={take}
                          isBenchmark={take.id === benchmarkId}
                          isChallenger={take.id === challengerId}
                          selectionMode={selectionMode}
                          selected={selectedIds.has(take.id)}
                          onToggleSelect={() => toggleTakeSelection(take.id)}
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
                          onExport={
                            !selectionMode && getTakeMediaType(take) === 'video'
                              ? () => {
                                  silenceAllVaultVideos()
                                  void shareTakeVideo(take).then((result) => {
                                    const message = describeSaveTakeResult(result)
                                    if (message) {
                                      window.alert(message)
                                    }
                                  })
                                }
                              : undefined
                          }
                          onUpdate={(updates) => onUpdateTake(take.id, updates)}
                          onDelete={() => onDeleteTake(take.id)}
                        />
                      ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {selectionMode && selectedCount > 0 && (
          <div
            className="flex shrink-0 gap-2 border-t border-stone-200/80 bg-white/95 px-6 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              disabled={bulkSaving}
              onClick={handleBulkSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {bulkSaving ? 'Saving…' : `Save (${selectedCount})`}
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedCount})
            </button>
          </div>
        )}

        {selectionMode && selectedCount === 0 && (
          <div
            className="flex shrink-0 items-center justify-center gap-2 border-t border-stone-200/80 bg-stone-50/95 px-6 py-3 text-xs text-stone-500"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Tap takes to select, then save or delete
          </div>
        )}
      </div>
    </>
  )
}

export { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
