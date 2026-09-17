import { useEffect, useRef, useState, type RefObject, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Move, Pencil, Trash2 } from 'lucide-react'
import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import { transformBox, type BoxGestureMode } from '../layout/boxGesture'
import { compositionRects } from '../layout/composition'
import type { LayoutRectPercent } from '../layout/layoutRects'
import { hasAnySheetImage } from '../sheetMusic/sheetMusicTimeline'
import type { Take } from '../../types'
import type {
  MultitrackLayoutPreset,
  MultitrackPanelState,
  MultitrackRecordingPhase,
  SheetMusicAsset,
  SheetMusicPanelState,
} from '../types'

export default function MultitrackPanelGrid({ layout, panels, sheetMusicPanel, recordingTargetPanelId, recordingPhase, streamRef, streamGeneration, nativeLivePreviewActive, nativeCameraBridgeEnabled, countInRemaining, recordingElapsed, reviewTake, reviewMediaRef, onTapPerformance, onRemoveTake, onSheetMusicChange, onSheetCueAssetChange, onRemoveSheetCue, onEditSheetMusic, onRegisterMedia, currentTimeSec, aspectRatio = '9:16', bpm = 120, onMoveOverlay, onDeleteExtra, editable = false, interactionDisabled = false }: {
  aspectRatio?: string
  bpm?: number
  editable?: boolean
  interactionDisabled?: boolean
  onDeleteExtra?: (id: string) => void
  onMoveOverlay?: (id: string, rect: LayoutRectPercent) => void
  layout: MultitrackLayoutPreset; panels: MultitrackPanelState[]; sheetMusicPanel: SheetMusicPanelState; recordingTargetPanelId: string | null; recordingPhase: MultitrackRecordingPhase
  streamRef?: RefObject<MediaStream | null>; streamGeneration?: number; nativeLivePreviewActive?: boolean; nativeCameraBridgeEnabled?: boolean
  countInRemaining?: number; recordingElapsed?: number; reviewTake?: Take | null; reviewMediaRef?: RefObject<HTMLMediaElement | null>
  onTapPerformance: (id: string) => void; onRemoveTake: (id: string) => void; onSheetMusicChange: (id: string, asset: SheetMusicAsset | null) => void
  onSheetCueAssetChange?: (cueId: string, asset: SheetMusicAsset) => void
  onRemoveSheetCue?: (cueId: string) => void
  onEditSheetMusic?: () => void
  onRegisterMedia: (id: string, el: HTMLMediaElement | null) => void
  /** Timeline position — drives which section-scoped boxes hold a slot, and
      which screenshot the music panel is showing. */
  currentTimeSec?: number
}) {
  const hasMusic = hasAnySheetImage(sheetMusicPanel)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null)
  const controlsPanelId = panels.some(p => p.kind === 'performance' && p.take && p.id === selectedId)
    ? selectedId : panels.find(p => p.kind === 'performance' && p.take)?.id
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize(prev => {
      const { width, height } = entry.contentRect
      return prev.width === width && prev.height === height ? prev : { width, height }
    }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [w, h] = aspectRatio.split(':').map(Number)
  const { panelRects, musicRect } = compositionRects({ panels, sheetMusic: sheetMusicPanel, practice: { bpm } }, layout, currentTimeSec ?? 0)
  const rectStyle = (rect: LayoutRectPercent | null | undefined): CSSProperties => rect ? {
    position: 'absolute', left: `${rect.xPercent}%`, top: `${rect.yPercent}%`,
    width: `${rect.widthPercent}%`, height: `${rect.heightPercent}%`,
  } : { display: 'none' }
  const canvasRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{ id: string; rect: LayoutRectPercent } | null>(null)
  const drag = useRef<{
    id: string; pointerId: number; x: number; y: number; width: number; height: number;
    rect: LayoutRectPercent; next: LayoutRectPercent; mode: BoxGestureMode; moved: boolean; captureTarget: HTMLElement | null;
  } | null>(null)
  const frame = useRef<number | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  useEffect(() => {
    if (!interactionDisabled) return
    drag.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setDraft(null)
  }, [interactionDisabled])
  const begin = (id: string, mode: BoxGestureMode, event: ReactPointerEvent<HTMLElement>, deferCapture = false) => {
    const rect = panelRects[id]
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (interactionDisabled || event.button !== 0 || drag.current || !rect || !bounds?.width || !bounds.height) return
    if (!deferCapture) {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setSelectedId(id)
    suppressClick.current = false
    drag.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      width: bounds.width, height: bounds.height, rect, next: rect, mode, moved: false, captureTarget: deferCapture ? null : event.currentTarget }
  }
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    event.stopPropagation()
    const dx = event.clientX - current.x, dy = event.clientY - current.y
    if (!current.moved && Math.hypot(dx, dy) < 4) return
    if (!current.captureTarget) {
      current.captureTarget = event.currentTarget
      current.captureTarget.setPointerCapture(event.pointerId)
    }
    current.moved = true
    event.preventDefault()
    current.next = transformBox(current.rect, current.mode, dx / current.width * 100, dy / current.height * 100)
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (drag.current) setDraft({ id: drag.current.id, rect: drag.current.next })
    })
  }
  const finish = (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    if (!cancelled) move(event)
    drag.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setDraft(null)
    suppressClick.current = current.moved
    if (!cancelled && current.moved) onMoveOverlay?.(current.id, current.next)
    if (current.captureTarget?.hasPointerCapture(event.pointerId)) current.captureTarget.releasePointerCapture(event.pointerId)
  }
  const nudge = (id: string, mode: BoxGestureMode, event: ReactKeyboardEvent<HTMLElement>) => {
    const rect = panelRects[id]
    if (interactionDisabled || !rect || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const step = event.shiftKey ? 5 : 1
    onMoveOverlay?.(id, transformBox(rect, mode,
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))
  }
  const selectedPanel = panels.find(panel => panel.id === selectedId && panel.kind === 'performance')
  const selectedRect = selectedId ? (draft?.id === selectedId ? draft.rect : panelRects[selectedId]) : null
  const showSelectionTools = !interactionDisabled && selectedPanel?.kind === 'performance' && (editable || !!selectedPanel.overlay) && selectedRect
  const showTakeControls = controlsPanelId && recordingPhase === 'idle'
  const controlsHeight = (showTakeControls ? 62 : 0) + (showSelectionTools ? 62 : 0)
  const width = Math.min(size.width, Math.max(1, size.height - controlsHeight) * w / h)
  return (
    <div className="multitrack-canvas-frame" ref={frameRef}>
    {showTakeControls && <div ref={setControlsHost} className="multitrack-take-controls" role="toolbar" aria-label="Take controls" inert={interactionDisabled} aria-disabled={interactionDisabled} />}
    {showSelectionTools && selectedId ? <div className="multitrack-box-tools" role="toolbar" aria-label="Selected box">
      <button type="button" aria-label="Move selected box" onPointerDown={event => begin(selectedId, 'move', event)} onPointerMove={move}
        onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (event.target === drag.current?.captureTarget) finish(event, true) }}
        onKeyDown={event => nudge(selectedId, 'move', event)}><Move size={16} /></button>
      <button type="button" aria-label="Edit selected box" onClick={() => onTapPerformance(selectedId)}><Pencil size={16} /></button>
      {selectedPanel?.kind === 'performance' && selectedPanel.overlay && onDeleteExtra ? <button type="button" className="multitrack-box-tools__delete" aria-label="Delete extra box" onClick={() => { onDeleteExtra(selectedId); setSelectedId(null) }}><Trash2 size={18} /><span>Delete</span></button> : null}
    </div> : null}
    <div ref={canvasRef} className="multitrack-grid multitrack-social-canvas" style={{ width, height: width * h / w }}>
      {hasMusic ? (
        <div style={rectStyle(musicRect)} className="multitrack-grid__cell">
          <SheetMusicPanel
            panel={sheetMusicPanel}
            currentTimeSec={currentTimeSec}
            interactionDisabled={interactionDisabled}
            onAssetChange={(asset) => onSheetMusicChange(sheetMusicPanel.id, asset)}
            onCueAssetChange={onSheetCueAssetChange}
            onRemoveCue={onRemoveSheetCue}
            onEdit={onEditSheetMusic}
          />
        </div>
      ) : null}
      {panels.map((panel) => {
        const canEdit = !interactionDisabled && panel.kind === 'performance' && (editable || !!panel.overlay)
        const name = panel.kind === 'performance' ? panel.label || (panel.overlay ? 'extra box' : 'box') : 'image'
        return (
        // Out-of-window boxes stay mounted and merely hidden — unmounting would
        // tear down their <video> and force a reload when the section comes back.
        <div
          key={panel.id}
          onPointerDownCapture={event => {
            if (!canEdit || (event.target as HTMLElement).closest('[data-box-control]')) return
            begin(panel.id, 'move', event, true)
          }}
          onPointerMove={move}
          onPointerUp={event => finish(event)}
          onPointerCancel={event => finish(event, true)}
          onLostPointerCapture={event => { if (event.target === drag.current?.captureTarget) finish(event, true) }}
          onClickCapture={event => {
            if ((event.target as HTMLElement).closest('[data-box-control]')) return
            if (suppressClick.current) {
              event.stopPropagation(); event.preventDefault()
              suppressClick.current = false
              return
            }
            if (canEdit) setSelectedId(panel.id)
          }}
          style={{ ...rectStyle(draft?.id === panel.id ? draft.rect : panelRects[panel.id]), zIndex: panel.kind === 'performance' && panel.overlay ? panels.indexOf(panel) + 2 : 1 }}
          className={`multitrack-grid__cell${panel.kind === 'performance' && panel.overlay ? ' is-extra' : ''}${canEdit ? ' is-editable' : ''}${canEdit && selectedId === panel.id ? ' is-selected' : ''}`}
        >
          {canEdit && selectedId === panel.id && onMoveOverlay && panelRects[panel.id] ? (
            <>
              {(['nw', 'ne', 'sw', 'se'] as const).map(corner => <button type="button" data-box-control key={corner}
                className={`multitrack-box-resize multitrack-box-resize--${corner}`} aria-label={`Resize ${name} ${corner}`}
                onPointerDown={event => begin(panel.id, corner, event)} onKeyDown={event => nudge(panel.id, corner, event)} />)}

            </>
          ) : null}
          {panel.kind === 'performance' ? (
            <PerformancePanel
              panel={panel}
              controlsHost={controlsPanelId === panel.id && recordingPhase === 'idle' ? controlsHost : null}
              onSelect={() => setSelectedId(panel.id)}
              displayName={panel.label || (panel.overlay
                ? `Extra ${panels.filter(p => p.kind === 'performance' && p.overlay).findIndex(p => p.id === panel.id) + 1}`
                : `Box ${panels.filter(p => p.kind === 'performance' && !p.overlay).findIndex(p => p.id === panel.id) + 1}`)}
              isRecordingTarget={recordingTargetPanelId === panel.id}
              recordingPhase={recordingPhase}
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              nativeLivePreviewActive={nativeLivePreviewActive}
              nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
              countInRemaining={countInRemaining}
              recordingElapsed={recordingElapsed}
              reviewTake={reviewTake}
              reviewMediaRef={reviewMediaRef}
              onTap={() => onTapPerformance(panel.id)}
              onRemoveTake={() => onRemoveTake(panel.id)}
              onRegisterMedia={onRegisterMedia}
            />
          ) : (
            <SheetMusicPanel
              panel={panel}
              currentTimeSec={currentTimeSec}
              interactionDisabled={interactionDisabled}
              onAssetChange={(asset) => onSheetMusicChange(panel.id, asset)}
              onCueAssetChange={onSheetCueAssetChange}
              onRemoveCue={onRemoveSheetCue}
              onEdit={onEditSheetMusic}
            />
          )}
        </div>
      )})}
    </div></div>
  )
}
