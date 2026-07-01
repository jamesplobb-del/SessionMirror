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
import {
  ChevronLeft,
  Crop,
  FileImage,
  Music2,
  Pause,
  Play,
  Scissors,
  Share2,
  Sparkles,
  Type,
  Upload,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useActionSheet } from '../../context/ActionSheetContext'
import { getTakeMediaType } from '../../utils/mediaType'
import { createInitialCreatorStudioState } from '../../creatorStudio/state'
import { renderCreatorStudioPreviewModel } from '../../creatorStudio/renderer'
import { exportCreatorStudioTake } from '../../creatorStudio/exporter'
import { useCreatorStudioPlayback } from '../../hooks/useCreatorStudioPlayback'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { formatTime } from '../../hooks/useVideoPlayback'
import type { Take } from '../../types'
import type {
  CreatorStudioAspectRatio,
  CreatorStudioAudioSource,
  CreatorStudioEditorState,
  CreatorStudioTool,
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
  { id: 'overlay', label: 'Overlay', icon: Type },
  { id: 'export', label: 'Export', icon: Share2 },
]

const ASPECT_RATIOS: CreatorStudioAspectRatio[] = ['9:16', '1:1', '16:9']

const AUDIO_SOURCES: Array<{ id: CreatorStudioAudioSource; label: string }> = [
  { id: 'original', label: 'Original audio' },
  { id: 'mute', label: 'Mute' },
]

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
  const [exporting, setExporting] = useState(false)
  const trimRailRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    if (!isOpen || !take) return
    setEditorState(createInitialCreatorStudioState(take))
  }, [isOpen, take])

  useEffect(() => {
    if (isOpen) return
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    objectUrlsRef.current = []
  }, [isOpen])

  const previewModel = useMemo(
    () => (editorState ? renderCreatorStudioPreviewModel(editorState) : null),
    [editorState],
  )

  const {
    mediaRef,
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
    },
  )

  const waveformPeaks = useMediaWaveform({
    filePath: take?.filePath ?? '',
    mediaUrl: take?.videoUrl ?? '',
    barCount: 48,
  })

  const setSelectedTool = useCallback((selectedTool: CreatorStudioTool) => {
    updateCreatorStudioState(setEditorState, (state) => ({ ...state, selectedTool }))
  }, [])

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
        return {
          ...state,
          trim: {
            ...state.trim,
            end: seekPercent >= 99.5 ? null : seekPercent,
          },
        }
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

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!handle.hasPointerCapture(moveEvent.pointerId)) return
        updateTrimEdgeFromClientX(edge, moveEvent.clientX)
      }
      const handlePointerUp = (upEvent: PointerEvent) => {
        if (handle.hasPointerCapture(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId)
        }
        handle.removeEventListener('pointermove', handlePointerMove)
        handle.removeEventListener('pointerup', handlePointerUp)
      }

      handle.addEventListener('pointermove', handlePointerMove)
      handle.addEventListener('pointerup', handlePointerUp)
    },
    [updateTrimEdgeFromClientX],
  )

  const handleTrimRailScrub = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if ((event.target as HTMLElement).closest('.creator-studio__trim-handle')) return

      const rail = trimRailRef.current
      if (!rail) return

      const scrub = (clientX: number) => {
        const rect = rail.getBoundingClientRect()
        const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
        seekToPercent(percent)
      }

      event.preventDefault()
      event.stopPropagation()
      scrub(event.clientX)
      event.currentTarget.setPointerCapture(event.pointerId)

      const onMove = (moveEvent: PointerEvent) => {
        if (!event.currentTarget.hasPointerCapture(moveEvent.pointerId)) return
        scrub(moveEvent.clientX)
      }
      const onUp = (upEvent: PointerEvent) => {
        if (event.currentTarget.hasPointerCapture(upEvent.pointerId)) {
          event.currentTarget.releasePointerCapture(upEvent.pointerId)
        }
        event.currentTarget.removeEventListener('pointermove', onMove)
        event.currentTarget.removeEventListener('pointerup', onUp)
      }

      event.currentTarget.addEventListener('pointermove', onMove)
      event.currentTarget.addEventListener('pointerup', onUp)
    },
    [seekToPercent],
  )

  const handleExport = useCallback(() => {
    if (!take || !editorState || exporting) return

    setExporting(true)
    void exportCreatorStudioTake(take, editorState)
      .then(async (result) => {
        if (!result.ok) {
          await showAlert({
            message: describeExportFailure(result.reason),
            tone: 'error',
          })
        }
      })
      .finally(() => setExporting(false))
  }, [editorState, exporting, showAlert, take])

  const handleImportSheetMusic = useCallback((file: File) => {
    const sourceUrl = URL.createObjectURL(file)
    objectUrlsRef.current.push(sourceUrl)
    const fileType = file.type === 'application/pdf' ? 'pdf' : 'image'
    updateCreatorStudioState(setEditorState, (state) => ({
      ...state,
      sheetMusicLayers: [
        ...state.sheetMusicLayers,
        {
          id: `sheet-${Date.now()}`,
          name: file.name,
          fileType,
          sourceUrl,
          enabled: true,
          position: { x: 50, y: 52 },
          scale: 1,
        },
      ],
    }))
  }, [])

  if (!isOpen || !take || !editorState || !previewModel) {
    return null
  }

  const isVideo = getTakeMediaType(take) === 'video'
  const trimStart = editorState.trim.start
  const trimEnd = editorState.trim.end ?? 100

  return (
    <AnimatePresence>
      <motion.div
        className="creator-studio"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="creator-studio__chrome">
          <header className="creator-studio__header">
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              className="creator-studio__nav-button"
              aria-label="Close Creator Studio"
              onClick={onClose}
            >
              <ChevronLeft className="h-5 w-5" />
            </Pressable>
            <div className="creator-studio__title-block">
              <p className="creator-studio__eyebrow">
                <Sparkles className="creator-studio__eyebrow-icon" aria-hidden />
                Creator Studio
              </p>
              <h2>{take.name}</h2>
              <p>{projectName || 'Current session'}</p>
            </div>
            <Pressable
              type="button"
              intensity="soft"
              haptic="success"
              className="creator-studio__export-button"
              disabled={exporting}
              onClick={handleExport}
            >
              <Share2 className="h-4 w-4" />
              {exporting ? 'Opening…' : 'Export'}
            </Pressable>
          </header>

          <main className="creator-studio__body">
            <section
              className={`creator-studio__preview creator-studio__preview--${previewModel.aspectRatio.replace(':', '-')}`}
              aria-label="Creator Studio live preview"
            >
              <div className="creator-studio__preview-stage">
                {isVideo && resolvedSrc ? (
                  <>
                    <video
                      ref={mediaRef as React.RefObject<HTMLVideoElement>}
                      className="creator-studio__media"
                      playsInline
                      preload="metadata"
                      onClick={togglePlayback}
                    />
                    <Pressable
                      type="button"
                      intensity="icon"
                      haptic="medium"
                      className={`creator-studio__preview-play ${isPlaying ? 'is-playing' : ''}`}
                      aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                      onClick={(event) => {
                        event.stopPropagation()
                        togglePlayback()
                      }}
                    >
                      {isPlaying ? (
                        <Pause className="h-7 w-7 fill-current" />
                      ) : (
                        <Play className="h-7 w-7 fill-current" />
                      )}
                    </Pressable>
                  </>
                ) : !isVideo && resolvedSrc ? (
                  <>
                    <audio
                      ref={mediaRef as React.RefObject<HTMLAudioElement>}
                      className="creator-studio__media-audio"
                      preload="metadata"
                    />
                    <div className="creator-studio__audio-preview">
                      <div className="creator-studio__audio-ring" aria-hidden>
                        <Music2 className="h-10 w-10" />
                      </div>
                      <p>{take.name}</p>
                      <Pressable
                        type="button"
                        intensity="icon"
                        haptic="medium"
                        className="creator-studio__audio-play"
                        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                        onClick={togglePlayback}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5 fill-current" />
                        ) : (
                          <Play className="h-5 w-5 fill-current" />
                        )}
                      </Pressable>
                    </div>
                  </>
                ) : (
                  <div className="creator-studio__audio-preview">
                    <Music2 className="h-12 w-12" />
                    <p>{take.name}</p>
                  </div>
                )}
                {previewModel.sheetMusicLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className="creator-studio__sheet-layer"
                    style={{
                      left: `${layer.position.x}%`,
                      top: `${layer.position.y}%`,
                      transform: `translate(-50%, -50%) scale(${layer.scale})`,
                    }}
                  >
                    {layer.fileType === 'image' ? (
                      <img src={layer.sourceUrl} alt="" />
                    ) : (
                      <object data={layer.sourceUrl} type="application/pdf" aria-label={layer.name}>
                        <FileImage className="h-7 w-7" />
                        <span>{layer.name}</span>
                      </object>
                    )}
                  </div>
                ))}
                {previewModel.overlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className={`creator-studio__overlay creator-studio__overlay--${overlay.kind}`}
                    style={{ left: `${overlay.position.x}%`, top: `${overlay.position.y}%` }}
                  >
                    {overlay.text}
                  </div>
                ))}
              </div>
              {duration > 0 && (
                <p className="creator-studio__preview-time" aria-live="polite">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              )}
            </section>

            <section className="creator-studio__panel" aria-label={`${editorState.selectedTool} tools`}>
              {editorState.selectedTool === 'trim' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <div className="creator-studio__panel-icon creator-studio__panel-icon--gold">
                      <Scissors className="h-4 w-4" />
                    </div>
                    <div>
                      <h3>Trim</h3>
                      <p>Set start and end points. Playback stays within your selection.</p>
                    </div>
                  </div>
                  <div className="creator-studio__trim-editor">
                    <div
                      ref={trimRailRef}
                      className="creator-studio__trim-rail"
                      onPointerDown={handleTrimRailScrub}
                    >
                      <div className="creator-studio__trim-waveform" aria-hidden>
                        {waveformPeaks.map((peak, index) => (
                          <span
                            key={index}
                            style={{ height: `${Math.round(peak * 100)}%` }}
                          />
                        ))}
                      </div>
                      <div
                        className="creator-studio__trim-dim creator-studio__trim-dim--left"
                        style={{ width: `${trimStart}%` }}
                      />
                      <div
                        className="creator-studio__trim-dim creator-studio__trim-dim--right"
                        style={{ width: `${100 - trimEnd}%` }}
                      />
                      <div
                        className="creator-studio__trim-selection"
                        style={{ left: `${trimStart}%`, width: `${trimEnd - trimStart}%` }}
                      />
                      <div
                        className="creator-studio__trim-playhead"
                        style={{ left: `${playheadPercent}%` }}
                      />
                      <button
                        type="button"
                        className="creator-studio__trim-handle creator-studio__trim-handle--start"
                        style={{ left: `${trimStart}%` }}
                        aria-label="Trim start"
                        onPointerDown={(event) => handleTrimHandlePointerDown('start', event)}
                      />
                      <button
                        type="button"
                        className="creator-studio__trim-handle creator-studio__trim-handle--end"
                        style={{ left: `${trimEnd}%` }}
                        aria-label="Trim end"
                        onPointerDown={(event) => handleTrimHandlePointerDown('end', event)}
                      />
                    </div>
                    <div className="creator-studio__trim-meta">
                      <span>
                        <strong>Start</strong> {formatTrimLabel(trimStart)}
                      </span>
                      <span className="creator-studio__trim-duration">
                        {formatTime(Math.max(0, (duration * (trimEnd - trimStart)) / 100))} selected
                      </span>
                      <span>
                        <strong>End</strong>{' '}
                        {editorState.trim.end === null ? formatTime(duration) : formatTrimLabel(trimEnd)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {editorState.selectedTool === 'crop' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <div className="creator-studio__panel-icon creator-studio__panel-icon--blue">
                      <Crop className="h-4 w-4" />
                    </div>
                    <div>
                      <h3>Aspect Ratio</h3>
                      <p>Social-ready crops for musicians.</p>
                    </div>
                  </div>
                  <div className="creator-studio__choice-grid">
                    {ASPECT_RATIOS.map((ratio) => (
                      <Pressable
                        key={ratio}
                        type="button"
                        intensity="soft"
                        haptic="light"
                        className={`creator-studio__choice ${editorState.aspectRatio === ratio ? 'is-selected' : ''}`}
                        onClick={() =>
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            aspectRatio: ratio,
                          }))
                        }
                      >
                        {ratio}
                      </Pressable>
                    ))}
                  </div>
                </div>
              )}

              {editorState.selectedTool === 'audio' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <div className="creator-studio__panel-icon creator-studio__panel-icon--blue">
                      <Volume2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3>Audio</h3>
                      <p>Volume and mute for preview playback.</p>
                    </div>
                  </div>
                  <div className="creator-studio__choice-list">
                    {AUDIO_SOURCES.map((source) => (
                      <Pressable
                        key={source.id}
                        type="button"
                        intensity="soft"
                        haptic="light"
                        className={`creator-studio__choice creator-studio__choice--wide ${
                          editorState.audio.source === source.id ? 'is-selected' : ''
                        }`}
                        onClick={() =>
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            audio: { ...state.audio, source: source.id },
                          }))
                        }
                      >
                        {source.label}
                      </Pressable>
                    ))}
                  </div>
                  <div className="creator-studio__range-row">
                    <label>
                      <span>Volume</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={editorState.audio.instrumentVolume}
                        disabled={editorState.audio.source === 'mute'}
                        onChange={(event) =>
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            audio: {
                              ...state.audio,
                              instrumentVolume: Number(event.target.value),
                            },
                          }))
                        }
                      />
                      <em>{editorState.audio.instrumentVolume}%</em>
                    </label>
                  </div>
                </div>
              )}

              {editorState.selectedTool === 'overlay' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <div className="creator-studio__panel-icon creator-studio__panel-icon--gold">
                      <Type className="h-4 w-4" />
                    </div>
                    <div>
                      <h3>Overlays</h3>
                      <p>Title, date, instrument, watermark, and sheet music.</p>
                    </div>
                  </div>
                  <div className="creator-studio__overlay-list">
                    {editorState.overlays.map((overlay) => (
                      <div key={overlay.id} className="creator-studio__overlay-control">
                        <label>
                          <input
                            type="checkbox"
                            checked={overlay.enabled}
                            onChange={(event) =>
                              updateCreatorStudioState(setEditorState, (state) => ({
                                ...state,
                                overlays: state.overlays.map((item) =>
                                  item.id === overlay.id
                                    ? { ...item, enabled: event.target.checked }
                                    : item,
                                ),
                              }))
                            }
                          />
                          <span>{overlay.label}</span>
                        </label>
                        <input
                          type="text"
                          value={overlay.text}
                          aria-label={`${overlay.label} text`}
                          onChange={(event) =>
                            updateCreatorStudioState(setEditorState, (state) => ({
                              ...state,
                              overlays: state.overlays.map((item) =>
                                item.id === overlay.id
                                  ? { ...item, text: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) handleImportSheetMusic(file)
                      event.currentTarget.value = ''
                    }}
                  />
                  <Pressable
                    type="button"
                    intensity="soft"
                    haptic="light"
                    className="creator-studio__import-button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Add Sheet Music
                  </Pressable>
                </div>
              )}

              {editorState.selectedTool === 'export' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <div className="creator-studio__panel-icon creator-studio__panel-icon--blue">
                      <Share2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3>Export</h3>
                      <p>Share to Reels, Shorts, Messages, Files, or AirDrop.</p>
                    </div>
                  </div>
                  <Pressable
                    type="button"
                    intensity="normal"
                    haptic="success"
                    disabled={exporting}
                    className="creator-studio__primary-action"
                    onClick={handleExport}
                  >
                    <Share2 className="h-4 w-4" />
                    {exporting ? 'Opening Share Sheet…' : 'Open Share Sheet'}
                  </Pressable>
                </div>
              )}
            </section>
          </main>

          <nav className="creator-studio__toolbar" aria-label="Creator Studio tools">
            {TOOL_ITEMS.map((tool) => {
              const Icon = tool.icon
              const selected = editorState.selectedTool === tool.id
              return (
                <Pressable
                  key={tool.id}
                  type="button"
                  intensity="icon"
                  haptic="light"
                  className={`creator-studio__tool-button ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedTool(tool.id)}
                >
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
