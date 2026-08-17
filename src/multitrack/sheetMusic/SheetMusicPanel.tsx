import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { FileImage, Move, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { SheetMusicAsset, SheetMusicPanelState } from '../types'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from './sheetMusicUtils'
import { sheetCueWindows } from './sheetMusicTimeline'

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
  onAssetChange,
  onCueAssetChange,
  onRemoveCue,
  onEdit,
}: {
  panel: SheetMusicPanelState
  /** Timeline position — decides which screenshot in the cue list is on screen. */
  currentTimeSec?: number
  onAssetChange: (asset: SheetMusicAsset | null) => void
  onCueAssetChange?: (cueId: string, asset: SheetMusicAsset) => void
  onRemoveCue?: (cueId: string) => void
  onEdit?: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadedAssetUrlRef = useRef<string | null>(null)

  // Which screenshot is up right now, and where it sits in the sequence.
  const cueWindows = useMemo(() => sheetCueWindows(panel), [panel])
  let activeIndex = 0
  for (let i = 0; i < cueWindows.length; i += 1) {
    if (cueWindows[i].startSec <= currentTimeSec) activeIndex = i
  }
  const activeCue = cueWindows[activeIndex] ?? null
  const activeAsset = activeCue?.asset ?? null

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

  // Revoke the uploaded file's blob URL once no cue references it any more
  // (replaced, removed, or the panel unmounts) to avoid leaking memory.
  useEffect(() => {
    const uploaded = uploadedAssetUrlRef.current
    if (!uploaded) return
    if (cueWindows.some((window) => window.asset.src === uploaded)) return
    URL.revokeObjectURL(uploaded)
    uploadedAssetUrlRef.current = null
  }, [cueWindows])

  useEffect(() => {
    return () => {
      if (uploadedAssetUrlRef.current) {
        URL.revokeObjectURL(uploadedAssetUrlRef.current)
        uploadedAssetUrlRef.current = null
      }
    }
  }, [])

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
            if (!file) return
            void loadSheetMusicFile(file).then((asset) => {
              uploadedAssetUrlRef.current = asset.src
              onAssetChange(asset)
            })
            e.currentTarget.value = ''
          }}
        />
        <Pressable type="button" intensity="soft" onClick={() => fileInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center" aria-label="Add sheet music">
          <Upload className="h-8 w-8 text-stone-400" />
          <span className="mt-2 text-sm font-medium text-stone-500">Add music, photo, or PDF</span>
        </Pressable>
      </div>
    )
  }

  const asset = activeAsset
  const isPdf = asset.mimeType === 'application/pdf'
  // Older saved image assets predate contentMode. Treat them as fill so they
  // receive the same stripe-free behavior as newly imported photos.
  const contentMode = isPdf ? 'fit' : (asset.contentMode ?? 'fill')
  const contentStyle = {
    '--sheet-x': `${(draftTransform.x - 0.5) * 70}%`,
    '--sheet-y': `${(draftTransform.y - 0.5) * 70}%`,
    '--sheet-scale': draftTransform.scale,
  } as CSSProperties

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
    const moved = { ...asset, x: next.x, y: next.y, scale: next.scale }
    if (activeCue.isBase) onAssetChange(moved)
    else onCueAssetChange?.(activeCue.id, moved)
    gesture.baseline = next
    gesture.startPoint = null
    gesture.startCenter = null
    gesture.startDistance = 0
  }

  return (
    <div className="multitrack-panel multitrack-panel--sheet">
      <div
        className={`multitrack-panel__sheet-viewport multitrack-panel__sheet-viewport--${contentMode}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        {isPdf ? (
          <object data={asset.src} type="application/pdf" className="multitrack-panel__sheet-pdf" style={contentStyle} />
        ) : (
          <img src={asset.src} alt={asset.fileName} className={`multitrack-panel__sheet-image multitrack-panel__sheet-image--${contentMode}`} style={contentStyle} draggable={false} />
        )}
      </div>
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
      <div className="multitrack-panel__gesture-hint" aria-hidden>
        <Move className="h-3.5 w-3.5" />
        Drag · pinch to zoom
      </div>
    </div>
  )
}
