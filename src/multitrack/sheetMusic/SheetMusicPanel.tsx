import { useRef, type CSSProperties, type PointerEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileImage, Maximize2, Minimize2, RotateCcw, Trash2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { SheetMusicAsset, SheetMusicPanelState } from '../types'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from './sheetMusicUtils'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const framePositions: Array<NonNullable<SheetMusicAsset['framePosition']>> = ['top', 'bottom', 'left', 'right']

export default function SheetMusicPanel({ panel, onAssetChange }: { panel: SheetMusicPanelState; onAssetChange: (asset: SheetMusicAsset | null) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null)

  if (!panel.asset) {
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
            void loadSheetMusicFile(file).then(onAssetChange)
            e.currentTarget.value = ''
          }}
        />
        <Pressable type="button" intensity="soft" onClick={() => fileInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center" aria-label="Add sheet music">
          <Upload className="h-8 w-8 text-stone-400" />
          <span className="mt-2 text-sm font-medium text-stone-500">Add sheet music</span>
        </Pressable>
      </div>
    )
  }

  const asset = panel.asset
  const isPdf = panel.asset.mimeType === 'application/pdf'
  const contentStyle = {
    '--sheet-x': `${((asset.x ?? 0.5) - 0.5) * 70}%`,
    '--sheet-y': `${((asset.y ?? 0.5) - 0.5) * 70}%`,
    '--sheet-scale': asset.scale ?? 1,
  } as CSSProperties
  const updateAsset = (patch: Partial<SheetMusicAsset>) => onAssetChange({ ...asset, ...patch })

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: asset.x ?? 0.5,
      startY: asset.y ?? 0.5,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = event.currentTarget.getBoundingClientRect()
    updateAsset({
      x: clamp(drag.startX + (event.clientX - drag.startClientX) / Math.max(1, rect.width), -0.25, 1.25),
      y: clamp(drag.startY + (event.clientY - drag.startClientY) / Math.max(1, rect.height), -0.25, 1.25),
    })
  }

  const endDrag = () => {
    dragRef.current = null
  }

  return (
    <div className="multitrack-panel multitrack-panel--sheet">
      <div
        className="multitrack-panel__sheet-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {isPdf ? (
          <object data={asset.src} type="application/pdf" className="multitrack-panel__sheet-pdf" style={contentStyle} />
        ) : (
          <img src={asset.src} alt={asset.fileName} className="multitrack-panel__sheet-image" style={contentStyle} draggable={false} />
        )}
      </div>
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label"><FileImage className="h-3.5 w-3.5" /><span className="truncate">{asset.fileName}</span></div>
        <Pressable type="button" intensity="soft" onClick={() => onAssetChange(null)} aria-label="Remove" className="multitrack-panel__action"><Trash2 className="h-4 w-4" /></Pressable>
      </div>
      <div className="multitrack-panel__sheet-tools" onPointerDown={(event) => event.stopPropagation()}>
        <div className="multitrack-panel__sheet-tool-row" aria-label="Sheet music position">
          {framePositions.map((position) => {
            const Icon = position === 'top' ? ArrowUp : position === 'bottom' ? ArrowDown : position === 'left' ? ArrowLeft : ArrowRight
            return (
              <Pressable
                key={position}
                type="button"
                intensity="icon"
                className={asset.framePosition === position || (!asset.framePosition && position === 'top') ? 'is-active' : ''}
                onClick={() => updateAsset({ framePosition: position })}
                aria-label={`Move sheet music ${position}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </Pressable>
            )
          })}
        </div>
        <div className="multitrack-panel__sheet-tool-row">
          <Pressable type="button" intensity="icon" onClick={() => updateAsset({ frameScale: clamp((asset.frameScale ?? 1) - 0.15, 0.65, 1.8) })} aria-label="Make sheet music box smaller"><Minimize2 className="h-3.5 w-3.5" /></Pressable>
          <Pressable type="button" intensity="icon" onClick={() => updateAsset({ frameScale: clamp((asset.frameScale ?? 1) + 0.15, 0.65, 1.8) })} aria-label="Make sheet music box bigger"><Maximize2 className="h-3.5 w-3.5" /></Pressable>
          <Pressable type="button" intensity="icon" onClick={() => updateAsset({ scale: clamp((asset.scale ?? 1) - 0.1, 0.6, 2.5) })} aria-label="Zoom sheet music out"><ZoomOut className="h-3.5 w-3.5" /></Pressable>
          <Pressable type="button" intensity="icon" onClick={() => updateAsset({ scale: clamp((asset.scale ?? 1) + 0.1, 0.6, 2.5) })} aria-label="Zoom sheet music in"><ZoomIn className="h-3.5 w-3.5" /></Pressable>
          <Pressable type="button" intensity="icon" onClick={() => updateAsset({ x: 0.5, y: 0.5, scale: 1, frameScale: 1, framePosition: 'top' })} aria-label="Reset sheet music layout"><RotateCcw className="h-3.5 w-3.5" /></Pressable>
        </div>
      </div>
    </div>
  )
}
