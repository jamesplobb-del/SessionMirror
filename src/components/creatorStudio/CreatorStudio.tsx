import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Crop, Scissors, Share2, Sparkles, Volume2, type LucideIcon } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useActionSheet } from '../../context/ActionSheetContext'
import { getTakeMediaType } from '../../utils/mediaType'
import { createInitialCreatorStudioState } from '../../creatorStudio/state'
import { renderCreatorStudioPreviewModel } from '../../creatorStudio/renderer'
import { exportCreatorStudioTake } from '../../creatorStudio/exporter'
import {
  bringCanvasObjectForward,
  createSheetMusicObject,
  createTextObject,
  removeCanvasObject,
  sendCanvasObjectBackward,
  updateCanvasObject,
} from '../../creatorStudio/canvasObjects'
import {
  createStudioAssetStorageKey,
  deleteStudioAssetBlob,
  loadStudioAssetBlob,
  saveBackingTrackBlob,
  saveCreatorStudioProject,
  saveStudioAssetBlob,
  toPersistedState,
} from '../../creatorStudio/projectStorage'
import { useCreatorStudioPlayback } from '../../hooks/useCreatorStudioPlayback'
import { useCreatorStudioBackingTrack } from '../../hooks/useCreatorStudioBackingTrack'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { formatTime } from '../../hooks/useVideoPlayback'
import CreatorStudioCanvas from './CreatorStudioCanvas'
import CreatorStudioAudioPanel from './CreatorStudioAudioPanel'
import type { Take } from '../../types'
import type {
  CreatorStudioAspectRatio,
  CreatorStudioEditorState,
  CreatorStudioTool,
  StudioSheetMusicObject,
} from '../../creatorStudio/types'

interface CreatorStudioProps {
  isOpen: boolean
  take: Take | null
  projectName?: string | null
  onClose: () => void
}

const TOOL_ITEMS: Array<{ id: CreatorStudioTool; label: string; icon: LucideIcon }> = [
  { id: 'trim', label: 'Trim', icon: Scissors },
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'export', label: 'Export', icon: Share2 },
]

const ASPECT_RATIOS: CreatorStudioAspectRatio[] = ['9:16', '1:1', '16:9']

function updateCreatorStudioState(
  setEditorState: Dispatch<SetStateAction<CreatorStudioEditorState | null>>,
  updater: (state: CreatorStudioEditorState) => CreatorStudioEditorState,
) {
  setEditorState((current) => (current ? updater(current) : current))
}

function describeExportFailure(reason: string): string {
  if (reason === 'missing_file') return 'This take could not be found on your device.'
  if (reason === 'unsupported') return 'This edit cannot be exported yet.'
  return 'The system share sheet could not be opened.'
}

export default function CreatorStudio({
  isOpen,
  take,
  projectName,
  onClose,
}: CreatorStudioProps) {
  const { showAlert } = useActionSheet()
  const [editorState, setEditorState] = useState<CreatorStudioEditorState | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [exporting, setExporting] = useState(false)
  const [panelTool, setPanelTool] = useState<CreatorStudioTool | null>(null)
  const trimRailRef = useRef<HTMLDivElement>(null)
  const sheetImportRef = useRef<HTMLInputElement>(null)
  const sheetReplaceIdRef = useRef<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    if (!isOpen || !take) return
    setEditorState(createInitialCreatorStudioState(take))
    setSelectedObjectId(null)
    setPanelTool(null)
  }, [isOpen, take])

  useEffect(() => {
    if (!editorState) return
    saveCreatorStudioProject(editorState.takeId, toPersistedState(editorState))
  }, [editorState])

  useEffect(() => {
    if (!editorState) return
    let cancelled = false

    const sheets = editorState.objects.filter(
      (object): object is StudioSheetMusicObject =>
        object.kind === 'sheetMusic' && !object.sourceUrl && !!object.storageKey,
    )

    if (sheets.length === 0) return

    void Promise.all(
      sheets.map(async (sheet) => {
        const blob = await loadStudioAssetBlob(sheet.storageKey)
        if (!blob || cancelled) return null
        const sourceUrl = URL.createObjectURL(blob)
        objectUrlsRef.current.push(sourceUrl)
        return { id: sheet.id, sourceUrl }
      }),
    ).then((restored) => {
      if (cancelled) return
      const valid = restored.filter(Boolean) as Array<{ id: string; sourceUrl: string }>
      if (valid.length === 0) return
      updateCreatorStudioState(setEditorState, (state) => ({
        ...state,
        objects: state.objects.map((object) => {
          if (object.kind !== 'sheetMusic') return object
          const match = valid.find((item) => item.id === object.id)
          return match ? { ...object, sourceUrl: match.sourceUrl } : object
        }),
      }))
    })

    return () => {
      cancelled = true
    }
  }, [editorState?.takeId])

  useEffect(() => {
    if (isOpen) return
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
    objectUrlsRef.current = []
    setSelectedObjectId(null)
  }, [isOpen])

  const previewModel = useMemo(
    () => (editorState ? renderCreatorStudioPreviewModel(editorState) : null),
    [editorState],
  )

  const {
    mediaRef,
    bindMediaRef,
    resolvedSrc,
    duration,
    currentTime,
    isPlaying,
    playheadPercent,
    togglePlayback,
    seekToPercent,
    formatTrimLabel,
  } = useCreatorStudioPlayback(
    take,
    isOpen,
    editorState?.trim ?? { start: 0, end: null },
    editorState?.audio ?? {
      source: 'original',
      instrumentVolume: 100,
      backingTrackVolume: 80,
      hasPracticeMix: false,
      hasAccompaniment: false,
      backingTrack: null,
    },
  )

  const {
    backingRef,
    backingSrc,
    backingDuration,
    backingPlayheadPercent,
    seekBackingToPercent,
  } = useCreatorStudioBackingTrack(
    isOpen,
    editorState?.audio.backingTrack ?? null,
    mediaRef,
    editorState?.audio.backingTrackVolume ?? 80,
    editorState?.audio.source === 'mute',
  )

  const waveformPeaks = useMediaWaveform({
    filePath: take?.filePath ?? '',
    mediaUrl: take?.videoUrl ?? '',
    barCount: 48,
  })

  const canvasEditMode = panelTool === null || panelTool === 'crop'

  const setSelectedTool = useCallback((selectedTool: CreatorStudioTool) => {
    setSelectedObjectId(null)
    setPanelTool((current) => (current === selectedTool ? null : selectedTool))
    updateCreatorStudioState(setEditorState, (state) => ({ ...state, selectedTool }))
  }, [])

  const handleImportSheetFile = useCallback(
    async (file: File) => {
      if (!take) return
      const storageKey = createStudioAssetStorageKey(take.id, 'sheet')
      try {
        await saveStudioAssetBlob(storageKey, file)
        const sourceUrl = URL.createObjectURL(file)
        objectUrlsRef.current.push(sourceUrl)
        const sheet = createSheetMusicObject(file, sourceUrl, storageKey)
        const replaceId = sheetReplaceIdRef.current
        sheetReplaceIdRef.current = null

        updateCreatorStudioState(setEditorState, (state) => {
          if (replaceId) {
            const old = state.objects.find(
              (object): object is StudioSheetMusicObject =>
                object.id === replaceId && object.kind === 'sheetMusic',
            )
            if (old) void deleteStudioAssetBlob(old.storageKey)
            return {
              ...state,
              objects: state.objects.map((object) =>
                object.id === replaceId ? { ...sheet, id: replaceId, transform: object.transform, displayMode: (object as StudioSheetMusicObject).displayMode, separateRatio: (object as StudioSheetMusicObject).separateRatio } : object,
              ),
            }
          }
          return { ...state, objects: [...state.objects, sheet] }
        })
        setSelectedObjectId(replaceId ?? sheet.id)
      } catch {
        await showAlert({ message: 'Could not import sheet music.', tone: 'error' })
      }
    },
    [showAlert, take],
  )

  const handleImportBacking = useCallback(
    async (file: File) => {
      if (!take) return
      const storageKey = createStudioAssetStorageKey(take.id, 'backing')
      try {
        await saveBackingTrackBlob(storageKey, file)
        updateCreatorStudioState(setEditorState, (state) => ({
          ...state,
          audio: {
            ...state.audio,
            backingTrack: {
              name: file.name,
              mimeType: file.type || 'audio/mpeg',
              storageKey,
              trim: { start: 0, end: null },
              syncOffsetMs: 0,
              volume: state.audio.backingTrackVolume,
            },
          },
        }))
      } catch {
        await showAlert({ message: 'Could not import backing track.', tone: 'error' })
      }
    },
    [showAlert, take],
  )

  const updateTrimEdgeFromClientX = useCallback(
    (edge: 'start' | 'end', clientX: number) => {
      const rail = trimRailRef.current
      if (!rail) return
      const rect = rail.getBoundingClientRect()
      const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
      let seekPercent = percent
      updateCreatorStudioState(setEditorState, (state) => {
        const currentEnd = state.trim.end ?? 100
        if (edge === 'start') {
          const start = Math.min(percent, currentEnd - 2)
          seekPercent = Math.max(0, start)
          return { ...state, trim: { ...state.trim, start: seekPercent } }
        }
        const end = Math.max(percent, state.trim.start + 2)
        seekPercent = Math.min(100, end)
        return { ...state, trim: { ...state.trim, end: seekPercent >= 99.5 ? null : seekPercent } }
      })
      seekToPercent(seekPercent)
    },
    [seekToPercent],
  )

  const handleTrimHandlePointerDown = useCallback(
    (edge: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      updateTrimEdgeFromClientX(edge, event.clientX)
      const onMove = (moveEvent: PointerEvent) => {
        if (!handle.hasPointerCapture(moveEvent.pointerId)) return
        updateTrimEdgeFromClientX(edge, moveEvent.clientX)
      }
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    },
    [updateTrimEdgeFromClientX],
  )

  const handleExport = useCallback(() => {
    if (!take || !editorState || exporting) return
    setExporting(true)
    void exportCreatorStudioTake(take, editorState)
      .then(async (result) => {
        if (!result.ok) {
          await showAlert({ message: describeExportFailure(result.reason), tone: 'error' })
        }
      })
      .finally(() => setExporting(false))
  }, [editorState, exporting, showAlert, take])

  const selectedObject = editorState?.objects.find((object) => object.id === selectedObjectId) ?? null

  useEffect(() => {
    if (selectedObject?.kind === 'text') setEditingText(selectedObject.text)
  }, [selectedObject])

  if (!isOpen || !take || !editorState || !previewModel) return null

  const trimStart = editorState.trim.start
  const trimEnd = editorState.trim.end ?? 100
  const isVideo = getTakeMediaType(take) === 'video'
  const showPanel = panelTool !== null

  return (
    <AnimatePresence>
      <motion.div className="creator-studio" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
        <audio ref={backingRef} className="creator-studio__media-audio" preload="metadata" />
        <input
          ref={sheetImportRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImportSheetFile(file)
            event.currentTarget.value = ''
          }}
        />

        <div className="creator-studio__chrome">
          <header className="creator-studio__header">
            <Pressable type="button" intensity="icon" haptic="light" className="creator-studio__nav-button" aria-label="Close Creator Studio" onClick={onClose}>
              <ChevronLeft className="h-5 w-5" />
            </Pressable>
            <div className="creator-studio__title-block">
              <p className="creator-studio__eyebrow"><Sparkles className="creator-studio__eyebrow-icon" aria-hidden />Creator Studio</p>
              <h2>{take.name}</h2>
              <p>{projectName || 'Current session'}</p>
            </div>
            <Pressable type="button" intensity="soft" haptic="success" className="creator-studio__export-button" disabled={exporting} onClick={handleExport}>
              <Share2 className="h-4 w-4" />
              {exporting ? 'Opening…' : 'Export'}
            </Pressable>
          </header>

          <main className={`creator-studio__body ${showPanel ? 'creator-studio__body--panel-open' : ''}`}>
            <CreatorStudioCanvas
              previewModel={previewModel}
              selectedObjectId={selectedObjectId}
              isVideo={isVideo}
              resolvedSrc={resolvedSrc}
              fallbackSrc={take.videoUrl}
              bindMediaRef={bindMediaRef}
              isPlaying={isPlaying}
              duration={duration}
              currentTime={currentTime}
              editMode={canvasEditMode}
              onSelectObject={setSelectedObjectId}
              onUpdateObject={(id, transform) =>
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: updateCanvasObject(state.objects, id, (object) => ({
                    ...object,
                    transform,
                  })),
                }))
              }
              onUpdateSheet={(id, patch) =>
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: updateCanvasObject(state.objects, id, (object) =>
                    object.kind === 'sheetMusic' ? { ...object, ...patch } : object,
                  ),
                }))
              }
              onTogglePlayback={togglePlayback}
              onAddText={() => {
                const text = createTextObject('Text')
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: [...state.objects, text],
                }))
                setSelectedObjectId(text.id)
                setEditingText('Text')
              }}
              onImportSheet={() => sheetImportRef.current?.click()}
              onEditText={() => {
                if (!selectedObjectId) return
                const next = window.prompt('Edit text', editingText)
                if (next === null) return
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: updateCanvasObject(state.objects, selectedObjectId, { text: next } as never),
                }))
              }}
              onToggleWatermark={() =>
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: updateCanvasObject(state.objects, 'watermark', (object) =>
                    object.kind === 'watermark' ? { ...object, visible: !object.visible } : object,
                  ),
                }))
              }
              onToggleSheetMode={() => {
                if (!selectedObjectId) return
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: updateCanvasObject(state.objects, selectedObjectId, (object) =>
                    object.kind === 'sheetMusic'
                      ? {
                          ...object,
                          displayMode: object.displayMode === 'overlay' ? 'separate' : 'overlay',
                        }
                      : object,
                  ),
                }))
              }}
              onReplaceSheet={() => {
                sheetReplaceIdRef.current = selectedObjectId
                sheetImportRef.current?.click()
              }}
              onCropRecording={() => {
                setPanelTool('crop')
                updateCreatorStudioState(setEditorState, (state) => ({ ...state, selectedTool: 'crop' }))
              }}
              onBringForward={() => {
                if (!selectedObjectId) return
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: bringCanvasObjectForward(state.objects, selectedObjectId),
                }))
              }}
              onSendBackward={() => {
                if (!selectedObjectId) return
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: sendCanvasObjectBackward(state.objects, selectedObjectId),
                }))
              }}
              onDeleteObject={() => {
                if (!selectedObjectId) return
                const target = editorState.objects.find((object) => object.id === selectedObjectId)
                if (target?.kind === 'sheetMusic') void deleteStudioAssetBlob(target.storageKey)
                updateCreatorStudioState(setEditorState, (state) => ({
                  ...state,
                  objects: removeCanvasObject(state.objects, selectedObjectId),
                }))
                setSelectedObjectId(null)
              }}
            />

            {showPanel && (
              <section className="creator-studio__panel" aria-label={`${panelTool} tools`}>
                {panelTool === 'trim' && (
                  <div className="creator-studio__panel-content">
                    <div className="creator-studio__panel-heading">
                      <div className="creator-studio__panel-icon creator-studio__panel-icon--gold"><Scissors className="h-4 w-4" /></div>
                      <div><h3>Trim</h3><p>Drag handles on the waveform rail.</p></div>
                    </div>
                    <div className="creator-studio__trim-editor">
                      <div ref={trimRailRef} className="creator-studio__trim-rail" onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest('.creator-studio__trim-handle')) return
                        const rect = event.currentTarget.getBoundingClientRect()
                        seekToPercent(((event.clientX - rect.left) / rect.width) * 100)
                      }}>
                        <div className="creator-studio__trim-waveform" aria-hidden>
                          {waveformPeaks.map((peak, index) => <span key={index} style={{ height: `${Math.round(peak * 100)}%` }} />)}
                        </div>
                        <div className="creator-studio__trim-dim creator-studio__trim-dim--left" style={{ width: `${trimStart}%` }} />
                        <div className="creator-studio__trim-dim creator-studio__trim-dim--right" style={{ width: `${100 - trimEnd}%` }} />
                        <div className="creator-studio__trim-selection" style={{ left: `${trimStart}%`, width: `${trimEnd - trimStart}%` }} />
                        <div className="creator-studio__trim-playhead" style={{ left: `${playheadPercent}%` }} />
                        <button type="button" className="creator-studio__trim-handle creator-studio__trim-handle--start" style={{ left: `${trimStart}%` }} aria-label="Trim start" onPointerDown={(e) => handleTrimHandlePointerDown('start', e)} />
                        <button type="button" className="creator-studio__trim-handle creator-studio__trim-handle--end" style={{ left: `${trimEnd}%` }} aria-label="Trim end" onPointerDown={(e) => handleTrimHandlePointerDown('end', e)} />
                      </div>
                      <div className="creator-studio__trim-meta">
                        <span><strong>Start</strong> {formatTrimLabel(trimStart)}</span>
                        <span className="creator-studio__trim-duration">{formatTime(Math.max(0, (duration * (trimEnd - trimStart)) / 100))} selected</span>
                        <span><strong>End</strong> {editorState.trim.end === null ? formatTime(duration) : formatTrimLabel(trimEnd)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {panelTool === 'crop' && (
                  <div className="creator-studio__panel-content">
                    <div className="creator-studio__panel-heading">
                      <div className="creator-studio__panel-icon creator-studio__panel-icon--blue"><Crop className="h-4 w-4" /></div>
                      <div><h3>Aspect Ratio</h3><p>Export frame ratio for your practice video.</p></div>
                    </div>
                    <div className="creator-studio__choice-grid">
                      {ASPECT_RATIOS.map((ratio) => (
                        <Pressable key={ratio} type="button" intensity="soft" haptic="light" className={`creator-studio__choice ${editorState.aspectRatio === ratio ? 'is-selected' : ''}`} onClick={() => updateCreatorStudioState(setEditorState, (state) => ({ ...state, aspectRatio: ratio }))}>
                          {ratio}
                        </Pressable>
                      ))}
                    </div>
                  </div>
                )}

                {panelTool === 'audio' && (
                  <CreatorStudioAudioPanel
                    editorState={editorState}
                    backingSrc={backingSrc}
                    backingDuration={backingDuration}
                    backingPlayheadPercent={backingPlayheadPercent}
                    onSourceChange={(source) => updateCreatorStudioState(setEditorState, (state) => ({ ...state, audio: { ...state.audio, source } }))}
                    onInstrumentVolumeChange={(instrumentVolume) => updateCreatorStudioState(setEditorState, (state) => ({ ...state, audio: { ...state.audio, instrumentVolume } }))}
                    onBackingVolumeChange={(backingTrackVolume) => updateCreatorStudioState(setEditorState, (state) => ({ ...state, audio: { ...state.audio, backingTrackVolume } }))}
                    onSyncOffsetChange={(syncOffsetMs) => updateCreatorStudioState(setEditorState, (state) => ({ ...state, audio: { ...state.audio, backingTrack: state.audio.backingTrack ? { ...state.audio.backingTrack, syncOffsetMs } : null } }))}
                    onImportBacking={handleImportBacking}
                    onRemoveBacking={() => {
                      const key = editorState.audio.backingTrack?.storageKey
                      if (key) void deleteStudioAssetBlob(key)
                      updateCreatorStudioState(setEditorState, (state) => ({ ...state, audio: { ...state.audio, backingTrack: null } }))
                    }}
                    onBackingTrimChange={(edge, percent) =>
                      updateCreatorStudioState(setEditorState, (state) => {
                        const track = state.audio.backingTrack
                        if (!track) return state
                        const currentEnd = track.trim.end ?? 100
                        if (edge === 'start') {
                          return { ...state, audio: { ...state.audio, backingTrack: { ...track, trim: { ...track.trim, start: Math.min(percent, currentEnd - 2) } } } }
                        }
                        const end = Math.max(percent, track.trim.start + 2)
                        return { ...state, audio: { ...state.audio, backingTrack: { ...track, trim: { ...track.trim, end: end >= 99.5 ? null : end } } } }
                      })
                    }
                    onBackingSeek={seekBackingToPercent}
                  />
                )}

                {panelTool === 'export' && (
                  <div className="creator-studio__panel-content">
                    <div className="creator-studio__panel-heading">
                      <div className="creator-studio__panel-icon creator-studio__panel-icon--blue"><Share2 className="h-4 w-4" /></div>
                      <div><h3>Export</h3><p>Share your practice video via the iOS share sheet.</p></div>
                    </div>
                    <Pressable type="button" intensity="normal" haptic="success" disabled={exporting} className="creator-studio__primary-action" onClick={handleExport}>
                      <Share2 className="h-4 w-4" />
                      {exporting ? 'Opening Share Sheet…' : 'Open Share Sheet'}
                    </Pressable>
                  </div>
                )}
              </section>
            )}
          </main>

          <nav className="creator-studio__toolbar" aria-label="Creator Studio tools">
            {TOOL_ITEMS.map((tool) => {
              const Icon = tool.icon
              const selected = panelTool === tool.id
              return (
                <Pressable key={tool.id} type="button" intensity="icon" haptic="light" className={`creator-studio__tool-button ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => setSelectedTool(tool.id)}>
                  <Icon className="h-4 w-4" />
                  <span>{tool.label}</span>
                </Pressable>
              )
            })}
          </nav>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
