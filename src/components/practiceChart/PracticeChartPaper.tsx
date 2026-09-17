import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from 'react'
import type { PracticeChart } from '../../utils/practiceChartStorage'
import {
  chartOffsetForFraction, chartPagesInView,
  chartScrollFraction, chartSpreadFits, chartTurnStops, layoutChartStrip,
  nearestChartStop, nextChartStop, resolveChartFit,
  type ChartFitPreference, type ChartPageSize, type ChartStripLayout,
} from './chartLayout'
import { isChartRenderCancelled, openCachedPdfChart, type ChartDocument } from './chartDocument'
import {
  inkPathData, inkStrokeWidthPx, simplifyStroke, INK_CSS,
  type InkColour, type InkStroke, type InkWidth,
} from './chartInk'

export interface ChartPaperHandle {
  /** Forward or back by one stop: a whole page, or half of one. */
  turn(direction: 1 | -1): void
}

export interface ChartPaperView {
  first: number
  last: number
  count: number
}

interface PracticeChartPaperProps {
  chart: PracticeChart
  fit: ChartFitPreference
  halfTurn: boolean
  initialFraction: number
  handleRef: RefObject<ChartPaperHandle | null>
  onView: (view: ChartPaperView) => void
  onFraction: (fraction: number) => void
  onError: (message: string) => void
  /** The file itself could not be opened, so there is no page to show at all. */
  onLoadFailed: () => void
  /** Whether a two-page spread is worth offering for this part on this screen. */
  onSpreadAvailable: (available: boolean) => void
  /** Marks already on this part. */
  strokes: readonly InkStroke[]
  /** The marker colour in hand, or null when the marker is capped. */
  marker: InkColour | null
  /** Nib the current marks are drawn with. */
  inkWidth: InkWidth
  onStroke: (stroke: InkStroke) => void
}

/** How long a player keeps scrolling before the position is worth writing down. */
const POSITION_SETTLE_MS = 450

export default function PracticeChartPaper({
  chart, fit, halfTurn, initialFraction, handleRef, onView, onFraction, onError, onLoadFailed,
  onSpreadAvailable, strokes, marker, inkWidth, onStroke,
}: PracticeChartPaperProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [document_, setDocument] = useState<ChartDocument | null>(null)
  const [pages, setPages] = useState<ChartPageSize[] | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const fractionRef = useRef(initialFraction)
  const restoredRef = useRef(false)
  /** Mirrors scrollTop in state, because the render window is React's to decide. */
  const [offset, setOffset] = useState(0)

  /* ---- Open the file ---------------------------------------------------- */

  const documentKey = `${chart.projectId}:${chart.fileName}:${chart.bytes?.byteLength ?? 0}`

  useEffect(() => {
    let cancelled = false
    restoredRef.current = false
    setDocument(null)
    setPages(null)
    if (chart.mimeType === 'application/pdf') {
      if (!chart.bytes) {
        onError('This music could not be read. Try adding the file again.')
        onLoadFailed()
        return
      }
      openCachedPdfChart(documentKey, chart.bytes).then(opened => {
        if (cancelled) return
        setDocument(opened)
        setPages(opened.pages)
      }).catch(() => {
        if (cancelled) return
        onError('This PDF could not be opened. A photo of the part will always work.')
        onLoadFailed()
      })
      return () => { cancelled = true }
    }
    const image = new Image()
    image.onload = () => {
      if (cancelled) return
      setPages([{ width: image.naturalWidth || 1, height: image.naturalHeight || 1 }])
    }
    image.onerror = () => {
      if (cancelled) return
      onError('This photo could not be opened.')
      onLoadFailed()
    }
    image.src = chart.objectUrl
    return () => { cancelled = true; image.onload = null; image.onerror = null }
  }, [chart.bytes, chart.mimeType, chart.objectUrl, documentKey, onError, onLoadFailed])

  /* ---- Measure the room ------------------------------------------------- */

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const resolvedFit = useMemo(
    () => resolveChartFit(fit, pages ?? [], viewport.width, viewport.height),
    [fit, pages, viewport.width, viewport.height],
  )
  const layout = useMemo<ChartStripLayout>(
    () => layoutChartStrip(pages ?? [], viewport.width, viewport.height, resolvedFit),
    [pages, viewport.width, viewport.height, resolvedFit],
  )

  const spreadFits = useMemo(
    () => chartSpreadFits(pages ?? [], viewport.width, viewport.height),
    [pages, viewport.width, viewport.height],
  )
  useEffect(() => { onSpreadAvailable(spreadFits) }, [onSpreadAvailable, spreadFits])
  const stops = useMemo(() => chartTurnStops(layout, halfTurn), [layout, halfTurn])

  /* ---- Reading position ------------------------------------------------- */

  const reportView = useCallback((offset: number) => {
    if (layout.tops.length === 0) return
    const { first, last } = chartPagesInView(layout, offset, viewport.height)
    onView({ first, last, count: layout.tops.length })
  }, [layout, onView, viewport.height])

  // Restoring happens once per file: a rotation keeps the exact fraction, but
  // coming back to a part lands on a real turn stop rather than half a system
  // into one, where the first tap would only move a sliver.
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || layout.total <= 0) return
    const wanted = chartOffsetForFraction(layout, fractionRef.current)
    const target = restoredRef.current ? wanted : nearestChartStop(stops, wanted)
    restoredRef.current = true
    element.scrollTop = target
    setOffset(target)
    reportView(target)
    // `stops` only refines where a restore may land; it must not re-seek on a
    // half-turn toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, reportView])

  /*
   * A mark in progress. It is kept as page-normalised points from the first
   * move, so the line that appears under the finger is the same line that gets
   * stored — there is no separate screen-space path to reconcile afterwards.
   */
  const [drawing, setDrawing] = useState<{ page: number; points: number[] } | null>(null)
  const drawingRef = useRef<{ pointerId: number; page: number; points: number[] } | null>(null)

  const beginStroke = useCallback((page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!marker || event.button !== 0 || drawingRef.current) return
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    const point = [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]
    drawingRef.current = { pointerId: event.pointerId, page, points: point }
    setDrawing({ page, points: point })
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [marker])

  const extendStroke = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drawingRef.current
    if (!active || active.pointerId !== event.pointerId) return
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    const last = active.points.length
    if (last >= 2 && Math.hypot(x - active.points[last - 2], y - active.points[last - 1]) < 0.001) return
    active.points.push(x, y)
    setDrawing({ page: active.page, points: [...active.points] })
    event.preventDefault()
  }, [])

  const endStroke = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drawingRef.current
    if (!active || active.pointerId !== event.pointerId) return
    drawingRef.current = null
    setDrawing(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // A tap is not a mark. Two points is the shortest thing worth keeping, and
    // it becomes a dot the player can see.
    if (!marker) return
    const points = active.points.length >= 4
      ? simplifyStroke(active.points)
      : [...active.points, active.points[0] + 0.0015, active.points[1] + 0.0015]
    onStroke({ page: active.page, colour: marker, points, width: inkWidth })
  }, [inkWidth, marker, onStroke])

  const settleRef = useRef<number | null>(null)
  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const next = element.scrollTop
    setOffset(next)
    fractionRef.current = chartScrollFraction(layout, next)
    reportView(next)
    if (settleRef.current !== null) window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null
      onFraction(fractionRef.current)
    }, POSITION_SETTLE_MS)
  }, [layout, onFraction, reportView])

  // Hiding the page unmounts the paper, and the settle timer would take the
  // last few seconds of reading with it. Write the position out on the way out.
  const flushRef = useRef(onFraction)
  flushRef.current = onFraction
  useEffect(() => () => {
    if (settleRef.current === null) return
    window.clearTimeout(settleRef.current)
    settleRef.current = null
    flushRef.current(fractionRef.current)
  }, [])

  /*
   * A turn lands, it does not glide. Smooth scrolling is an animation, and an
   * animation can be throttled — coming back from the background, under a
   * finger, on a busy frame — which would leave a player looking at half of two
   * pages in the middle of a phrase. A turned page is also simply what a turned
   * page does: it is there, or it is not.
   */
  const turn = useCallback((direction: 1 | -1) => {
    const element = scrollRef.current
    if (!element) return
    const target = nextChartStop(stops, element.scrollTop, direction)
    if (target === null) return
    element.scrollTop = target
    setOffset(target)
    fractionRef.current = chartScrollFraction(layout, target)
    reportView(target)
    onFraction(fractionRef.current)
  }, [layout, onFraction, reportView, stops])

  useEffect(() => {
    handleRef.current = { turn }
    return () => { handleRef.current = null }
  }, [handleRef, turn])

  /* ---- Which pages to actually draw -------------------------------------- */

  const window_ = useMemo(
    () => (layout.tops.length > 0
      ? chartPagesInView(layout, offset, viewport.height)
      : { first: 0, last: 0 }),
    [layout, offset, viewport.height],
  )

  const strokesByPage = useMemo(() => {
    const byPage = new Map<number, InkStroke[]>()
    for (const stroke of strokes) {
      const list = byPage.get(stroke.page)
      if (list) list.push(stroke)
      else byPage.set(stroke.page, [stroke])
    }
    return byPage
  }, [strokes])

  const ready = layout.tops.length > 0

  /*
   * Only pages near the viewport carry a canvas. The element itself always
   * exists, so scrolling in and out of the window never disturbs the page's
   * position or its marks — only the expensive part comes and goes.
   */
  const renderPageFace = (index: number) => (
    <>
      {index >= window_.first - 1 && index <= window_.last + 1 && (
        document_
          ? <ChartPdfPage
              document={document_}
              index={index}
              cssWidth={layout.widths[index]}
              onError={onError}
            />
          : <img src={chart.objectUrl} alt="" draggable={false} />
      )}
      <ChartPageInk
        strokes={strokesByPage.get(index)}
        live={drawing?.page === index ? drawing.points : null}
        liveColour={marker}
        liveWidth={inkWidth}
      />
    </>
  )

  return (
    <div
      ref={scrollRef}
      className="practice-chart-scroll"
      onScroll={handleScroll}
      role="document"
      aria-label={`${chart.fileName}${ready ? `, ${layout.tops.length} page${layout.tops.length === 1 ? '' : 's'}` : ''}`}
    >
      {/*
        * One strip, one element per page, keyed by page index and never moved
        * between parents. That is the whole reason a half turn is instant: the
        * canvas a page was drawn into stays mounted, and turning only changes
        * where the strip is scrolled to. Composing the two halves out of
        * separate panes re-mounted every visible page on every tap, which is
        * what "it reloads the whole page" was.
        */}
      <div className="practice-chart-strip" style={{ height: ready ? layout.total : '100%' }}>
        {layout.tops.map((top, index) => (
          <div
            key={index}
            className={`practice-chart-page${marker ? ' practice-chart-page--marking' : ''}`}
            style={{
              top, left: layout.lefts[index],
              height: layout.heights[index], width: layout.widths[index],
            }}
            onPointerDown={marker ? event => beginStroke(index, event) : undefined}
            onPointerMove={marker ? extendStroke : undefined}
            onPointerUp={marker ? endStroke : undefined}
            onPointerCancel={marker ? endStroke : undefined}
          >
            {renderPageFace(index)}
          </div>
        ))}
        {/* The join between two slots, so a half turn reads as two pages and
            not as one long one. */}
        {halfTurn && layout.rows.slice(1).map((row, index) => (
          <div
            key={`join-${index}`}
            className="practice-chart-join"
            style={{ top: row.top }}
            aria-hidden
          />
        ))}
      </div>
    </div>
  )
}

/**
 * The marks on one page, drawn in the page's own 0..1000 space so they sit
 * exactly where they were put at any zoom, in a spread, or after a rotation.
 * `non-scaling-stroke` keeps the marker the same weight on screen however far
 * the page is scaled, which is what a marker does on paper.
 */
function ChartPageInk({ strokes, live, liveColour, liveWidth }: {
  strokes: InkStroke[] | undefined
  live: number[] | null
  liveColour: InkColour | null
  liveWidth?: InkWidth
}) {
  if (!strokes?.length && !live) return null
  return (
    <svg className="practice-chart-ink" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
      {strokes?.map((stroke, index) => (
        <path
          key={index}
          d={inkPathData(stroke.points)}
          stroke={INK_CSS[stroke.colour]}
          strokeWidth={inkStrokeWidthPx(stroke.width)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {live && live.length >= 2 && (
        <path
          d={inkPathData(live.length >= 4 ? live : [...live, ...live])}
          stroke={INK_CSS[liveColour ?? 'black']}
          strokeWidth={inkStrokeWidthPx(liveWidth)}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

/**
 * One drawn page. The canvas is released the moment the page leaves the render
 * window — an iPad-sized page costs megabytes, and leaving a dozen of them
 * alive is how a WebView runs out of memory in the middle of a take.
 */
function ChartPdfPage({ document: chartDocument, index, cssWidth, onError }: {
  document: ChartDocument
  index: number
  cssWidth: number
  onError: (message: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawn, setDrawn] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || cssWidth <= 0) return
    const controller = new AbortController()
    setDrawn(false)
    chartDocument.renderPage(index, canvas, cssWidth, controller.signal)
      .then(() => { if (!controller.signal.aborted) setDrawn(true) })
      .catch((error: unknown) => {
        if (isChartRenderCancelled(error) || controller.signal.aborted) return
        onError('A page of this PDF could not be drawn.')
      })
    return () => {
      controller.abort()
      canvas.width = 0
      canvas.height = 0
    }
  }, [chartDocument, cssWidth, index, onError])
  return <canvas ref={canvasRef} data-drawn={drawn} aria-hidden={!drawn} />
}
