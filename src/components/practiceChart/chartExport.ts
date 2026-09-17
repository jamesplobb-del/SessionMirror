import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { INK_RGB, inkStrokeWidthRatio, type InkStroke } from './chartInk'
import type { PracticeChart } from '../../utils/practiceChartStorage'

/**
 * Writing the marks into the part.
 *
 * The original pages are kept as they are and the marks are drawn on top, so
 * what comes out is the same PDF with the rehearsal marks in it — not a stack
 * of screenshots. A photo of a part becomes a one-page PDF the same way, which
 * is what a player means by "save my music with my markings on it".
 */

const SHARE_DIR = 'shared-charts'

function safeStem(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40)
  return stem || 'marked-music'
}

export async function buildMarkedPdf(chart: PracticeChart, strokes: InkStroke[]): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import('pdf-lib')

  let document_: Awaited<ReturnType<typeof PDFDocument.load>>
  if (chart.mimeType === 'application/pdf') {
    if (!chart.bytes) throw new Error('This music could not be read.')
    document_ = await PDFDocument.load(chart.bytes.slice(), { ignoreEncryption: true })
  } else {
    // A photo becomes a single page the size of the photo.
    const response = await fetch(chart.objectUrl)
    const bytes = new Uint8Array(await response.arrayBuffer())
    document_ = await PDFDocument.create()
    const image = chart.mimeType === 'image/png'
      ? await document_.embedPng(bytes)
      : await document_.embedJpg(bytes)
    const page = document_.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }

  const pages = document_.getPages()
  for (const stroke of strokes) {
    const page = pages[stroke.page]
    if (!page) continue
    const { width, height } = page.getSize()
    const [r, g, b] = INK_RGB[stroke.colour]
    const colour = rgb(r, g, b)
    const thickness = Math.max(0.6, Math.min(width, height) * inkStrokeWidthRatio(stroke.width))
    for (let index = 0; index + 3 < stroke.points.length; index += 2) {
      page.drawLine({
        // Page-normalised, top-down, into PDF points, bottom-up.
        start: { x: stroke.points[index] * width, y: height - stroke.points[index + 1] * height },
        end: { x: stroke.points[index + 2] * width, y: height - stroke.points[index + 3] * height },
        thickness,
        color: colour,
        opacity: 0.92,
        lineCap: 1,
      })
    }
  }
  return document_.save()
}

export interface ChartExportResult {
  ok: boolean
  message: string
}

export async function shareMarkedChart(
  chart: PracticeChart,
  strokes: InkStroke[],
): Promise<ChartExportResult> {
  const bytes = await buildMarkedPdf(chart, strokes)
  const fileName = `${safeStem(chart.fileName)}-marked.pdf`

  if (!Capacitor.isNativePlatform()) {
    if (typeof document === 'undefined') return { ok: false, message: 'Saving is not available here.' }
    const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoked late so the download has definitely started.
    window.setTimeout(() => URL.revokeObjectURL(url), 20_000)
    return { ok: true, message: 'Saved a marked copy.' }
  }

  try {
    await Filesystem.mkdir({ path: SHARE_DIR, directory: Directory.Cache, recursive: true })
  } catch {
    /* mkdir throws rather than no-ops on an existing path */
  }
  const path = `${SHARE_DIR}/${fileName}`
  await Filesystem.writeFile({ path, directory: Directory.Cache, data: encodeBase64(bytes) })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  await Share.share({
    title: fileName,
    // No `text`: on iOS a string alongside a file makes Mail and Messages
    // inline it and drop the attachment.
    files: [uri],
    dialogTitle: 'Save marked music',
  })
  return { ok: true, message: 'Marked copy ready to save.' }
}

const CHUNK = 0x8000

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
  }
  return btoa(binary)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
