import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckSquare, Download, Trash2, X } from 'lucide-react'
import TakeCard from './TakeCard'
import TakeVideoPlayer from './TakeVideoPlayer'
import GallerySortStrip from './GallerySortStrip'
import VaultMediaSegment from './VaultMediaSegment'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import { VaultDrawerSkeleton } from './ui/DrawerSkeletons'
import Pressable from './ui/Pressable'
import { resetVideosInContainer, teardownVideosInContainer } from '../utils/videoPlayback'
import { scheduleAfterPaint } from '../utils/scheduleDeferred'
import { useDeferredDrawerContent } from '../hooks/useDeferredDrawerContent'
import ProjectSessionBar from './ProjectSessionBar'
import { describeSaveTakeResult, describeBulkSaveResult, shareTakeVideo, shareTakeVideos } from '../utils/shareTakeVideo'
import { getTakeMediaType } from '../utils/mediaType'
import type { MediaType, SortMode, Take, TakeUpdate } from '../types'
import type { Project } from '../db/types'

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
  onBeforeExport?: () => void
  /** Fires after the sheet slide completes — use for deferred DB hydration. */
  onEnterComplete?: () => void
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
  onBeforeExport,
  onEnterComplete,
}: TakeVaultDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)
  const [vaultMediaTab, setVaultMediaTab] = useState<MediaType>('video')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [exportingTakeId, setExportingTakeId] = useState<string | null>(null)

  const handleSheetEnterComplete = useCallback(() => {
    markContentReady()
    onEnterComplete?.()
  }, [markContentReady, onEnterComplete])

  const videoCount = useMemo(
    () =>
      contentReady ? takes.filter((take) => getTakeMediaType(take) === 'video').length : 0,
    [contentReady, takes],
  )
  const audioCount = useMemo(
    () =>
      contentReady ? takes.filter((take) => getTakeMediaType(take) === 'audio').length : 0,
    [contentReady, takes],
  )
  const filteredTakes = useMemo(
    () =>
      contentReady
        ? sortedTakes.filter((take) => getTakeMediaType(take) === vaultMediaTab)
        : [],
    [contentReady, sortedTakes, vaultMediaTab],
  )

  const silenceAllVaultVideos = useCallback(() => {
    resetVideosInContainer(drawerRef.current)
  }, [])

  useEffect(() => {
    if (isOpen) return

    scheduleAfterPaint(() => {
      teardownVideosInContainer(drawerRef.current)
    })
    setSelectionMode(false)
    setSelectedIds(new Set())
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
    onBeforeExport?.()
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
  }, [onBeforeExport, selectedIds, silenceAllVaultVideos, takes])

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

    onClearAllTakes()
    exitSelectionMode()

    window.requestAnimationFrame(() => {
      teardownVideosInContainer(drawerRef.current)
    })
  }, [activeProject?.name, exitSelectionMode, onClearAllTakes, takes.length])

  useEffect(() => {
    return () => {
      teardownVideosInContainer(drawerRef.current)
    }
  }, [])

  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Take Vault"
      maxHeightClass="h-[min(75vh,100dvh)]"
      sheetRef={drawerRef}
      motionPreset="premium"
      onEnterComplete={handleSheetEnterComplete}
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
            {contentReady && takes.length > 0 && !selectionMode && (
              <>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => setSelectionMode(true)}
                  className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                >
                  Select
                </Pressable>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={handleClearAll}
                  className="rounded-full px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Clear All
                </Pressable>
              </>
            )}
            {selectionMode && (
              <Pressable
                type="button"
                intensity="soft"
                onClick={exitSelectionMode}
                className="rounded-full px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </Pressable>
            )}
            <Pressable
              type="button"
              intensity="icon"
              onClick={onClose}
              className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label="Close vault"
            >
              <X className="h-5 w-5" />
            </Pressable>
          </div>
        </div>

        <div className="vault-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4">
          {!contentReady ? (
            <VaultDrawerSkeleton />
          ) : (
            <>
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
                      <Pressable
                        type="button"
                        intensity="soft"
                        onClick={toggleSelectAllFiltered}
                        className="shrink-0 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                      >
                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                      </Pressable>
                    )}
                  </div>
                  <div className="vault-card-strip flex items-start gap-4 overflow-x-auto overscroll-x-contain pb-2">
                    {filteredTakes.map((take) => (
                      <TakeCard
                        key={take.id}
                        take={take}
                        isBenchmark={take.id === benchmarkId}
                        isChallenger={take.id === challengerId}
                        thumbnailVideo={
                          getTakeMediaType(take) === 'video' && !take.thumbnailUrl ? (
                            <TakeVideoPlayer
                              filePath={take.filePath}
                              videoUrl={take.videoUrl}
                              mimeType={take.videoMimeType}
                              recordingOrientation={take.recordingOrientation}
                              thumbnailPreview
                              manualPlayOnly
                              controls={false}
                              mirror={take.mirrorPlayback !== false}
                              className="h-full w-full object-cover"
                              preload="metadata"
                            />
                          ) : undefined
                        }
                        selectionMode={selectionMode}
                        selected={selectedIds.has(take.id)}
                        onToggleSelect={() => toggleTakeSelection(take.id)}
                        onOpenTake={() => {
                          onOpenTake(take)
                          scheduleAfterPaint(() => {
                            silenceAllVaultVideos()
                          })
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
                                onBeforeExport?.()
                                setExportingTakeId(take.id)
                                void shareTakeVideo(take)
                                  .then((result) => {
                                    const message = describeSaveTakeResult(result)
                                    if (message) {
                                      window.alert(message)
                                    }
                                  })
                                  .finally(() => {
                                    setExportingTakeId((current) =>
                                      current === take.id ? null : current,
                                    )
                                  })
                              }
                            : undefined
                        }
                        onUpdate={(updates) => onUpdateTake(take.id, updates)}
                        onDelete={() => onDeleteTake(take.id)}
                        exportBusy={exportingTakeId === take.id}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
            </>
          )}
        </div>

        {contentReady && selectionMode && selectedCount > 0 && (
          <div
            className="vault-bulk-bar flex shrink-0 gap-2 border-t border-stone-200/80 bg-white/95 px-6 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <Pressable
              type="button"
              intensity="soft"
              disabled={bulkSaving}
              onClick={handleBulkSave}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {bulkSaving ? 'Saving…' : `Save (${selectedCount})`}
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              onClick={handleBulkDelete}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedCount})
            </Pressable>
          </div>
        )}

        {contentReady && selectionMode && selectedCount === 0 && (
          <div
            className="vault-bulk-bar flex shrink-0 items-center justify-center gap-2 border-t border-stone-200/80 bg-stone-50/95 px-6 py-3 text-xs text-stone-500"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <CheckSquare className="h-3.5 w-3.5" />
            Tap takes to select, then save or delete
          </div>
        )}
    </AnimatedBottomSheet>
  )
}

export { useCapacitorVideoSrc } from '../hooks/useCapacitorVideoSrc'
