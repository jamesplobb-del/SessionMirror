import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, FileImage, Move, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { SheetMusicAsset, SheetMusicPanelState } from '../types'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from './sheetMusicUtils'
import { sheetCueWindows, sheetYAt } from './sheetMusicTimeline'
import SheetPdfPages from './SheetPdfPages'
import { reconnectSheetSource } from '../state/multitrackAssetRecovery'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface GesturePoint {
  x: number
  y: number
}

interface SheetTransform {
  x: number
  y: number
  scale: number
}

interface SheetGesture {
  points: Map<number, GesturePoint>
  baseline: SheetTransform
  startPoint: GesturePoint | null
  startCenter: GesturePoint | null
  startDistance: number
}

const DEFAULT_TRANSFORM: SheetTransform = { x: 0.5, y: 0.5, scale: 1 }

function centerOf(first: GesturePoint, second: GesturePoint): GesturePoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function distanceBetween(first: GesturePoint, second: GesturePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export default function SheetMusicPanel({
  panel,
  currentTimeSec = 0,
  interactionDisabled = false,
  onAssetChange,
  onCueAssetChange,
  onRemoveCue,
  onEdit,
}: {
  panel: SheetMusicPanelState
  /** Timeline position — decides which screenshot in the cue list is on screen. */
  currentTimeSec?: number
  /** A take is recording, playing or exporting: the page is fixed for the run. */
  interactionDisabled?: boolean
  onAssetChange: (asset: SheetMusicAsset | null) => void
  onCueAssetChange?: (cueId: string, asset: SheetMusicAsset) => void
  onRemoveCue?: (cueId: string) => void
  onEdit?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadedAssetUrlRef = useRef<string | null>(null)
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [recoveryCueId, setRecoveryCueId] = useState<string | null>(null)
  const panelRef = useRef(panel)
  panelRef.current = panel
  /*
   * Page count as the open file reports it. It is not written back into the
   * project: the length of a PDF is a property of the file, and recording it
   * on every open would put an undo step on the stack for simply looking at a
   * part. Imports record it up front; this covers the ones that predate that.
   */
  const [livePageCount, setLivePageCount] = useState(0)

  // Which screenshot is up right now, and where it sits in the sequence.
  const cueWindows = useMemo(() => sheetCueWindows(panel), [panel])
  let activeIndex = 0
  for (let i = 0; i < cueWindows.length; i += 1) {
    if (cueWindows[i].startSec <= currentTimeSec) activeIndex = i
  }
  const activeCue = cueWindows[activeIndex] ?? null
  const activeAsset = activeCue?.asset ?? null
  // Every missing cue must be reachable without playing/seeking an incomplete project.
  const missingCues = cueWindows.filter(cue => cue.asset.missing)
  const recoveryCue = missingCues.find(cue => cue.id === recoveryCueId)
    ?? missingCues.find(cue => cue.id === activeCue?.id) ?? missingCues[0] ?? null
  const importCueRef = useRef(recoveryCue ?? activeCue)
  importCueRef.current = recoveryCue ?? activeCue

  const initialTransform = activeAsset
    ? { x: activeAsset.x ?? 0.5, y: activeAsset.y ?? 0.5, scale: activeAsset.scale ?? 1 }
    : DEFAULT_TRANSFORM
  const [draftTransform, setDraftTransform] = useState<SheetTransform>(initialTransform)
  const transformRef = useRef<SheetTransform>(initialTransform)
  const gestureRef = useRef<SheetGesture>({
    points: new Map(),
    baseline: initialTransform,
    startPoint: null,
    startCenter: null,
    startDistance: 0,
  })

  // Imported images remain available to workspace Undo after this panel closes.

  useEffect(() => {
    if (!activeAsset || gestureRef.current.points.size > 0) return
    const next = {
      x: activeAsset.x ?? 0.5,
      y: activeAsset.y ?? 0.5,
      scale: activeAsset.scale ?? 1,
    }
    transformRef.current = next
    setDraftTransform(next)
  }, [activeAsset?.src, activeAsset?.x, activeAsset?.y, activeAsset?.scale])

  /*
   * Writing back to whichever image is on screen. The first image is the
   * panel's own asset; every later one is a cue, and a cue is edited by id.
   */
  const commitActiveAsset = useCallback((next: SheetMusicAsset) => {
    if (!activeCue) return
    if (activeCue.isBase) onAssetChange(next)
    else onCueAssetChange?.(activeCue.id, next)
  }, [activeCue, onAssetChange, onCueAssetChange])

  const importFile = useCallback((file: File) => {
    setImportError('')
    setIsImporting(true)
    const reconnecting = importCueRef.current?.asset.missing ? importCueRef.current : null
    void loadSheetMusicFile(file)
      .then((asset) => {
        if (reconnecting) {
          const active = importCueRef.current
          if (active?.id !== reconnecting.id || active.asset.src !== reconnecting.asset.src || !active.asset.missing) {
            URL.revokeObjectURL(asset.src)
            throw new Error('The selected part changed. Choose the file again.')
          }
          let next: SheetMusicPanelState
          try { next = reconnectSheetSource(panelRef.current, reconnecting.asset.src, asset) }
          catch (error) { URL.revokeObjectURL(asset.src); throw error }
          if (next.asset !== panelRef.current.asset) onAssetChange(next.asset)
          for (const cue of next.cues ?? []) {
            if (cue.asset !== panelRef.current.cues?.find(previous => previous.id === cue.id)?.asset) onCueAssetChange?.(cue.id, cue.asset)
          }
          return
        }
        uploadedAssetUrlRef.current = asset.src
        onAssetChange(asset)
      })
      .catch((cause: unknown) => {
        setImportError(cause instanceof Error && cause.message
          ? cause.message
          : 'That file could not be opened.')
      })
      .finally(() => setIsImporting(false))
  }, [onAssetChange, onCueAssetChange])

  if (!activeCue || !activeAsset) {
    return (
      <div className="multitrack-panel multitrack-panel--empty">
        <input
          ref={fileInputRef}
          type="file"
          accept={sheetMusicAcceptAttribute()}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.currentTarget.value = ''
            if (file) importFile(file)
          }}
        />
        <Pressable type="button" intensity="soft" onClick={() => fileInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center" aria-label="Add sheet music">
          <Upload className="h-8 w-8 text-stone-400" />
          <span className="mt-2 text-sm font-medium text-stone-500">Add music, photo, or PDF</span>
        </Pressable>
        {importError ? <p className="multitrack-panel__sheet-error" role="alert">{importError}</p> : null}
      </div>
    )
  }

  const asset = recoveryCue?.asset ?? activeAsset
  if (recoveryCue) {
    return (
      <div className="multitrack-panel multitrack-panel--empty" role="status">
        <input ref={fileInputRef} type="file" accept={asset.mimeType === 'application/pdf' ? 'application/pdf,.pdf' : 'image/*'} className="hidden"
          onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) importFile(file) }} />
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <FileImage className="h-6 w-6 text-stone-400" />
          {missingCues.length > 1 ? <select aria-label="Missing music file to reconnect" value={recoveryCue.id} disabled={interactionDisabled || isImporting}
            onChange={event => { setRecoveryCueId(event.target.value); setImportError('') }}>
            {missingCues.map(cue => <option key={cue.id} value={cue.id}>{cue.asset.fileName}{cue.isBase ? ' · opening' : ` · ${cue.startSec}s`}{cue.asset.mimeType === 'application/pdf' ? ` · page ${(cue.asset.pageIndex ?? 0) + 1}` : ''}</option>)}
          </select> : null}
          <span className="text-sm font-medium">{asset.fileName}</span>
          <span className="text-xs text-stone-500">File missing. Your placement{asset.mimeType === 'application/pdf' ? ` and page ${(asset.pageIndex ?? 0) + 1}` : ''} are kept.</span>
          <Pressable type="button" intensity="soft" disabled={interactionDisabled || isImporting}
            onClick={() => fileInputRef.current?.click()} aria-label={`Reconnect ${asset.fileName}`}>
            <Upload className="h-4 w-4" /> {isImporting ? 'Opening file…' : 'Reconnect file'}
          </Pressable>
          <Pressable type="button" intensity="soft" disabled={interactionDisabled || isImporting}
            onClick={() => { if (recoveryCue.isBase) onAssetChange(null); else onRemoveCue?.(recoveryCue.id) }} aria-label={`Remove missing ${asset.fileName}`}>
            <Trash2 className="h-4 w-4" /> Remove
          </Pressable>
          {importError ? <p className="multitrack-panel__sheet-error" role="alert">{importError}</p> : null}
        </div>
      </div>
    )
  }
  const isPdf = asset.mimeType === 'application/pdf'
  // Older saved image assets predate contentMode. Treat them as fill so they
  // receive the same stripe-free behavior as newly imported photos.
  const contentMode = isPdf ? 'fit' : (asset.contentMode ?? 'fill')
  const contentStyle = {
    '--sheet-x': `${(draftTransform.x - 0.5) * 70}%`,
    '--sheet-y': `${((activeAsset.scrollEndY === undefined ? draftTransform.y : sheetYAt(activeAsset, currentTimeSec - activeCue.startSec)) - 0.5) * 70}%`,
    '--sheet-scale': draftTransform.scale,
  } as CSSProperties

  const pageCount = asset.pageCount ?? livePageCount
  const pageIndex = Math.min(Math.max(0, asset.pageIndex ?? 0), Math.max(0, pageCount - 1))

  const setPage = (next: number) => {
    if (next === pageIndex) return
    commitActiveAsset({ ...asset, pageIndex: next })
  }

  const applyDraftTransform = (next: SheetTransform) => {
    transformRef.current = next
    setDraftTransform(next)
  }

  const resetGestureBaseline = () => {
    const gesture = gestureRef.current
    const points = [...gesture.points.values()]
    gesture.baseline = transformRef.current
    if (points.length >= 2) {
      gesture.startCenter = centerOf(points[0], points[1])
      gesture.startDistance = Math.max(1, distanceBetween(points[0], points[1]))
      gesture.startPoint = null
    } else {
      gesture.startPoint = points[0] ?? null
      gesture.startCenter = null
      gesture.startDistance = 0
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    gestureRef.current.points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    resetGestureBaseline()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture.points.has(event.pointerId)) return
    event.preventDefault()
    gesture.points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const rect = event.currentTarget.getBoundingClientRect()
    const points = [...gesture.points.values()]
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)

    if (points.length >= 2 && gesture.startCenter) {
      const center = centerOf(points[0], points[1])
      const distance = Math.max(1, distanceBetween(points[0], points[1]))
      const scale = clamp(
        gesture.baseline.scale * (distance / Math.max(1, gesture.startDistance)),
        0.6,
        2.5,
      )
      const ratio = scale / Math.max(0.01, gesture.baseline.scale)
      const baselineTranslateX = (gesture.baseline.x - 0.5) * 0.7 * width
      const baselineTranslateY = (gesture.baseline.y - 0.5) * 0.7 * height
      const startFromCenterX = gesture.startCenter.x - rect.left - width / 2
      const startFromCenterY = gesture.startCenter.y - rect.top - height / 2
      const currentFromCenterX = center.x - rect.left - width / 2
      const currentFromCenterY = center.y - rect.top - height / 2
      const translateX = currentFromCenterX - ratio * (startFromCenterX - baselineTranslateX)
      const translateY = currentFromCenterY - ratio * (startFromCenterY - baselineTranslateY)
      applyDraftTransform({
        x: clamp(0.5 + translateX / (0.7 * width), -0.25, 1.25),
        y: clamp(0.5 + translateY / (0.7 * height), -0.25, 1.25),
        scale,
      })
      return
    }

    if (points.length === 1 && gesture.startPoint) {
      applyDraftTransform({
        ...gesture.baseline,
        x: clamp(
          gesture.baseline.x + (points[0].x - gesture.startPoint.x) / (0.7 * width),
          -0.25,
          1.25,
        ),
        y: clamp(
          gesture.baseline.y + (points[0].y - gesture.startPoint.y) / (0.7 * height),
          -0.25,
          1.25,
        ),
      })
    }
  }

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    gesture.points.delete(event.pointerId)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* pointer capture can already be released by iOS after cancellation */
    }

    if (gesture.points.size > 0) {
      resetGestureBaseline()
      return
    }

    const next = transformRef.current
    commitActiveAsset({ ...asset, x: next.x, y: next.y, scale: next.scale })
    gesture.baseline = next
    gesture.startPoint = null
    gesture.startCenter = null
    gesture.startDistance = 0
  }

  return (
    <div className="multitrack-panel multitrack-panel--sheet">
      {isPdf ? (
        /*
         * A PDF gets the reader, not the framing gestures. One finger has to
         * belong to the page strip — a part you cannot turn is not a part —
         * and a pinch that also scrolled would turn the page every time
         * somebody zoomed in on the last system. Framing a PDF page is done
         * with the zoom slider in Layout, where it is a deliberate act.
         */
        <div className={`multitrack-panel__sheet-viewport multitrack-panel__sheet-viewport--${contentMode}`}>
          <SheetPdfPages
            src={asset.src}
            pageIndex={pageIndex}
            style={contentStyle}
            interactive={!interactionDisabled}
            onPageChange={setPage}
            onPageCount={setLivePageCount}
            onError={setImportError}
          />
        </div>
      ) : (
        <div
          className={`multitrack-panel__sheet-viewport multitrack-panel__sheet-viewport--${contentMode}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <img src={asset.src} alt={asset.fileName} className={`multitrack-panel__sheet-image multitrack-panel__sheet-image--${contentMode}`} style={contentStyle} draggable={false} />
        </div>
      )}
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label">
          <FileImage className="h-3.5 w-3.5" />
          <span className="truncate">{asset.fileName}</span>
          {cueWindows.length > 1 ? (
            <span className="multitrack-panel__sheet-cue-count">
              {activeIndex + 1}/{cueWindows.length}
            </span>
          ) : null}
        </div>
        <div className="multitrack-panel__sheet-actions">
          {onEdit ? (
            <Pressable type="button" intensity="soft" onClick={onEdit} className="multitrack-panel__sheet-edit">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Layout
            </Pressable>
          ) : null}
          <Pressable
            type="button"
            intensity="soft"
            onClick={() => {
              if (activeCue.isBase) onAssetChange(null)
              else onRemoveCue?.(activeCue.id)
            }}
            aria-label="Remove image or PDF"
            className="multitrack-panel__action"
          >
            <Trash2 className="h-4 w-4" />
          </Pressable>
        </div>
      </div>
      {isPdf && pageCount > 1 ? (
        <div className="multitrack-panel__sheet-pager" role="group" aria-label="Turn the page">
          <Pressable
            type="button"
            intensity="soft"
            aria-label="Previous page"
            disabled={interactionDisabled || pageIndex <= 0}
            onClick={() => setPage(pageIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Pressable>
          <span aria-live="polite">{Math.min(pageIndex + 1, pageCount)}/{pageCount}</span>
          <Pressable
            type="button"
            intensity="soft"
            aria-label="Next page"
            disabled={interactionDisabled || pageIndex >= pageCount - 1}
            onClick={() => setPage(pageIndex + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Pressable>
        </div>
      ) : null}
      {importError ? (
        <p className="multitrack-panel__sheet-error" role="alert">{importError}</p>
      ) : (
        <div className="multitrack-panel__gesture-hint" aria-hidden>
          <Move className="h-3.5 w-3.5" />
          {isPdf ? 'Scroll · tap the edge to turn' : 'Drag · pinch to zoom'}
        </div>
      )}
    </div>
  )
}
