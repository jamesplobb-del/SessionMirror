import type { SheetMusicAsset } from '../types'
import { sheetPdfPageCount } from './sheetPdfSource'

export function sheetMusicAcceptAttribute(): string {
  return 'application/pdf,image/*'
}

/** iOS hands some files over with an empty type; the name still knows. */
function looksLikePdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function canDecodeImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve((image.naturalWidth || 0) > 0)
    image.onerror = () => resolve(false)
    image.src = src
  })
}

/**
 * Bring a part into a project.
 *
 * The file is opened here rather than at first paint, because a part that
 * cannot be read has to say so while the player is still in the act of
 * choosing one. The old flow accepted anything and left a white rectangle in
 * the middle of the video with no explanation — and for a PDF it did not even
 * know how many pages it had just imported.
 */
export async function loadSheetMusicFile(file: File): Promise<SheetMusicAsset> {
  const isPdf = looksLikePdf(file)
  const src = URL.createObjectURL(file)
  const asset: SheetMusicAsset = {
    src,
    mimeType: isPdf ? 'application/pdf' : (file.type || 'application/octet-stream'),
    fileName: file.name,
    x: 0.5,
    y: 0.5,
    scale: 1,
    contentMode: isPdf ? 'fit' : 'fill',
    framePosition: 'top',
    frameScale: 1,
  }

  if (isPdf) {
    try {
      asset.pageCount = await sheetPdfPageCount(src)
      asset.pageIndex = 0
    } catch {
      URL.revokeObjectURL(src)
      throw new Error('This PDF could not be opened. A photo of the page will always work.')
    }
    return asset
  }

  if (!(await canDecodeImage(src))) {
    URL.revokeObjectURL(src)
    throw new Error('This photo could not be opened. Try a JPEG or PNG, or export the part as a PDF.')
  }
  return asset
}
