/**
 * Geometry for the music page.
 *
 * The page strip is one continuous column — page 2 starts exactly where page 1
 * ends, with no gap. That single decision is what makes a half turn possible:
 * scrolling half a page down leaves the bottom half of the page you are still
 * reading on top of the screen and brings the top half of the next one up
 * underneath it, which is the turn forScore players already know. A gap between
 * pages, or letterboxing each page into its own screen, would put a band of
 * background through the middle of that view.
 *
 * Everything here is pure so the turn maths can be tested without a PDF.
 */

export interface ChartPageSize {
  /** Intrinsic size, in whatever unit the source uses (PDF points or pixels). */
  width: number
  height: number
}

/**
 * `page` shows a whole page at once, `spread` shows two side by side, `width`
 * fills the screen edge to edge and scrolls. `auto` has not been chosen yet:
 * an iPad on a stand in landscape has room for two pages, and showing one page
 * with half the screen left white is not what anyone put it there for.
 */
export type ChartFit = 'page' | 'spread' | 'width'
export type ChartFitPreference = ChartFit | 'auto'

/** The gap down the middle of a spread, in px. */
const SPREAD_GUTTER = 10

/**
 * True when two whole pages genuinely fit side by side. Below this the spread
 * is not offered at all — two half-legible pages are worse than one readable
 * one, and an option that makes things worse is not an option.
 */
export function chartSpreadFits(
  pages: readonly ChartPageSize[],
  viewWidth: number,
  viewHeight: number,
): boolean {
  if (pages.length < 2 || viewWidth <= 0 || viewHeight <= 0) return false
  const widest = Math.max(...pages.map(page => page.width))
  const tallest = Math.max(...pages.map(page => page.height))
  if (!(widest > 0) || !(tallest > 0)) return false
  const scale = Math.min((viewWidth - SPREAD_GUTTER) / (widest * 2), viewHeight / tallest)
  // Worth doing only when each page still gets most of the height it would have
  // had on its own; otherwise the spread is just two small pages.
  return (tallest * scale) / Math.min(viewHeight, (tallest * viewWidth) / widest) > 0.8
}

export function resolveChartFit(
  preference: ChartFitPreference,
  pages: readonly ChartPageSize[],
  viewWidth: number,
  viewHeight: number,
): ChartFit {
  if (preference !== 'auto') return preference
  return chartSpreadFits(pages, viewWidth, viewHeight) ? 'spread' : 'page'
}

export interface ChartStripLayout {
  scale: number
  widths: number[]
  heights: number[]
  /** Scroll offset at which each page's top edge reaches the top of the view. */
  tops: number[]
  /** Distance from the left edge of the strip. Two pages in a spread differ. */
  lefts: number[]
  /**
   * The page's own drawn height. In a spread a row is as tall as its tallest
   * page, and a title page of a different size must sit in that row at its own
   * proportions rather than be stretched to fill it.
   */
  drawHeights: number[]
  /** 1, or 2 when pages are laid out as spreads. */
  columns: number
  total: number
  maxScroll: number
}

const EMPTY: ChartStripLayout = {
  scale: 1, widths: [], heights: [], tops: [], lefts: [], drawHeights: [],
  columns: 1, total: 0, maxScroll: 0,
}

/**
 * One scale for every page, taken from the largest page in the file. Scaling
 * each page to its own size would make a file that mixes portrait and landscape
 * pages jump width mid-turn, and would let an oversized page overflow the view.
 */
export function layoutChartStrip(
  pages: readonly ChartPageSize[],
  viewWidth: number,
  viewHeight: number,
  fit: ChartFit,
): ChartStripLayout {
  if (pages.length === 0 || viewWidth <= 0 || viewHeight <= 0) return EMPTY
  const widest = Math.max(...pages.map(page => page.width))
  const tallest = Math.max(...pages.map(page => page.height))
  if (!(widest > 0) || !(tallest > 0)) return EMPTY
  const columns = fit === 'spread' && pages.length > 1 ? 2 : 1
  const scale = fit === 'width'
    ? viewWidth / widest
    : Math.min((viewWidth - (columns - 1) * SPREAD_GUTTER) / (widest * columns), viewHeight / tallest)
  const widths: number[] = []
  const heights: number[] = []
  const tops: number[] = []
  const lefts: number[] = []
  const drawHeights: number[] = []
  let offset = 0
  /*
   * Pages go into rows of `columns`. Two pages in the same row share a top and
   * a height, which is what lets a turn move by a whole spread and a half turn
   * still mean "half of what is on the stand" — the stops, the page numbering
   * and the render window all keep working off the same per-page arrays.
   */
  for (let index = 0; index < pages.length; index += columns) {
    const row = pages.slice(index, index + columns)
    const rowHeight = Math.max(...row.map(page => page.height)) * scale
    const rowWidth = row.reduce((total, page) => total + page.width * scale, 0)
      + (row.length - 1) * SPREAD_GUTTER
    let x = (viewWidth - rowWidth) / 2
    for (const page of row) {
      widths.push(page.width * scale)
      heights.push(rowHeight)
      drawHeights.push(page.height * scale)
      tops.push(offset)
      lefts.push(Math.max(0, x))
      x += page.width * scale + SPREAD_GUTTER
    }
    offset += rowHeight
  }
  return {
    scale, widths, heights, tops, lefts, drawHeights, columns,
    total: offset, maxScroll: Math.max(0, offset - viewHeight),
  }
}

/**
 * Where a turn is allowed to land: every page top, plus every page middle when
 * half turns are on. Stops past the end of the strip collapse onto the last
 * scrollable offset, so the final turn still moves and never leaves a dead tap.
 */
export function chartTurnStops(layout: ChartStripLayout, halfTurn: boolean): number[] {
  const stops = new Set<number>([0])
  for (let index = 0; index < layout.tops.length; index += 1) {
    stops.add(Math.min(layout.tops[index], layout.maxScroll))
    if (halfTurn) {
      stops.add(Math.min(layout.tops[index] + layout.heights[index] / 2, layout.maxScroll))
    }
  }
  stops.add(layout.maxScroll)
  return [...stops].sort((a, b) => a - b)
}

/** Tolerance in px: a turn must not be swallowed by a rounded scroll position. */
const STOP_EPSILON = 2

export function nextChartStop(stops: readonly number[], offset: number, direction: 1 | -1): number | null {
  if (direction === 1) {
    for (const stop of stops) if (stop > offset + STOP_EPSILON) return stop
    return null
  }
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index] < offset - STOP_EPSILON) return stops[index]
  }
  return null
}

/**
 * How much of a page has to be on screen before the player is reading it. On a
 * portrait screen a fitted page leaves room underneath, and the inch of the next
 * page showing through there is not a page anyone is playing from — counting it
 * would put the wrong page number on the widget for almost every part.
 */
const VISIBLE_SHARE = 0.25

/**
 * Which pages the player can actually see. A half turn genuinely shows two
 * pages at once, so this reports a range and the widget reads "3–4" rather than
 * claiming one of them.
 */
export function chartPagesInView(
  layout: ChartStripLayout,
  offset: number,
  viewHeight: number,
): { first: number; last: number } {
  if (layout.tops.length === 0) return { first: 0, last: 0 }
  const top = Math.max(0, offset)
  const bottom = top + Math.max(1, viewHeight)
  let first = layout.tops.length - 1
  let last = 0
  for (let index = 0; index < layout.tops.length; index += 1) {
    const pageTop = layout.tops[index]
    const pageBottom = pageTop + layout.heights[index]
    // A sliver of the next page peeking in does not count as reading it.
    const overlap = Math.min(pageBottom, bottom) - Math.max(pageTop, top)
    if (overlap > Math.min(layout.heights[index], viewHeight) * VISIBLE_SHARE) {
      first = Math.min(first, index)
      last = Math.max(last, index)
    }
  }
  if (first > last) return { first: 0, last: 0 }
  return { first, last }
}

/**
 * Reading position survives a hide, a rotation and a relaunch as a fraction of
 * the strip rather than a pixel offset, because the pixel offset means nothing
 * once the page is laid out at a different scale.
 */
export function chartScrollFraction(layout: ChartStripLayout, offset: number): number {
  if (layout.total <= 0) return 0
  return Math.min(1, Math.max(0, offset / layout.total))
}

export function chartOffsetForFraction(layout: ChartStripLayout, fraction: number): number {
  if (layout.total <= 0) return 0
  return Math.min(layout.maxScroll, Math.max(0, fraction * layout.total))
}

/** Snap a restored or free-scrolled position onto the nearest legal stop. */
export function nearestChartStop(stops: readonly number[], offset: number): number {
  let best = stops[0] ?? 0
  for (const stop of stops) {
    if (Math.abs(stop - offset) < Math.abs(best - offset)) best = stop
  }
  return best
}
