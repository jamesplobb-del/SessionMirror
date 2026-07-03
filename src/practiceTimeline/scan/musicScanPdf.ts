import * as pdfjs from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { MusicScanPageImage } from './musicScanTypes'

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

const MAX_PDF_PAGES = 6
const RENDER_SCALE = 1.75

export async function pdfFileToPageImages(file: File): Promise<MusicScanPageImage[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: buffer }).promise
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const pages: MusicScanPageImage[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const context = canvas.getContext('2d')
    if (!context) continue

    await page.render({ canvasContext: context, viewport }).promise
    pages.push({
      page: pageNumber,
      dataUrl: canvas.toDataURL('image/jpeg', 0.88),
      width: viewport.width,
      height: viewport.height,
    })
  }

  if (pdf.numPages > MAX_PDF_PAGES) {
    pages.push({
      page: pageCount + 1,
      dataUrl: '',
      width: 0,
      height: 0,
    })
  }

  return pages.filter((page) => page.dataUrl.length > 0)
}

export async function imageFileToPageImages(file: File): Promise<MusicScanPageImage[]> {
  const dataUrl = await readFileAsDataUrl(file)
  const dimensions = await loadImageDimensions(dataUrl)
  return [{ page: 1, dataUrl, ...dimensions }]
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

export function fileToScanPages(file: File): Promise<MusicScanPageImage[]> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return pdfFileToPageImages(file)
  }
  return imageFileToPageImages(file)
}
