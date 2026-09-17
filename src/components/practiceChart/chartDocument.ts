import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ChartPageSize } from './chartLayout'

/**
 * Opening a music PDF and drawing its pages.
 *
 * WKWebView's own `<object type="application/pdf">` renders a PDF but hands
 * back no control over it: there is no way to turn to a page, and no way at all
 * to show the bottom of one page above the top of the next, which is what a
 * half turn is. Rendering the pages ourselves is the only way to get the turn a
 * player actually asked for, so pdf.js is here on purpose rather than by habit.
 *
 * The legacy build is deliberate too: it carries its own core-js polyfills, so
 * it runs on the iOS 15 WebView this app still supports.
 */

type PdfModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let modulePromise: Promise<PdfModule> | null = null

async function loadPdfjs(): Promise<PdfModule> {
  modulePromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    return pdfjs
  })()
  return modulePromise
}

/**
 * A canvas this big is already past what any iPad screen can show, and each one
 * costs four bytes a pixel of WebContent memory. Three of them alive at once is
 * the whole render window, so the cap is what keeps a 10-page part from
 * pushing the WebView out of memory mid-take.
 */
const MAX_CANVAS_PIXELS = 4_000_000

export interface ChartDocument {
  readonly pageCount: number
  readonly pages: ChartPageSize[]
  /** Draws page `index` into `canvas` at `cssWidth`. Rejects if aborted. */
  renderPage(index: number, canvas: HTMLCanvasElement, cssWidth: number, signal: AbortSignal): Promise<void>
  destroy(): void
}

/** True when a render was cancelled rather than genuinely failing. */
export function isChartRenderCancelled(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    typeof error === 'object' && error !== null && 'name' in error &&
    (error as { name?: unknown }).name === 'RenderingCancelledException'
  )
}

export async function openPdfChart(bytes: Uint8Array): Promise<ChartDocument> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({
    // getDocument transfers the buffer to the worker and detaches it, so the
    // caller's cached copy has to survive a second open (replace, rotate, reopen).
    data: bytes.slice(),
    // The app runs under a custom scheme on device; fetching font data from the
    // worker there is unreliable, and the main thread already has the origin.
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: new URL('assets/standard_fonts/', document.baseURI).href,
  })
  let document_: PDFDocumentProxy
  try {
    document_ = await task.promise
  } catch (error) {
    await task.destroy().catch(() => {})
    throw error
  }
  const pages: ChartPageSize[] = []
  for (let number = 1; number <= document_.numPages; number += 1) {
    const page = await document_.getPage(number)
    const viewport = page.getViewport({ scale: 1 })
    pages.push({ width: viewport.width, height: viewport.height })
    page.cleanup()
  }
  let destroyed = false
  return {
    pageCount: document_.numPages,
    pages,
    async renderPage(index, canvas, cssWidth, signal) {
      if (destroyed) throw new DOMException('Document closed', 'AbortError')
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const page = await document_.getPage(index + 1)
      if (signal.aborted) { page.cleanup(); throw new DOMException('Cancelled', 'AbortError') }
      const base = page.getViewport({ scale: 1 })
      const cssScale = cssWidth / base.width
      const budget = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height * cssScale * cssScale))
      const density = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, budget))
      const viewport = page.getViewport({ scale: cssScale * density })
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) { page.cleanup(); throw new Error('Could not draw this page.') }
      canvas.width = Math.max(1, Math.round(viewport.width))
      canvas.height = Math.max(1, Math.round(viewport.height))
      const render = page.render({ canvasContext: context, viewport, background: '#ffffff' })
      const abort = () => render.cancel()
      signal.addEventListener('abort', abort)
      try {
        await render.promise
      } finally {
        signal.removeEventListener('abort', abort)
        page.cleanup()
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      void document_.destroy().catch(() => {})
    },
  }
}

/**
 * One document stays open at a time. Hiding the page and showing it again is a
 * normal thing to do mid-practice and must not re-parse the file, but two parts
 * open at once would hold two files' worth of glyphs for no reason.
 */
let openEntry: { key: string; document: Promise<ChartDocument> } | null = null

export function openCachedPdfChart(key: string, bytes: Uint8Array): Promise<ChartDocument> {
  if (openEntry?.key === key) return openEntry.document
  closeCachedPdfChart()
  const entry = { key, document: openPdfChart(bytes) }
  openEntry = entry
  // A file that fails to open must not stay cached as a rejected promise.
  entry.document.catch(() => { if (openEntry === entry) openEntry = null })
  return entry.document
}

export function closeCachedPdfChart(key?: string): void {
  const entry = openEntry
  if (!entry || (key !== undefined && entry.key !== key)) return
  openEntry = null
  entry.document.then(document_ => document_.destroy()).catch(() => {})
}
