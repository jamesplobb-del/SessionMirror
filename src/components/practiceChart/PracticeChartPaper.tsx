import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from 'react'
import type { PracticeChart } from '../../utils/practiceChartStorage'
import {
  chartHalfTurnPresentation, chartOffsetAfterReflow, chartOffsetForFraction, chartPagesInView,
  chartScrollFraction, chartScreenHalfTurnBands, chartScreenHalfTurnStops, chartSpreadFits, chartTurnStops, layoutChartStrip,
  nearestChartStop, nextChartStop, resolveChartFit,
  type ChartFitPreference, type ChartPageSize, type ChartStripLayout,
} from './chartLayout'
import { isChartRenderCancelled, openCachedPdfChart, type ChartDocument } from './chartDocument'
import {
  inkPathData, inkStrokeWidthPx, isInkColour, simplifyStroke, INK_CSS,
  type InkColour, type InkStroke, type InkTool, type InkWidth,
} from './chartInk'

export interface ChartPaperHandle {
  /** Forward or back by one stop: a whole page, or half of one. */
  turn(direction: 1 | -1): void
  /** Return to the selected page fit when a page-size control is chosen. */
  resetZoom(): void
  zoomBy(direction: 1 | -1): void
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
  onZoom: (zoom: number) => void
  onFraction: (fraction: number) => void
  onError: (message: string) => void
  /** The file itself could not be opened, so there is no page to show at all. */
  onLoadFailed: () => void
  /** Whether a two-page spread is worth offering for this part on this screen. */
  onSpreadAvailable: (available: boolean) => void
  /** Marks already on this part. */
  strokes: readonly InkStroke[]
  /** What is in hand — a marker colour, the eraser, or nothing. */
  marker: InkTool | null
  /** Nib the current marks are drawn with. */
  inkWidth: InkWidth
  onStroke: (stroke: InkStroke) => void
  /** Rub out every mark the eraser touches, in page-normalised units. */
  onErase: (page: number, x: number, y: number, radiusX: number, radiusY: number) => void
}

/**
 * How big the eraser is on screen, in px. Sized to a fingertip rather than to
 * the nib: you rub an area out, you do not trace the line back.
 */
const ERASER_RADIUS_PX = 17

/** How long a player keeps scrolling before the position is worth writing down. */
const POSITION_SETTLE_MS = 450
const MAX_ZOOM = 3

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(.5, value))

interface ZoomAnchor {
  page: number
  x: number
  y: number
  clientX: number
  clientY: number
}

export default function PracticeChartPaper({
  chart, fit, halfTurn, initialFraction, handleRef, onView, onZoom, onFraction, onError, onLoadFailed,
  onSpreadAvailable, strokes, marker, inkWidth, onStroke, onErase,
}: PracticeChartPaperProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const pendingZoomRef = useRef<ZoomAnchor | null>(null)
  // Zoom is a temporary inspection of the current reading stop. Turning
  // returns to this stop's normal geometry before advancing, even after panning.
  const zoomOriginRef = useRef<{ layout: ChartStripLayout; offset: number } | null>(null)
  const pendingTurnRef = useRef<{ layout: ChartStripLayout; offset: number } | null>(null)
  const pinchRef = useRef<{ startDistance: number; startZoom: number; startX: number; startY: number; anchor: ZoomAnchor; previewZoom: number; clientX: number; clientY: number } | null>(null)
  const [document_, setDocument] = useState<ChartDocument | null>(null)
  const [pages, setPages] = useState<ChartPageSize[] | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const fractionRef = useRef(initialFraction)
  const restoredRef = useRef(false)
  const previousLayoutRef = useRef<ChartStripLayout | null>(null)
  /** Mirrors scrollTop in state, because the render window is React's to decide. */
  const [offset, setOffset] = useState(0)
  const offsetRef = useRef(0)

  /* ---- Open the file ---------------------------------------------------- */

  const documentKey = `${chart.projectId}:${chart.fileName}:${chart.bytes?.byteLength ?? 0}`

  useEffect(() => {
    let cancelled = false
    restoredRef.current = false
    previousLayoutRef.current = null
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
    () => {
      const preferred = resolveChartFit(fit, pages ?? [], viewport.width, viewport.height)
      // A stationary half turn operates on one reading page. Clipping half of
      // a two-page spread hides the next page before the player reaches it.
      return halfTurn && preferred === 'spread' ? 'page' : preferred
    },
    [fit, halfTurn, pages, viewport.width, viewport.height],
  )
  const layout = useMemo<ChartStripLayout>(
    () => {
      const strip = layoutChartStrip(pages ?? [], viewport.width, viewport.height, resolvedFit, zoom)
      return halfTurn && zoom === 1
        ? { ...strip, maxScroll: chartScreenHalfTurnStops(strip, viewport.height).at(-1) ?? 0 }
        : strip
    },
    [pages, viewport.width, viewport.height, resolvedFit, zoom, halfTurn],
  )
  const baseLayout = useMemo(
    () => {
      const strip = layoutChartStrip(pages ?? [], viewport.width, viewport.height, resolvedFit)
      return halfTurn
        ? { ...strip, maxScroll: chartScreenHalfTurnStops(strip, viewport.height).at(-1) ?? 0 }
        : strip
    },
    [pages, viewport.width, viewport.height, resolvedFit, halfTurn],
  )
  useEffect(() => { onZoom(zoom) }, [onZoom, zoom])

  const spreadFits = useMemo(
    () => chartSpreadFits(pages ?? [], viewport.width, viewport.height),
    [pages, viewport.width, viewport.height],
  )
  useEffect(() => { onSpreadAvailable(spreadFits) }, [onSpreadAvailable, spreadFits])
  const stationaryHalfTurn = halfTurn && zoom === 1
  const widthHalfTurn = stationaryHalfTurn && resolvedFit === 'width'
  const stops = useMemo(() => stationaryHalfTurn
    ? chartScreenHalfTurnStops(layout, viewport.height)
    : chartTurnStops(layout, halfTurn), [layout, halfTurn, stationaryHalfTurn, viewport.height])
  const persistPosition = useCallback(() => {
    const origin = zoomOriginRef.current
    onFraction(origin ? chartScrollFraction(origin.layout, origin.offset) : fractionRef.current)
  }, [onFraction])

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
    const turn = pendingTurnRef.current
    if (turn) {
      pendingTurnRef.current = null
      const restored = chartOffsetAfterReflow(turn.layout, layout, turn.offset)
      const target = stationaryHalfTurn ? nearestChartStop(stops, restored) : restored
      element.scrollLeft = 0
      element.scrollTop = stationaryHalfTurn ? 0 : target
      offsetRef.current = target
      setOffset(target)
      fractionRef.current = chartScrollFraction(layout, target)
      previousLayoutRef.current = layout
      reportView(target)
      persistPosition()
      return
    }
    const anchor = pendingZoomRef.current
    if (anchor) {
      pendingZoomRef.current = null
      const box = element.getBoundingClientRect()
      const left = layout.lefts[anchor.page] + layout.widths[anchor.page] * anchor.x - (anchor.clientX - box.left)
      const top = layout.tops[anchor.page] + layout.heights[anchor.page] * anchor.y - (anchor.clientY - box.top)
      element.scrollLeft = Math.max(0, left)
      element.scrollTop = stationaryHalfTurn ? 0 : Math.max(0, top)
      stripRef.current?.style.removeProperty('transform')
      stripRef.current?.style.removeProperty('transform-origin')
      const next = stationaryHalfTurn ? nearestChartStop(stops, Math.max(0, top)) : element.scrollTop
      offsetRef.current = next
      setOffset(next)
      fractionRef.current = chartScrollFraction(layout, next)
      previousLayoutRef.current = layout
      reportView(next)
      persistPosition()
      return
    }
    const previous = previousLayoutRef.current
    const wanted = previous && previous.columns !== layout.columns
      ? chartOffsetAfterReflow(previous, layout, offsetRef.current)
      : chartOffsetForFraction(layout, fractionRef.current)
    const target = restoredRef.current && !stationaryHalfTurn ? wanted : nearestChartStop(stops, wanted)
    restoredRef.current = true
    previousLayoutRef.current = layout
    fractionRef.current = chartScrollFraction(layout, target)
    if (zoom === 1) element.scrollLeft = 0
    element.scrollTop = stationaryHalfTurn ? 0 : target
    offsetRef.current = target
    setOffset(target)
    reportView(target)
    // Stops are derived from layout and mode. Reflow restores once, without
    // subscribing the effect to every saved reading-position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, persistPosition, reportView, stationaryHalfTurn])

  /*
   * A mark in progress. It is kept as page-normalised points from the first
   * move, so the line that appears under the finger is the same line that gets
   * stored — there is no separate screen-space path to reconcile afterwards.
   */
  const [drawing, setDrawing] = useState<{ page: number; points: number[] } | null>(null)
  const drawingRef = useRef<{ pointerId: number; page: number; points: number[] } | null>(null)

  const beginStroke = useCallback((page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isInkColour(marker) || event.button !== 0 || drawingRef.current) return
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
    if (!isInkColour(marker)) return
    const points = active.points.length >= 4
      ? simplifyStroke(active.points)
      : [...active.points, active.points[0] + 0.0015, active.points[1] + 0.0015]
    onStroke({ page: active.page, colour: marker, points, width: inkWidth })
  }, [inkWidth, marker, onStroke])

  const cancelStroke = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawingRef.current?.pointerId !== event.pointerId) return
    drawingRef.current = null
    setDrawing(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  /*
   * The eraser is a drag, not a tap: it rubs continuously while the finger is
   * down, the same as a real one. Erasing on every pointer move means the
   * caller has to work from the marks it just removed rather than from the
   * last render, which is why it hands back the whole list each time.
   */
  const erasingRef = useRef<number | null>(null)

  const eraseAtEvent = useCallback((page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    onErase(
      page,
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
      ERASER_RADIUS_PX / box.width,
      ERASER_RADIUS_PX / box.height,
    )
  }, [onErase])

  const beginErase = useCallback((page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || erasingRef.current !== null) return
    erasingRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    // A first touch may become a two-finger pinch. Wait for movement before
    // erasing so zooming with the eraser selected cannot delete a mark.
    if (event.pointerType !== 'touch') eraseAtEvent(page, event)
  }, [eraseAtEvent])

  const extendErase = useCallback((page: number, event: ReactPointerEvent<HTMLDivElement>) => {
    if (erasingRef.current !== event.pointerId) return
    event.preventDefault()
    eraseAtEvent(page, event)
  }, [eraseAtEvent])

  const endErase = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (erasingRef.current !== event.pointerId) return
    erasingRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const anchorAt = useCallback((x: number, y: number): ZoomAnchor | null => {
    const strip = stripRef.current
    if (!strip) return null
    const visibleRect = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect()
      const pane = node.closest<HTMLElement>('.practice-chart-half-band') ?? scrollRef.current
      const bounds = pane?.getBoundingClientRect() ?? rect
      const insets = node.style.clipPath.startsWith('inset(')
        ? node.style.clipPath.slice(6, -1).split(/\s+/).map(parseFloat) : []
      const clipTop = insets[0] || 0
      const clipBottom = insets.length >= 3 ? insets[2] : clipTop
      return {
        left: Math.max(rect.left, bounds.left), right: Math.min(rect.right, bounds.right),
        top: Math.max(rect.top + clipTop, bounds.top), bottom: Math.min(rect.bottom - clipBottom, bounds.bottom),
      }
    }
    const nodes = [...strip.querySelectorAll<HTMLElement>('.practice-chart-page')]
      .filter(node => {
        if (node.style.visibility === 'hidden') return false
        const rect = visibleRect(node)
        return rect.bottom > rect.top && rect.right > rect.left
      })
    if (!nodes.length) return null
    const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.practice-chart-page')
    const page = (hit && nodes.includes(hit) ? hit : null) ?? nodes.find(node => {
      const rect = visibleRect(node)
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
    }) ?? nodes.reduce((nearest, node) => {
      const distance = (candidate: HTMLElement) => {
        const rect = visibleRect(candidate)
        return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom))
      }
      return distance(node) < distance(nearest) ? node : nearest
    })
    const rect = page.getBoundingClientRect()
    return {
      page: Number(page.dataset.page),
      x: Math.min(1, Math.max(0, (x - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (y - rect.top) / rect.height)),
      clientX: x, clientY: y,
    }
  }, [])

  const clearZoomPreview = useCallback(() => {
    pinchRef.current = null
    pendingZoomRef.current = null
    stripRef.current?.style.removeProperty('transform')
    stripRef.current?.style.removeProperty('transform-origin')
  }, [])

  const changeZoom = useCallback((value: number, anchor: ZoomAnchor | null) => {
    const next = Math.round(clampZoom(value) * 100) / 100
    if (next === zoom || !anchor) return
    if (next === 1 && zoomOriginRef.current) {
      pendingTurnRef.current = zoomOriginRef.current
      zoomOriginRef.current = null
      clearZoomPreview()
      setZoom(1)
      return
    }
    if (zoom === 1) zoomOriginRef.current = { layout: baseLayout, offset: offsetRef.current }
    pendingZoomRef.current = anchor
    setZoom(next)
  }, [baseLayout, clearZoomPreview, zoom])

  const resetZoom = useCallback(() => {
    clearZoomPreview()
    if (zoom === 1) return
    pendingTurnRef.current = zoomOriginRef.current ?? { layout, offset: offsetRef.current }
    zoomOriginRef.current = null
    setZoom(1)
  }, [clearZoomPreview, layout, zoom])

  const zoomBy = useCallback((direction: 1 | -1) => {
    const element = scrollRef.current
    if (!element) return
    const box = element.getBoundingClientRect()
    changeZoom(zoom + direction * .25, anchorAt(box.left + box.width / 2, box.top + box.height / 2))
  }, [anchorAt, changeZoom, zoom])

  /* Preview the pinch with a CSS transform, then re-render the PDF once at
   * the final scale. This keeps a large part responsive under two fingers. */
  useEffect(() => {
    const element = scrollRef.current
    const strip = stripRef.current
    if (!element || !strip) return
    const midpoint = (touches: TouchList) => {
      const first = touches[0]
      const second = touches[1]
      return {
        x: (first.clientX + second.clientX) / 2,
        y: (first.clientY + second.clientY) / 2,
        distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
      }
    }
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !layout.tops.length) return
      const mid = midpoint(event.touches)
      const anchor = anchorAt(mid.x, mid.y)
      if (!anchor || mid.distance < 8) return
      drawingRef.current = null
      setDrawing(null)
      erasingRef.current = null
      pinchRef.current = {
        startDistance: mid.distance, startZoom: zoom, startX: mid.x, startY: mid.y,
        anchor, previewZoom: zoom, clientX: mid.x, clientY: mid.y,
      }
      const box = element.getBoundingClientRect()
      strip.style.transformOrigin = `${mid.x - box.left + element.scrollLeft}px ${mid.y - box.top + element.scrollTop}px`
      if (event.cancelable) event.preventDefault()
    }
    const move = (event: TouchEvent) => {
      const pinch = pinchRef.current
      if (!pinch || event.touches.length !== 2) return
      if (event.cancelable) event.preventDefault()
      const mid = midpoint(event.touches)
      pinch.previewZoom = clampZoom(pinch.startZoom * mid.distance / pinch.startDistance)
      pinch.clientX = mid.x
      pinch.clientY = mid.y
      const ratio = pinch.previewZoom / pinch.startZoom
      strip.style.transform = `translate(${mid.x - pinch.startX}px, ${mid.y - pinch.startY}px) scale(${ratio})`
    }
    const finish = (event: TouchEvent) => {
      const pinch = pinchRef.current
      if (!pinch || event.touches.length >= 2) return
      pinchRef.current = null
      const nextZoom = Math.round(pinch.previewZoom * 100) / 100
      const anchor = { ...pinch.anchor, clientX: pinch.clientX, clientY: pinch.clientY }
      if (nextZoom !== zoom) {
        changeZoom(nextZoom, anchor)
      } else {
        strip.style.removeProperty('transform')
        strip.style.removeProperty('transform-origin')
        const box = element.getBoundingClientRect()
        if (!stationaryHalfTurn) {
          element.scrollLeft = Math.max(0, layout.lefts[anchor.page] + layout.widths[anchor.page] * anchor.x - (anchor.clientX - box.left))
          element.scrollTop = Math.max(0, layout.tops[anchor.page] + layout.heights[anchor.page] * anchor.y - (anchor.clientY - box.top))
        }
      }
    }
    element.addEventListener('touchstart', start, { passive: false })
    element.addEventListener('touchmove', move, { passive: false })
    element.addEventListener('touchend', finish)
    element.addEventListener('touchcancel', clearZoomPreview)
    return () => {
      element.removeEventListener('touchstart', start)
      element.removeEventListener('touchmove', move)
      element.removeEventListener('touchend', finish)
      element.removeEventListener('touchcancel', clearZoomPreview)
      // Rotation or a fit change can replace the geometry mid-gesture.
      if (pinchRef.current) clearZoomPreview()
    }
  }, [anchorAt, changeZoom, clearZoomPreview, layout, stationaryHalfTurn, zoom])

  const settleRef = useRef<number | null>(null)
  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element || stationaryHalfTurn) return
    const next = element.scrollTop
    offsetRef.current = next
    setOffset(next)
    fractionRef.current = chartScrollFraction(layout, next)
    reportView(next)
    if (settleRef.current !== null) window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      settleRef.current = null
      persistPosition()
    }, POSITION_SETTLE_MS)
  }, [layout, persistPosition, reportView, stationaryHalfTurn])

  // Hiding the page unmounts the paper, and the settle timer would take the
  // last few seconds of reading with it. Write the position out on the way out.
  const flushRef = useRef(persistPosition)
  flushRef.current = persistPosition
  useEffect(() => () => {
    if (settleRef.current === null) return
    window.clearTimeout(settleRef.current)
    settleRef.current = null
    flushRef.current()
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
    clearZoomPreview()
    if (settleRef.current !== null) {
      window.clearTimeout(settleRef.current)
      settleRef.current = null
    }
    if (zoom !== 1) {
      const origin = zoomOriginRef.current ?? { layout, offset: offsetRef.current }
      const originOffset = chartOffsetAfterReflow(origin.layout, baseLayout, origin.offset)
      const baseStops = halfTurn ? chartScreenHalfTurnStops(baseLayout, viewport.height) : chartTurnStops(baseLayout, false)
      const current = halfTurn ? nearestChartStop(baseStops, originOffset) : originOffset
      const target = nextChartStop(baseStops, current, direction) ?? current
      pendingTurnRef.current = { layout: baseLayout, offset: target }
      zoomOriginRef.current = null
      setZoom(1)
      return
    }
    const target = nextChartStop(stops, stationaryHalfTurn ? offsetRef.current : element.scrollTop, direction)
    if (target === null) return
    element.scrollTop = stationaryHalfTurn ? 0 : target
    offsetRef.current = target
    setOffset(target)
    fractionRef.current = chartScrollFraction(layout, target)
    reportView(target)
    onFraction(fractionRef.current)
  }, [baseLayout, clearZoomPreview, halfTurn, layout, onFraction, reportView, stops, stationaryHalfTurn, viewport.height, zoom])

  useEffect(() => {
    handleRef.current = { turn, resetZoom, zoomBy }
    return () => { handleRef.current = null }
  }, [handleRef, resetZoom, turn, zoomBy])

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
  const renderPageFace = (index: number, drawFace = true) => (
    <>
      {drawFace && index >= window_.first - layout.columns && index <= window_.last + layout.columns && (
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
        liveColour={isInkColour(marker) ? marker : null}
        liveWidth={inkWidth}
      />
    </>
  )

  const renderPage = (index: number, top: number, visible = true, clipPath?: string) => (
    <div
      key={index}
      data-page={index}
      className={`practice-chart-page${marker ? ' practice-chart-page--marking' : ''}${
        marker === 'eraser' ? ' practice-chart-page--erasing' : ''}`}
      style={{
        top, left: layout.lefts[index],
        visibility: visible ? undefined : 'hidden',
        clipPath,
        height: layout.heights[index], width: layout.widths[index],
      }}
      onPointerDown={marker === 'eraser'
        ? event => beginErase(index, event)
        : marker ? event => beginStroke(index, event) : undefined}
      onPointerMove={marker === 'eraser'
        ? event => extendErase(index, event)
        : marker ? extendStroke : undefined}
      onPointerUp={marker === 'eraser' ? endErase : marker ? endStroke : undefined}
      onPointerCancel={marker === 'eraser' ? endErase : marker ? cancelStroke : undefined}
    >
      {renderPageFace(index, !widthHalfTurn || visible)}
    </div>
  )

  return (
    <div
      ref={scrollRef}
      className={`practice-chart-scroll${stationaryHalfTurn ? ' practice-chart-scroll--half-turn' : ''}${zoom !== 1 ? ' practice-chart-scroll--zoomed' : ''}`}
      onScroll={handleScroll}
      role="document"
      aria-label={`${chart.fileName}${ready ? `, ${layout.tops.length} page${layout.tops.length === 1 ? '' : 's'}` : ''}`}
    >
      {/* Stable page nodes retain their canvases through every half turn. */}
      <div ref={stripRef} className="practice-chart-strip" style={{ width: ready ? layout.contentWidth : '100%', height: stationaryHalfTurn ? '100%' : ready ? layout.total : '100%' }}>
        {widthHalfTurn ? chartScreenHalfTurnBands(layout, offset, viewport.height).map((band, slot) => (
          <div key={slot} className="practice-chart-half-band" data-half-band={slot}
            style={{ position: 'absolute', overflow: 'hidden', left: 0, right: 0, top: band.top, height: band.height }}>
            {layout.tops.map((top, index) => renderPage(index, top - band.sourceTop,
              top < band.sourceTop + band.height && top + layout.heights[index] > band.sourceTop))}
          </div>
        )) : layout.tops.map((top, index) => {
          const presentation = stationaryHalfTurn ? chartHalfTurnPresentation(layout, offset, index) : null
          return renderPage(index, presentation?.top ?? top, !presentation || presentation.visible,
            presentation ? `inset(${presentation.clipTop}px 0 ${presentation.clipBottom}px 0)` : undefined)
        })}
        {/* The join between two slots, so a half turn reads as two pages and
            not as one long one. */}
        {!stationaryHalfTurn && halfTurn && layout.rows.slice(1).map((row, index) => (
          <div
            key={`join-${index}`}
            className="practice-chart-join"
            style={{ top: row.top }}
            aria-hidden
          />
        ))}
        {stationaryHalfTurn && ready && (widthHalfTurn || chartHalfTurnPresentation(layout, offset, 0).split) && (
          <div className="practice-chart-join practice-chart-join--half" style={{ top: '50%' }} aria-hidden />
        )}
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
    // Keep the last frame visible while a sharper zoomed frame renders.
    const nextCanvas = document.createElement('canvas')
    chartDocument.renderPage(index, nextCanvas, cssWidth, controller.signal)
      .then(() => {
        if (controller.signal.aborted) return
        canvas.width = nextCanvas.width
        canvas.height = nextCanvas.height
        canvas.getContext('2d', { alpha: false })?.drawImage(nextCanvas, 0, 0)
        setDrawn(true)
      })
      .catch((error: unknown) => {
        if (isChartRenderCancelled(error) || controller.signal.aborted) return
        onError('A page of this PDF could not be drawn.')
      })
    return () => {
      controller.abort()
    }
  }, [chartDocument, cssWidth, index, onError])
  return <canvas ref={canvasRef} data-drawn={drawn} aria-hidden={!drawn} />
}
