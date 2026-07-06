import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { CheckSquare, Download, Search, Trash2, X } from 'lucide-react'
import TakeCard from './TakeCard'
import GallerySortStrip from './GallerySortStrip'
import VaultMediaSegment from './VaultMediaSegment'
import VaultSectionTabs, { type VaultSection } from './VaultSectionTabs'
import LibraryTab from './LibraryTab'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import { VaultDrawerSkeleton } from './ui/DrawerSkeletons'
import Pressable from './ui/Pressable'
import { resetVideosInContainer, teardownVideosInContainer } from '../utils/videoPlayback'
import { scheduleAfterPaint } from '../utils/scheduleDeferred'
import { useDeferredDrawerContent } from '../hooks/useDeferredDrawerContent'
import ProjectSessionBar from './ProjectSessionBar'
import { useActionSheet } from '../context/ActionSheetContext'
import { describeSaveTakeResult, describeBulkSaveResult, shareTakeVideo, shareTakeVideos } from '../utils/shareTakeVideo'
import { getTakeMediaType } from '../utils/mediaType'
import type { SortMode, Take, TakeUpdate } from '../types'
import type { VaultMediaFilter } from './VaultMediaSegment'
import type { BenchmarkBinding } from '../types/library'
import type { Project } from '../db/types'
import type { HydratedLibraryItem } from '../utils/libraryBridge'

interface TakeVaultDrawerProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  activeProject: Project | null
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string) => void | Promise<void>
  onDeleteProject?: (projectId: string) => void | Promise<void>
  takes: Take[]
  sortedTakes: Take[]
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  benchmarkId: string | null
  benchmarkBinding: BenchmarkBinding | null
  challengerId: string | null
  libraryItems: HydratedLibraryItem[]
  onImportLibraryAudio: (file: File) => void
  onRenameLibraryItem: (itemId: string, name: string) => void
  onDeleteLibraryItem: (itemId: string) => void
  onSetLibraryReference: (itemId: string) => void
  onPinBenchmark: (id: string) => void
  onPinChallenger: (id: string) => void
  onBeforePin?: () => void
  onUpdateTake: (id: string, updates: TakeUpdate) => void
  onDeleteTake: (id: string) => void
  onDeleteTakes: (ids: string[]) => void
  onClearAllTakes: () => void
  onOpenTake: (take: Take) => void
  onCreateTake?: (take: Take) => void
  onBeforeExport?: () => void
  preferredMediaFilter?: VaultMediaFilter
  recordingMode?: 'video' | 'audio'
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
  onDeleteProject,
  takes,
  sortedTakes,
  sortMode,
  onSortChange,
  benchmarkId,
  benchmarkBinding,
  challengerId,
  libraryItems,
  onImportLibraryAudio,
  onRenameLibraryItem,
  onDeleteLibraryItem,
  onSetLibraryReference,
  onPinBenchmark,
  onPinChallenger,
  onBeforePin,
  onUpdateTake,
  onDeleteTake,
  onDeleteTakes,
  onClearAllTakes,
  onOpenTake,
  onCreateTake,
  onBeforeExport,
  preferredMediaFilter = 'all',
  recordingMode: _recordingMode = 'video',
  onEnterComplete,
}: TakeVaultDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const { showAlert, showConfirm } = useActionSheet()
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)
  const [vaultSection, setVaultSection] = useState<VaultSection>('takes')
  const [vaultMediaTab, setVaultMediaTab] = useState<VaultMediaFilter>('all')
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [exportingTakeId, setExportingTakeId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [detailTakeId, setDetailTakeId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setDetailTakeId(null)
    }
  }, [isOpen])

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
  const vaultBenchmarkTakeId =
    benchmarkBinding?.source === 'take' ? benchmarkBinding.refId : benchmarkId
  const bestCount = useMemo(
    () =>
      contentReady && vaultBenchmarkTakeId
        ? takes.filter((take) => take.id === vaultBenchmarkTakeId).length
        : 0,
    [contentReady, takes, vaultBenchmarkTakeId],
  )
  const filteredTakes = useMemo(
    () => {
      if (!contentReady) return []
      let list = sortedTakes
      if (vaultMediaTab === 'best') {
        list = vaultBenchmarkTakeId
          ? sortedTakes.filter((take) => take.id === vaultBenchmarkTakeId)
          : []
      } else if (vaultMediaTab !== 'all') {
        list = sortedTakes.filter((take) => getTakeMediaType(take) === vaultMediaTab)
      }

      const query = searchQuery.trim().toLowerCase()
      if (!query) return list
      return list.filter(
        (take) =>
          take.name.toLowerCase().includes(query) ||
          take.notes.toLowerCase().includes(query),
      )
    },
    [contentReady, searchQuery, sortedTakes, vaultBenchmarkTakeId, vaultMediaTab],
  )
  const takeCountLabel = `${takes.length} take${takes.length === 1 ? '' : 's'}`

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
    setVaultSection('takes')
    setSearchOpen(false)
    setSearchQuery('')
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setVaultSection('takes')
    setVaultMediaTab(preferredMediaFilter)
  }, [isOpen, preferredMediaFilter])

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
      .then(async (result) => {
        const message = describeBulkSaveResult(result)
        if (message) {
          await showAlert({
            message,
            tone: result.failed > 0 ? 'error' : 'success',
          })
        }
      })
      .finally(() => {
        setBulkSaving(false)
      })
  }, [onBeforeExport, selectedIds, showAlert, silenceAllVaultVideos, takes])

  const handleBulkDelete = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return

    void (async () => {
      const confirmed = await showConfirm({
        message: `Delete ${ids.length} selected take${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
        destructive: true,
        confirmLabel: 'Delete',
      })
      if (!confirmed) return

      silenceAllVaultVideos()
      onDeleteTakes(ids)
      exitSelectionMode()
    })()
  }, [exitSelectionMode, onDeleteTakes, selectedIds, showConfirm, silenceAllVaultVideos])

  const handleClearAll = useCallback(() => {
    if (takes.length === 0) return
    const sessionName = activeProject?.name ?? 'this session'

    void (async () => {
      const confirmed = await showConfirm({
        message: `Delete all ${takes.length} takes in "${sessionName}"? This cannot be undone.`,
        destructive: true,
        confirmLabel: 'Delete All',
      })
      if (!confirmed) return

      onClearAllTakes()
      exitSelectionMode()

      window.requestAnimationFrame(() => {
        teardownVideosInContainer(drawerRef.current)
      })
    })()
  }, [activeProject?.name, exitSelectionMode, onClearAllTakes, showConfirm, takes.length])

  useEffect(() => {
    return () => {
      teardownVideosInContainer(drawerRef.current)
    }
  }, [])

  const takeIndexById = useMemo(() => {
    const map = new Map<string, number>()
    sortedTakes.forEach((take, index) => {
      map.set(take.id, index)
    })
    return map
  }, [sortedTakes])

  const handleCloseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      onClose()
    },
    [onClose],
  )

  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Take Vault"
      maxHeightClass="h-[min(82vh,100dvh)]"
      sheetRef={drawerRef}
      motionPreset="premium"
      elevated
      vaultTheme
      onEnterComplete={handleSheetEnterComplete}
    >
        <div className="native-sheet-header vault-sheet-header sticky top-0 z-20 flex shrink-0 flex-col gap-3 border-b px-5 pb-4 pt-5">
          <div className="vault-header-main flex items-start justify-between gap-4 pr-0.5">
            <div className="native-sheet-title-block min-w-0 flex-1">
              <h2 className="native-sheet-title">Take Vault</h2>
              <p className="native-sheet-subtitle">
                {selectionMode
                  ? `${selectedCount} selected`
                  : activeProject
                    ? `${takeCountLabel} • ${activeProject.name}`
                    : `${takeCountLabel} • Current session`}
              </p>
            </div>
            <div className="native-sheet-actions relative z-30 flex shrink-0 items-center gap-1" data-tutorial="vault-settings">
              <Pressable
                type="button"
                intensity="icon"
                onClick={() => {
                  setSearchOpen((open) => !open)
                  if (searchOpen) setSearchQuery('')
                }}
                haptic="light"
                className={`vault-header-icon-btn ${searchOpen ? 'vault-header-icon-btn--active' : ''}`}
                aria-label={searchOpen ? 'Close search' : 'Search takes'}
              >
                <Search className="h-4 w-4" />
              </Pressable>
              <Pressable
                type="button"
                intensity="icon"
                onClick={handleCloseClick}
                haptic="light"
                data-tutorial="vault-close"
                className="vault-header-icon-btn"
                aria-label="Close vault"
              >
                <X className="h-4 w-4" />
              </Pressable>
            </div>
          </div>
          {contentReady && vaultSection === 'takes' && (
            <div className="vault-header-command-row">
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => {
                  if (selectionMode) exitSelectionMode()
                  else setSelectionMode(true)
                }}
                haptic="light"
                className={`vault-header-action-btn ${selectionMode ? 'vault-header-action-btn--active' : ''}`}
                aria-pressed={selectionMode}
              >
                {selectionMode ? 'Cancel' : 'Select'}
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                disabled={!selectionMode || selectedCount === 0}
                onClick={handleBulkDelete}
                haptic="light"
                className="vault-header-action-btn vault-header-action-btn--danger"
                aria-label="Delete selected takes"
              >
                Delete
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                disabled={takes.length === 0}
                onClick={handleClearAll}
                haptic="light"
                className="vault-header-action-btn vault-header-action-btn--danger"
                aria-label="Clear all takes"
              >
                Clear all
              </Pressable>
            </div>
          )}
          {searchOpen && (
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search takes…"
              className="vault-search-input"
              aria-label="Search takes"
              autoFocus
            />
          )}
        </div>

        <div className="vault-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
          {!contentReady ? (
            <VaultDrawerSkeleton />
          ) : (
            <div className="vault-library-shell space-y-4">
          <ProjectSessionBar
            className="vault-session-bar"
            projects={projects}
            activeProjectId={activeProject?.id ?? null}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
            onDeleteProject={onDeleteProject}
          />
          <VaultSectionTabs
            value={vaultSection}
            onChange={setVaultSection}
            takesCount={takes.length}
            libraryCount={libraryItems.length}
          />
          {vaultSection === 'library' ? (
            <LibraryTab
              items={libraryItems}
              benchmarkBinding={benchmarkBinding}
              onImportAudio={onImportLibraryAudio}
              onRenameItem={onRenameLibraryItem}
              onDeleteItem={onDeleteLibraryItem}
              onSetAsReference={onSetLibraryReference}
            />
          ) : takes.length === 0 ? (
            <div className="vault-empty-state flex min-h-52 flex-col items-center justify-center rounded-[1.75rem] px-6 py-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
                <CheckSquare className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-stone-950">No takes yet</p>
              <p className="mt-1 text-sm leading-relaxed text-stone-500">
                Record a take to start comparing.
              </p>
            </div>
          ) : (
            <>
              <VaultMediaSegment
                value={vaultMediaTab}
                onChange={setVaultMediaTab}
                allCount={takes.length}
                videoCount={videoCount}
                audioCount={audioCount}
                bestCount={bestCount}
              />
              {filteredTakes.length === 0 ? (
                <div className="vault-empty-state flex min-h-44 flex-col items-center justify-center rounded-[1.75rem] border-dashed px-6 py-8 text-center">
                  <p className="text-base font-semibold text-stone-900">No takes here</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {searchQuery.trim()
                      ? 'No takes match your search.'
                      : vaultMediaTab === 'best'
                        ? 'Mark a take as Best to see it here.'
                        : `No ${vaultMediaTab} takes yet.`}
                  </p>
                </div>
              ) : (
                <>
                  <div className="vault-section-toolbar flex items-center justify-between gap-3">
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
                        haptic="light"
                        className="min-h-10 shrink-0 rounded-xl border border-stone-200 bg-white/80 px-3 text-xs font-semibold text-stone-700 hover:bg-white"
                      >
                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                      </Pressable>
                    )}
                  </div>
                  <div className="vault-take-list">
                    {filteredTakes.map((take) => (
                      <TakeCard
                        key={take.id}
                        take={take}
                        takeIndex={takeIndexById.get(take.id) ?? 0}
                        isBenchmark={take.id === vaultBenchmarkTakeId}
                        isChallenger={take.id === challengerId}
                        detailOpen={detailTakeId === take.id}
                        onToggleDetail={() =>
                          setDetailTakeId((current) => (current === take.id ? null : take.id))
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
                                  .then(async (result) => {
                                    const message = describeSaveTakeResult(result)
                                    if (message) {
                                      await showAlert({
                                        message,
                                        tone: result.ok ? 'success' : 'error',
                                      })
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
                        onCreate={
                          !selectionMode && getTakeMediaType(take) === 'video' && onCreateTake
                            ? () => {
                                silenceAllVaultVideos()
                                onBeforeExport?.()
                                onCreateTake(take)
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
            </div>
          )}
        </div>

        {contentReady && vaultSection === 'takes' && selectionMode && selectedCount > 0 && (
          <div
            className="vault-bulk-bar flex shrink-0 gap-2 border-t border-stone-200/80 bg-white/95 px-6 py-3"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <Pressable
              type="button"
              intensity="soft"
              disabled={bulkSaving}
              onClick={handleBulkSave}
              haptic="medium"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {bulkSaving ? 'Saving…' : `Save (${selectedCount})`}
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              onClick={handleBulkDelete}
              haptic="light"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selectedCount})
            </Pressable>
          </div>
        )}

        {contentReady && vaultSection === 'takes' && selectionMode && selectedCount === 0 && (
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
