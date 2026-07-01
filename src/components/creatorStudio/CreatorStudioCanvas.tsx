import { useCallback, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { FileImage, Music2, Pause, Play, Plus, Type } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { formatTime } from '../../hooks/useVideoPlayback'
import { useStudioCanvasManipulator } from '../../hooks/useStudioCanvasManipulator'
import { sortCanvasObjects, getSeparateSheet } from '../../creatorStudio/canvasObjects'
import { clampVideoSheetRatio } from '../../creatorStudio/layout'
import CreatorStudioContextBar from './CreatorStudioContextBar'
import type {
  CreatorStudioPreviewModel,
  StudioCanvasObject,
  StudioGuideLine,
  StudioSheetMusicObject,
  StudioTransform,
} from '../../creatorStudio/types'

interface CreatorStudioCanvasProps {
  previewModel: CreatorStudioPreviewModel
  selectedObjectId: string | null
  isVideo: boolean
  resolvedSrc: string | null
  fallbackSrc: string
  bindMediaRef: (node: HTMLVideoElement | HTMLAudioElement | null) => void
  isPlaying: boolean
  duration: number
  currentTime: number
  editMode: boolean
  onSelectObject: (id: string | null) => void
  onUpdateObject: (id: string, transform: StudioTransform) => void
  onUpdateSheet: (id: string, patch: Partial<StudioSheetMusicObject>) => void
  onTogglePlayback: () => void
  onAddText: () => void
  onImportSheet: () => void
  onEditText: () => void
  onToggleWatermark: () => void
  onToggleSheetMode: () => void
  onReplaceSheet: () => void
  onCropRecording: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onDeleteObject: () => void
}

function SheetMusicContent({ layer }: { layer: StudioSheetMusicObject }) {
  if (layer.fileType === 'image') {
    return <img src={layer.sourceUrl} alt="" draggable={false} />
  }
  return (
    <object data={layer.sourceUrl} type="application/pdf" aria-label={layer.name}>
      <FileImage className="h-7 w-7" />
      <span>{layer.name}</span>
    </object>
  )
}

function CanvasObjectShell({
  stageRef,
  object,
  selected,
  editMode,
  peerPositions,
  onSelect,
  onTransformChange,
  children,
}: {
  stageRef: RefObject<HTMLElement | null>
  object: StudioCanvasObject
  selected: boolean
  editMode: boolean
  peerPositions: Array<{ x: number; y: number }>
  onSelect: () => void
  onTransformChange: (transform: StudioTransform) => void
  children: ReactNode
}) {
  const manipulator = useStudioCanvasManipulator({
    stageRef,
    transform: object.transform,
    enabled: editMode && selected,
    peerPositions,
    onChange: onTransformChange,
  })

  return (
    <div
      className={`creator-studio__canvas-object creator-studio__canvas-object--${object.kind} ${
        selected ? 'is-selected' : ''
      } ${editMode ? 'is-editable' : ''}`}
      style={{
        left: `${object.transform.x}%`,
        top: `${object.transform.y}%`,
        width: `${object.transform.width}%`,
        transform: `translate(-50%, -50%) scale(${object.transform.scale}) rotate(${object.transform.rotation}deg)`,
        zIndex: object.transform.zIndex,
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect()
        manipulator.handlePointerDown(event)
      }}
      onPointerMove={manipulator.handlePointerMove}
      onPointerUp={manipulator.handlePointerUp}
      onPointerCancel={manipulator.handlePointerCancel}
    >
      {selected && editMode && <span className="creator-studio__selection-ring" aria-hidden />}
      {children}
      {selected && editMode && manipulator.activeGuides.length > 0 && (
        <span className="sr-only">Alignment guides active</span>
      )}
    </div>
  )
}

export default function CreatorStudioCanvas({
  previewModel,
  selectedObjectId,
  isVideo,
  resolvedSrc,
  fallbackSrc,
  bindMediaRef,
  isPlaying,
  duration,
  currentTime,
  editMode,
  onSelectObject,
  onUpdateObject,
  onUpdateSheet,
  onTogglePlayback,
  onAddText,
  onImportSheet,
  onEditText,
  onToggleWatermark,
  onToggleSheetMode,
  onReplaceSheet,
  onCropRecording,
  onBringForward,
  onSendBackward,
  onDeleteObject,
}: CreatorStudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const separateSheet = getSeparateSheet(previewModel.objects)
  const videoRatio = separateSheet?.separateRatio ?? 60
  const sheetRatio = 100 - videoRatio

  const sortedObjects = useMemo(
    () => sortCanvasObjects(previewModel.objects),
    [previewModel.objects],
  )

  const selectedObject =
    sortedObjects.find((object) => object.id === selectedObjectId) ?? null

  const peerPositions = useMemo(
    () =>
      sortedObjects
        .filter((object) => object.id !== selectedObjectId)
        .map((object) => ({ x: object.transform.x, y: object.transform.y })),
    [selectedObjectId, sortedObjects],
  )

  const overlayGuides: StudioGuideLine[] = []
  const mediaSrc = resolvedSrc || fallbackSrc

  const bindRecordingMediaRef = useCallback(
    (node: HTMLVideoElement | HTMLAudioElement | null) => {
      bindMediaRef(node)
      if (node && mediaSrc && node.src !== mediaSrc) {
        node.src = mediaSrc
      }
    },
    [bindMediaRef, mediaSrc],
  )

  const handleDividerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!separateSheet || !editMode) return
      event.preventDefault()
      event.stopPropagation()

      const stage = stageRef.current
      if (!stage) return

      const updateFromPointer = (clientY: number) => {
        const rect = stage.getBoundingClientRect()
        const ratio = ((clientY - rect.top) / rect.height) * 100
        onUpdateSheet(separateSheet.id, { separateRatio: clampVideoSheetRatio(ratio) })
      }

      updateFromPointer(event.clientY)
      event.currentTarget.setPointerCapture(event.pointerId)

      const onMove = (moveEvent: PointerEvent) => {
        if (!event.currentTarget.hasPointerCapture(moveEvent.pointerId)) return
        updateFromPointer(moveEvent.clientY)
      }
      const onUp = () => {
        event.currentTarget.removeEventListener('pointermove', onMove)
        event.currentTarget.removeEventListener('pointerup', onUp)
      }

      event.currentTarget.addEventListener('pointermove', onMove)
      event.currentTarget.addEventListener('pointerup', onUp)
    },
    [editMode, onUpdateSheet, separateSheet],
  )

  const renderRecordingMedia = () =>
    isVideo ? (
      <>
        <video
          ref={bindRecordingMediaRef}
          className="creator-studio__media"
          src={mediaSrc || undefined}
          playsInline
          preload="metadata"
          onLoadedMetadata={() => console.info('[CreatorStudio] video loaded', { src: mediaSrc })}
          onError={(event) =>
            console.warn('[CreatorStudio] video failed to load', {
              src: mediaSrc,
              error: event.currentTarget.error?.message ?? event.currentTarget.error?.code,
            })
          }
          onClick={(event) => {
            event.stopPropagation()
            onTogglePlayback()
          }}
        />
        {!mediaSrc && (
          <div className="creator-studio__media-loading" aria-hidden>
            <Music2 className="h-8 w-8 animate-pulse" />
          </div>
        )}
        <Pressable
          type="button"
          intensity="icon"
          haptic="medium"
          className={`creator-studio__preview-play ${isPlaying ? 'is-playing' : ''}`}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          disabled={!mediaSrc}
          onClick={(event) => {
            event.stopPropagation()
            onTogglePlayback()
          }}
        >
          {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
        </Pressable>
      </>
    ) : resolvedSrc ? (
      <>
        <audio
          ref={bindRecordingMediaRef}
          className="creator-studio__media-audio"
          src={mediaSrc}
          preload="metadata"
        />
        <div className="creator-studio__audio-chip">
          <Music2 className="h-5 w-5" />
          <Pressable type="button" intensity="icon" haptic="medium" className="creator-studio__audio-play" onClick={onTogglePlayback}>
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </Pressable>
        </div>
      </>
    ) : (
      <div className="creator-studio__media-loading" aria-hidden>
        <Music2 className="h-8 w-8 animate-pulse" />
      </div>
    )

  const renderObject = (object: StudioCanvasObject) => {
    if (object.kind === 'watermark' && !object.visible) return null
    if (object.kind === 'sheetMusic' && object.displayMode === 'separate') return null

    const content =
      object.kind === 'recording' ? (
        <div className="creator-studio__recording-frame">{renderRecordingMedia()}</div>
      ) : object.kind === 'sheetMusic' ? (
        <SheetMusicContent layer={object} />
      ) : object.kind === 'text' ? (
        <p className="creator-studio__text-object">{object.text}</p>
      ) : (
        <span className="creator-studio__watermark-chip">{object.text}</span>
      )

    return (
      <CanvasObjectShell
        key={object.id}
        stageRef={stageRef}
        object={object}
        selected={selectedObjectId === object.id}
        editMode={editMode}
        peerPositions={peerPositions}
        onSelect={() => onSelectObject(object.id)}
        onTransformChange={(transform) => onUpdateObject(object.id, transform)}
      >
        {content}
      </CanvasObjectShell>
    )
  }

  return (
    <section
      className={`creator-studio__preview creator-studio__preview--${previewModel.aspectRatio.replace(':', '-')}`}
      aria-label="Creator Studio canvas"
    >
      <div className="creator-studio__canvas-wrap">
        <div
          ref={stageRef}
          className={`creator-studio__preview-stage creator-studio__preview-stage--canvas ${
            separateSheet ? 'has-separate-sheet' : ''
          }`}
          style={
            separateSheet
              ? { gridTemplateRows: `${videoRatio}% ${sheetRatio}%` }
              : undefined
          }
          onPointerDown={() => onSelectObject(null)}
        >
          {editMode && (
            <div className="creator-studio__safe-margins" aria-hidden>
              <span />
            </div>
          )}

          {overlayGuides.map((guide, index) => (
            <span
              key={`${guide.orientation}-${guide.position}-${index}`}
              className={`creator-studio__guide creator-studio__guide--${guide.orientation}`}
              style={
                guide.orientation === 'vertical'
                  ? { left: `${guide.position}%` }
                  : { top: `${guide.position}%` }
              }
            />
          ))}

          {separateSheet && (
            <>
              <div className="creator-studio__separate-region creator-studio__separate-region--video" />
              <div
                className={`creator-studio__layout-divider creator-studio__layout-divider--horizontal ${
                  editMode ? 'is-active' : ''
                }`}
                onPointerDown={handleDividerPointerDown}
                role="separator"
                aria-orientation="horizontal"
                aria-valuenow={videoRatio}
                aria-label="Adjust video and sheet music ratio"
              />
              <div className="creator-studio__separate-region creator-studio__separate-region--sheet">
                {separateSheet.sourceUrl ? (
                  <SheetMusicContent layer={separateSheet} />
                ) : (
                  <div className="creator-studio__sheet-placeholder">
                    <Music2 className="h-8 w-8" />
                    <p>Sheet music</p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="creator-studio__canvas-objects">
            {sortedObjects.map(renderObject)}
          </div>
        </div>

        {editMode && !selectedObjectId && (
          <div className="creator-studio__canvas-fab">
            <Pressable type="button" intensity="soft" haptic="light" className="creator-studio__fab-button" onClick={onAddText}>
              <Type className="h-4 w-4" />
              Text
            </Pressable>
            <Pressable type="button" intensity="soft" haptic="light" className="creator-studio__fab-button" onClick={onImportSheet}>
              <Plus className="h-4 w-4" />
              Sheet
            </Pressable>
          </div>
        )}

        <CreatorStudioContextBar
          selectedObject={selectedObject}
          onEditText={onEditText}
          onToggleWatermark={onToggleWatermark}
          onToggleSheetMode={onToggleSheetMode}
          onReplaceSheet={onReplaceSheet}
          onCropRecording={onCropRecording}
          onBringForward={onBringForward}
          onSendBackward={onSendBackward}
          onDelete={onDeleteObject}
        />
      </div>

      {duration > 0 && (
        <p className="creator-studio__preview-time" aria-live="polite">
          {formatTime(currentTime)} / {formatTime(duration)}
          {separateSheet && (
            <span className="creator-studio__preview-ratio">
              {' '}
              · {videoRatio}% video / {sheetRatio}% sheet
            </span>
          )}
        </p>
      )}
    </section>
  )
}
