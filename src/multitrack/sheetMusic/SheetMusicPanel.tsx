import { useRef } from 'react'
import { FileImage, Trash2, Upload } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import type { SheetMusicAsset, SheetMusicPanelState } from '../types'
import { loadSheetMusicFile, sheetMusicAcceptAttribute } from './sheetMusicUtils'

export default function SheetMusicPanel({ panel, onAssetChange }: { panel: SheetMusicPanelState; onAssetChange: (asset: SheetMusicAsset | null) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  if (!panel.asset) {
    return (
      <div className="multitrack-panel multitrack-panel--empty">
        <input ref={fileInputRef} type="file" accept={sheetMusicAcceptAttribute()} className="hidden" onChange={(e) => void loadSheetMusicFile(e.target.files?.[0]!).then(onAssetChange)} />
        <Pressable type="button" intensity="soft" onClick={() => fileInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center" aria-label="Add sheet music">
          <Upload className="h-8 w-8 text-stone-400" />
          <span className="mt-2 text-sm font-medium text-stone-500">Add sheet music</span>
        </Pressable>
      </div>
    )
  }
  const isPdf = panel.asset.mimeType === 'application/pdf'
  return (
    <div className="multitrack-panel multitrack-panel--sheet">
      {isPdf ? <object data={panel.asset.src} type="application/pdf" className="multitrack-panel__sheet-pdf" /> : <img src={panel.asset.src} alt={panel.asset.fileName} className="multitrack-panel__sheet-image" />}
      <div className="multitrack-panel__overlay">
        <div className="multitrack-panel__label"><FileImage className="h-3.5 w-3.5" /><span className="truncate">{panel.asset.fileName}</span></div>
        <Pressable type="button" intensity="soft" onClick={() => onAssetChange(null)} aria-label="Remove" className="multitrack-panel__action"><Trash2 className="h-4 w-4" /></Pressable>
      </div>
    </div>
  )
}
