import { openPdfChart, type ChartDocument } from '../../components/practiceChart/chartDocument'

/**
 * PDFs on the multitrack canvas.
 *
 * Same engine as the practice room's music page — pdf.js, legacy build, the
 * same canvas budget — because the reason is the same: a WebView's own
 * `<object type="application/pdf">` renders something and then refuses to be
 * asked for page two, which is exactly what a part in a multitrack box needs.
 *
 * The practice room holds one document at a time and is right to: it is showing
 * one player one part. A multitrack project is the other shape. One file is on
 * screen as several cues at once — page 1 from the downbeat, page 2 cutting in
 * at 0:42 — and those cues are the same document, so it is opened once per file
 * and handed out by reference. Two files is the cap: a project that quotes two
 * parts is real, a project that quotes ten is not, and every open document
 * holds that file's glyphs in WebContent memory for as long as it is open.
 */

const MAX_OPEN = 2

interface Entry {
  src: string
  document: Promise<ChartDocument>
  /** Panels currently drawing from it. A held document is never evicted. */
  holds: number
  usedAt: number
}

const entries: Entry[] = []

function evict(): void {
  while (entries.length > MAX_OPEN) {
    const idle = entries
      .filter(entry => entry.holds === 0)
      .sort((a, b) => a.usedAt - b.usedAt)[0]
    if (!idle) return
    entries.splice(entries.indexOf(idle), 1)
    idle.document.then(document_ => document_.destroy()).catch(() => {})
  }
}

/**
 * The parsed document for `src`, opening it if this is the first ask. `hold`
 * marks it as on screen, so an off-screen file is the one that gets closed when
 * a third arrives.
 */
export function openSheetPdf(src: string, hold = false): Promise<ChartDocument> {
  const existing = entries.find(entry => entry.src === src)
  if (existing) {
    existing.usedAt = Date.now()
    if (hold) existing.holds += 1
    return existing.document
  }
  const entry: Entry = {
    src,
    holds: hold ? 1 : 0,
    usedAt: Date.now(),
    document: (async () => {
      const response = await fetch(src)
      if (!response.ok) throw new Error('This file could not be read.')
      return openPdfChart(new Uint8Array(await response.arrayBuffer()))
    })(),
  }
  entries.push(entry)
  // A file that fails to open must not stay cached as a rejected promise. Drop
  // this entry by identity: a retry may already have put a new one under the
  // same src, and that one is still good.
  entry.document.catch(() => {
    const index = entries.indexOf(entry)
    if (index >= 0) entries.splice(index, 1)
  })
  evict()
  return entry.document
}

/** Give back a hold taken by `openSheetPdf(src, true)`. */
export function releaseSheetPdf(src: string): void {
  const entry = entries.find(entry => entry.src === src)
  if (!entry) return
  entry.holds = Math.max(0, entry.holds - 1)
  evict()
}

/** Closing the workspace. Every file goes, held or not. */
export function closeAllSheetPdfs(): void {
  const open = entries.splice(0, entries.length)
  for (const entry of open) entry.document.then(document_ => document_.destroy()).catch(() => {})
}

/**
 * How many pages a file has, for the moment of import — a PDF that cannot be
 * opened has to say so while the player is still holding the file picker, not
 * as a white rectangle in the middle of their video.
 */
export async function sheetPdfPageCount(src: string): Promise<number> {
  const document_ = await openSheetPdf(src)
  return document_.pageCount
}
