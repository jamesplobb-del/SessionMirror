import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { isChartRenderCancelled, type ChartDocument } from '../../components/practiceChart/chartDocument'
import { openSheetPdf, releaseSheetPdf } from './sheetPdfSource'

/**
 * A PDF part inside a multitrack box.
 *
 * One page per slot, slots exactly the size of the box, stacked in a strip that
 * snaps — so a flick moves one page and lands on it, and a tap on either edge
 * turns it. That is the same turn the practice room's page does, at the size a
 * video panel actually is.
 *
 * What it deliberately does not reuse is that page's strip geometry. There the
 * slot is a whole iPad and a half turn has to be exactly half of it; here the
 * box is a fixed rectangle in a video, only ever one page is burned into the
 * export, and a half turn would mean showing the viewer two halves of a part
 * they cannot scroll. Uniform slots are the whole layout, so they are four
 * lines of arithmetic rather than an import.
 */

/** How much of each edge turns the page. The middle is the music. */
const TURN_ZONE = 0.28
/** A tap this short and this still is a turn; anything longer is a scroll. */
const TAP_MS = 500
const TAP_SLOP_PX = 8
/** How long a flick keeps going before the page it landed on is worth storing. */
const SETTLE_MS = 260

export interface SheetPdfPagesProps {
  src: string
  /** The page on screen; also the page the export burns in. */
  pageIndex: number
  /** Framing for this cue, shared with the image path. */
  style: CSSProperties
  /** Off while a take is recording, playing or exporting — the page is fixed. */
  interactive: boolean
  onPageChange: (pageIndex: number) => void
  /** Reported once the file is open, so the asset can remember its length. */
  onPageCount: (pageCount: number) => void
  onError: (message: string) => void
}

export default function SheetPdfPages({
  src, pageIndex, style, interactive, onPageChange, onPageCount, onError,
}: SheetPdfPagesProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [document_, setDocument] = useState<ChartDocument | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [slot, setSlot] = useState({ width: 0, height: 0 })
  const [visible, setVisible] = useState(pageIndex)

  /* ---- Open the file ---------------------------------------------------- */

  // The callbacks are props of a panel that re-renders on every gesture frame;
  // the file must not be reopened because one of them changed identity.
  const report = useRef({ onPageCount, onError })
  report.current = { onPageCount, onError }

  useEffect(() => {
    let cancelled = false
    setDocument(null)
    setPageCount(0)
    openSheetPdf(src, true).then(opened => {
      if (cancelled) return
      setDocument(opened)
      setPageCount(opened.pageCount)
      report.current.onPageCount(opened.pageCount)
    }).catch(() => {
      if (cancelled) return
      report.current.onError('This PDF could not be opened. A photo of the page will always work.')
    })
    return () => {
      cancelled = true
      releaseSheetPdf(src)
    }
  }, [src])

  /* ---- Measure the box -------------------------------------------------- */

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setSlot({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /* ---- Reading position ------------------------------------------------- */

  const clamped = Math.min(Math.max(0, pageIndex), Math.max(0, pageCount - 1))

  /*
   * The page the project says is showing wins whenever it changes — a cue
   * selected on the timeline, a page turned from the layout sheet, an undo.
   * `visible` only runs ahead of it while a flick is still settling.
   */
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || pageCount === 0 || slot.height <= 0) return
    setVisible(clamped)
    if (Math.abs(element.scrollTop - clamped * slot.height) > 1) {
      element.scrollTop = clamped * slot.height
    }
  }, [clamped, pageCount, slot.height])

  const settle = useRef<number | null>(null)
  useEffect(() => () => { if (settle.current !== null) window.clearTimeout(settle.current) }, [])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element || slot.height <= 0 || pageCount === 0) return
    const landed = Math.min(pageCount - 1, Math.max(0, Math.round(element.scrollTop / slot.height)))
    setVisible(landed)
    if (settle.current !== null) window.clearTimeout(settle.current)
    // Every frame of a flick passes through the pages in between; only the one
    // it stops on is a page the player chose, and only that one is an edit.
    settle.current = window.setTimeout(() => {
      settle.current = null
      if (landed !== clamped) onPageChange(landed)
    }, SETTLE_MS)
  }

  const turn = (direction: 1 | -1) => {
    const element = scrollRef.current
    const next = Math.min(pageCount - 1, Math.max(0, visible + direction))
    if (!element || next === visible) return
    setVisible(next)
    element.scrollTop = next * slot.height
    onPageChange(next)
  }

  /*
   * Tap to turn, drag to scroll. Two fingers never reach here — the panel keeps
   * pinch for framing, and a pinch that also turned the page would make zooming
   * in on the last system a page turn.
   */
  const tap = useRef<{ id: number; x: number; y: number; at: number } | null>(null)

  const pages = pageCount > 0 ? pageCount : 1

  return (
    <div
      ref={scrollRef}
      className="multitrack-sheet-pages"
      data-interactive={interactive ? 'true' : 'false'}
      onScroll={handleScroll}
      onPointerDown={event => {
        tap.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: Date.now() }
      }}
      onPointerUp={event => {
        const start = tap.current
        tap.current = null
        if (!interactive || !start || start.id !== event.pointerId) return
        if (Date.now() - start.at > TAP_MS) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return
        const box = event.currentTarget.getBoundingClientRect()
        const position = (event.clientX - box.left) / Math.max(1, box.width)
        if (position <= TURN_ZONE) turn(-1)
        else if (position >= 1 - TURN_ZONE) turn(1)
      }}
      onPointerCancel={() => { tap.current = null }}
    >
      <div className="multitrack-sheet-pages__strip" style={{ height: `${pages * 100}%` }}>
        {Array.from({ length: pages }, (_, index) => (
          <div key={index} className="multitrack-sheet-pages__slot" style={{ height: `${100 / pages}%` }}>
            {/* Only pages next to the one on screen carry a canvas: a page of a
                part costs megabytes, and a 20-page PDF in a box would hold the
                lot while the box is a thumbnail in the corner of a video. */}
            {document_ && Math.abs(index - visible) <= 1 ? (
              <SheetPdfPage
                document={document_}
                index={index}
                cssWidth={slot.width}
                style={style}
                onError={onError}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * One drawn page. The canvas is released the moment the page leaves the window
 * around the one being read, because on iOS that memory is the difference
 * between a part that scrolls and a WebView that is killed mid-take.
 */
function SheetPdfPage({ document: pdf, index, cssWidth, style, onError }: {
  document: ChartDocument
  index: number
  cssWidth: number
  style: CSSProperties
  onError: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  const failed = useRef(onError)
  failed.current = onError

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || cssWidth <= 0) return
    const controller = new AbortController()
    setDrawn(false)
    pdf.renderPage(index, canvas, cssWidth, controller.signal)
      .then(() => { if (!controller.signal.aborted) setDrawn(true) })
      .catch((error: unknown) => {
        if (isChartRenderCancelled(error) || controller.signal.aborted) return
        failed.current('A page of this PDF could not be drawn.')
      })
    return () => {
      controller.abort()
      canvas.width = 0
      canvas.height = 0
    }
  }, [cssWidth, index, pdf])

  return (
    <canvas
      ref={canvasRef}
      className="multitrack-sheet-pages__canvas"
      style={style}
      data-drawn={drawn}
      aria-hidden={!drawn}
    />
  )
}
