import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  Crop,
  FileImage,
  Music2,
  Scissors,
  Share2,
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
  { id: 'practice_mix', label: 'Practice mix' },
  { id: 'accompaniment', label: 'Accompaniment' },
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

  const setSelectedTool = useCallback((selectedTool: CreatorStudioTool) => {
    updateCreatorStudioState(setEditorState, (state) => ({ ...state, selectedTool }))
  }, [])

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

  return (
    <AnimatePresence>
      <motion.div
        className="creator-studio"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
              <p className="creator-studio__eyebrow">Creator Studio</p>
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
                {isVideo ? (
                  <video
                    className="creator-studio__media"
                    src={take.videoUrl}
                    playsInline
                    controls
                    muted={previewModel.audio.source === 'mute'}
                  />
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
            </section>

            <section className="creator-studio__panel" aria-label={`${editorState.selectedTool} tools`}>
              {editorState.selectedTool === 'trim' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <Scissors className="h-4 w-4" />
                    <div>
                      <h3>Trim</h3>
                      <p>Non-destructive start and end points.</p>
                    </div>
                  </div>
                  <div className="creator-studio__range-row">
                    <label>
                      Start
                      <input
                        type="range"
                        min={0}
                        max={95}
                        value={editorState.trim.start}
                        onChange={(event) => {
                          const start = Number(event.target.value)
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            trim: { ...state.trim, start },
                          }))
                        }}
                      />
                    </label>
                    <label>
                      End
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={editorState.trim.end ?? 100}
                        onChange={(event) => {
                          const end = Number(event.target.value)
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            trim: { ...state.trim, end: end >= 100 ? null : end },
                          }))
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {editorState.selectedTool === 'crop' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <Crop className="h-4 w-4" />
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
                    <Volume2 className="h-4 w-4" />
                    <div>
                      <h3>Audio</h3>
                      <p>Simple session-aware mix controls.</p>
                    </div>
                  </div>
                  <div className="creator-studio__choice-list">
                    {AUDIO_SOURCES.map((source) => {
                      const disabled =
                        (source.id === 'practice_mix' && !editorState.audio.hasPracticeMix) ||
                        (source.id === 'accompaniment' && !editorState.audio.hasAccompaniment)
                      return (
                        <Pressable
                          key={source.id}
                          type="button"
                          intensity="soft"
                          haptic="light"
                          disabled={disabled}
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
                      )
                    })}
                  </div>
                  <div className="creator-studio__range-row">
                    <label>
                      Instrument Volume
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={editorState.audio.instrumentVolume}
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
                    </label>
                    <label>
                      Backing Track Volume
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={editorState.audio.backingTrackVolume}
                        onChange={(event) =>
                          updateCreatorStudioState(setEditorState, (state) => ({
                            ...state,
                            audio: {
                              ...state.audio,
                              backingTrackVolume: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              )}

              {editorState.selectedTool === 'overlay' && (
                <div className="creator-studio__panel-content">
                  <div className="creator-studio__panel-heading">
                    <Type className="h-4 w-4" />
                    <div>
                      <h3>Overlays</h3>
                      <p>Title, date, instrument, watermark, and sheet music.</p>
                    </div>
                  </div>
                  <div className="creator-studio__overlay-list">
                    {editorState.overlays.map((overlay) => (
                      <label key={overlay.id} className="creator-studio__overlay-control">
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
                    <Share2 className="h-4 w-4" />
                    <div>
                      <h3>Export</h3>
                      <p>Use the native iOS share sheet for Reels, Shorts, Messages, Files, and AirDrop.</p>
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
