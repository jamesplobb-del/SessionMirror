import { useEffect, useRef, useState, type RefObject, type CSSProperties } from 'react'
import { Trash2 } from 'lucide-react'
import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
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

export default function MultitrackPanelGrid({ layout, panels, sheetMusicPanel, recordingTargetPanelId, recordingPhase, streamRef, streamGeneration, nativeLivePreviewActive, nativeCameraBridgeEnabled, countInRemaining, recordingElapsed, reviewTake, reviewMediaRef, onTapPerformance, onRemoveTake, onSheetMusicChange, onSheetCueAssetChange, onRemoveSheetCue, onEditSheetMusic, onRegisterMedia, currentTimeSec, aspectRatio = '9:16', onMoveOverlay, onDeleteExtra, editable = false }: {
  aspectRatio?: string
  editable?: boolean
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
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1, height: 1 })
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [w, h] = aspectRatio.split(':').map(Number)
  const width = Math.min(size.width, size.height * w / h)
  const { panelRects, musicRect } = compositionRects({ panels, sheetMusic: sheetMusicPanel }, layout, currentTimeSec ?? 0)
  const rectStyle = (rect: LayoutRectPercent | null | undefined): CSSProperties => rect ? {
    position: 'absolute', left: `${rect.xPercent}%`, top: `${rect.yPercent}%`,
    width: `${rect.widthPercent}%`, height: `${rect.heightPercent}%`,
  } : { display: 'none' }
  const drag = useRef<{ id: string; x: number; y: number; rect: LayoutRectPercent; resize?: boolean } | null>(null)
  return (
    <div className="multitrack-canvas-frame" ref={frameRef}>
    <div className="multitrack-grid multitrack-social-canvas" style={{ width, height: width * h / w }}>
      {hasMusic ? (
        <div style={rectStyle(musicRect)} className="multitrack-grid__cell">
          <SheetMusicPanel
            panel={sheetMusicPanel}
            currentTimeSec={currentTimeSec}
            onAssetChange={(asset) => onSheetMusicChange(sheetMusicPanel.id, asset)}
            onCueAssetChange={onSheetCueAssetChange}
            onRemoveCue={onRemoveSheetCue}
            onEdit={onEditSheetMusic}
          />
        </div>
      ) : null}
      {panels.map((panel) => (
        // Out-of-window boxes stay mounted and merely hidden — unmounting would
        // tear down their <video> and force a reload when the section comes back.
        <div
          key={panel.id}
          onClickCapture={event => {
            if (!editable || (event.target as HTMLElement).closest('.multitrack-overlay-move, .multitrack-box-resize, .multitrack-box-delete')) return
            event.stopPropagation(); event.preventDefault(); setSelectedId(panel.id)
          }}
          style={{ ...rectStyle(panelRects[panel.id]), zIndex: panel.kind === 'performance' && panel.overlay ? panels.indexOf(panel) + 2 : 1 }}
          className={`multitrack-grid__cell${panel.kind === 'performance' && panel.overlay ? ' is-extra' : ''}${editable && selectedId === panel.id ? ' is-selected' : ''}`}
        >
          {panel.kind === 'performance' && editable && selectedId === panel.id && onMoveOverlay && panelRects[panel.id] ? (
            <><button className="multitrack-overlay-move" aria-label={`Move ${panel.label || 'box'}`}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: panel.id, x: event.clientX, y: event.clientY, rect: panelRects[panel.id] } }}
              onPointerMove={event => {
                const d = drag.current
                if (!d || d.id !== panel.id || d.resize) return
                onMoveOverlay(panel.id, { ...d.rect,
                  xPercent: Math.max(0, Math.min(100 - d.rect.widthPercent, d.rect.xPercent + (event.clientX - d.x) / width * 100)),
                  yPercent: Math.max(0, Math.min(100 - d.rect.heightPercent, d.rect.yPercent + (event.clientY - d.y) / (width * h / w) * 100)) })
              }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>Move</button>
            <button className="multitrack-box-resize" aria-label={`Resize ${panel.label || 'box'}`}
              onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: panel.id, x: event.clientX, y: event.clientY, rect: panelRects[panel.id], resize: true } }}
              onPointerMove={event => {
                const d = drag.current
                if (!d || d.id !== panel.id || !d.resize) return
                onMoveOverlay(panel.id, { ...d.rect,
                  widthPercent: Math.max(10, Math.min(100 - d.rect.xPercent, d.rect.widthPercent + (event.clientX - d.x) / width * 100)),
                  heightPercent: Math.max(10, Math.min(100 - d.rect.yPercent, d.rect.heightPercent + (event.clientY - d.y) / (width * h / w) * 100)) })
              }} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>↘</button>
            {panel.overlay && onDeleteExtra && <button type="button" className="multitrack-box-delete" aria-label="Delete extra box" title="Delete extra box" onClick={() => { onDeleteExtra(panel.id); setSelectedId(null) }}><Trash2 size={15} /></button>}</>
          ) : null}
          {panel.kind === 'performance' ? (
            <PerformancePanel
              panel={panel}
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
              onAssetChange={(asset) => onSheetMusicChange(panel.id, asset)}
              onCueAssetChange={onSheetCueAssetChange}
              onRemoveCue={onRemoveSheetCue}
              onEdit={onEditSheetMusic}
            />
          )}
        </div>
      ))}
    </div></div>
  )
}
