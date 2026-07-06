import type { SheetMusicAsset } from '../types'

export function sheetMusicAcceptAttribute(): string {
  return 'application/pdf,image/*'
}

export async function loadSheetMusicFile(file: File): Promise<SheetMusicAsset> {
  return {
    src: URL.createObjectURL(file),
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
    x: 0.5,
    y: 0.5,
    scale: 1,
    framePosition: 'top',
    frameScale: 1,
  }
}
