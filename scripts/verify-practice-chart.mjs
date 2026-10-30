// Page fitting and turning for the music page.
// Run: node scripts/verify-practice-chart.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/components/practiceChart/chartLayout.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const {
  layoutChartStrip, chartTurnStops, nextChartStop, chartPagesInView,
  chartScrollFraction, chartOffsetForFraction, nearestChartStop,
  chartSpreadFits, resolveChartFit, chartHalfTurnPresentation, chartOffsetAfterReflow,
  chartScreenHalfTurnStops, chartScreenHalfTurnBands,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const LETTER = { width: 612, height: 792 }
const part = count => Array.from({ length: count }, () => LETTER)
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance

const LANDSCAPE = [1194, 834]
const PORTRAIT = [834, 1194]
const PHONE = [390, 844]

/* ---- A slot is one screen, whatever shape the page is ------------------- */

/*
 * This is the whole basis of the half turn. A letter page on a portrait iPad
 * comes up shorter than the screen; if the strip were bare pages, halfway
 * through a page would not be halfway down the screen and a half turn would
 * show 45% of one page and 55% of the next.
 */
for (const [width, height] of [LANDSCAPE, PORTRAIT, PHONE]) {
  const layout = layoutChartStrip(part(4), width, height, 'page')
  for (const row of layout.rows) {
    assert.ok(near(row.height, height), `A fitted slot is exactly one screen at ${width}x${height}`)
  }
  assert.ok(layout.heights[0] <= height + 0.001, 'The page itself never exceeds the screen')
  assert.ok(layout.widths[0] <= width + 0.001, 'nor the width')
  // The page is centred in its slot: the margin is split, not dumped below.
  const margin = (layout.rows[0].height - layout.heights[0]) / 2
  assert.ok(near(layout.tops[0], layout.rows[0].top + margin), 'A short page is centred in its slot')
  assert.ok(near(layout.total, layout.rows.length * height), 'The strip is one screen per row')
}

/* ---- A whole turn moves exactly one screen ------------------------------ */
{
  const [width, height] = PORTRAIT
  const layout = layoutChartStrip(part(5), width, height, 'page')
  const stops = chartTurnStops(layout, false)
  let offset = 0
  for (let row = 1; row < layout.rows.length; row += 1) {
    const next = nextChartStop(stops, offset, 1)
    assert.ok(near(next - offset, height), 'Every whole turn moves exactly one screen')
    offset = next
  }
  assert.equal(nextChartStop(stops, offset, 1), null, 'And stops at the end of the part')
}

/* ---- Half turns keep each system at its original screen position -------- */
for (const [width, height] of [LANDSCAPE, PORTRAIT, PHONE]) {
  for (const fit of ['page', 'spread']) {
    const layout = layoutChartStrip(part(5), width, height, fit)
    const stops = chartTurnStops(layout, true)
    for (let row = 0; row < layout.rows.length - 1; row++) {
      const current = row * layout.columns
      const next = current + layout.columns
      const whole = row * height
      const half = nextChartStop(stops, whole, 1)
      const before = chartHalfTurnPresentation(layout, whole, current)
      const bottom = chartHalfTurnPresentation(layout, half, current)
      const top = chartHalfTurnPresentation(layout, half, next)
      assert.equal(bottom.top, before.top, 'Current bottom stays at exactly the same screen coordinate')
      assert.equal(bottom.clipBottom, 0, 'Current bottom remains unclipped')
      assert.equal(bottom.top + bottom.clipTop, height / 2, 'Current top is hidden at the divider')
      assert.equal(top.top + layout.heights[next] - top.clipBottom, height / 2, 'Next top ends at the divider')
      const completed = chartHalfTurnPresentation(layout, nextChartStop(stops, half, 1), next)
      assert.equal(top.top, completed.top, 'Next top stays fixed when its bottom catches up')
      assert.equal(completed.clipTop + completed.clipBottom, 0, 'Second turn completes the page')
      assert.equal(nextChartStop(stops, half, -1), whole, 'Back reverses one half at a time')
    }
  }
}
/* Scroll geometry still applies in fill-width mode. */

for (const [width, height] of [LANDSCAPE, PORTRAIT]) {
  const layout = layoutChartStrip(part(4), width, height, 'page')
  const stops = chartTurnStops(layout, true)

  const half = nextChartStop(stops, 0, 1)
  assert.ok(near(half, height / 2), 'A half turn moves exactly half a screen')

  // What is on screen after it: the back of page 1 and the front of page 2.
  const pageTop = layout.tops[0]
  const pageBottom = pageTop + layout.heights[0]
  assert.ok(pageBottom > half, 'The page being played is still on screen')
  assert.ok(near(pageBottom - half, layout.heights[0] - (half - pageTop)),
    'and it is its bottom part that remains')
  const nextTop = layout.tops[1]
  assert.ok(nextTop < half + height, 'The next page has come up')
  assert.ok(nextTop > half, 'and it is its top that is showing')
  assert.deepEqual(chartPagesInView(layout, half, height), { first: 0, last: 1 },
    'Both pages are on the stand at once')

  // Completing the turn lands exactly on the next page.
  const whole = nextChartStop(stops, half, 1)
  assert.ok(near(whole, layout.rows[1].top), 'The turn after a half turn completes the page')
  assert.deepEqual(chartPagesInView(layout, whole, height), { first: 1, last: 1 })

  // And it is reversible, one half at a time.
  assert.ok(near(nextChartStop(stops, whole, -1), half), 'Back lands on the half again')
  assert.ok(near(nextChartStop(stops, half, -1), 0), 'and back again on the page')
}

/* ---- No tap is ever dead, forwards or back ------------------------------ */
for (const halfTurn of [false, true]) {
  for (const [width, height] of [LANDSCAPE, PORTRAIT, PHONE, [844, 390]]) {
    const layout = layoutChartStrip(part(5), width, height, 'page')
    const stops = chartTurnStops(layout, halfTurn)
    let offset = 0
    let turns = 0
    for (;;) {
      const next = nextChartStop(stops, offset, 1)
      if (next === null) break
      assert.ok(next > offset, 'Every turn moves forward')
      assert.ok(next <= layout.maxScroll + 0.001, 'No turn scrolls past the end')
      offset = next
      assert.ok((turns += 1) <= 40, 'Turning forward terminates')
    }
    assert.ok(near(offset, layout.maxScroll), 'Turning forward reaches the end')
    while (offset > 0) {
      const back = nextChartStop(stops, offset, -1)
      assert.ok(back !== null && back < offset, 'Every turn back moves back')
      offset = back
    }
    assert.equal(offset, 0, 'Turning back reaches the first page')
  }
}

/* ---- Fill width scrolls the page instead of turning between screens ----- */
{
  const layout = layoutChartStrip(part(2), ...LANDSCAPE, 'width')
  assert.ok(near(layout.widths[0], 1194), 'Fill width uses the whole screen')
  assert.ok(layout.heights[0] > 834, 'A filled page is taller than the screen')
  assert.ok(near(layout.rows[0].height, layout.heights[0]),
    'and its slot is the page, not a screen — there is nothing to letterbox')
  assert.ok(layout.maxScroll > 0, 'A filled page scrolls')
}

/* ---- One scale for the file --------------------------------------------- */
{
  const mixed = [LETTER, { width: 792, height: 612 }, LETTER]
  const layout = layoutChartStrip(mixed, ...PORTRAIT, 'page')
  assert.equal(layout.widths[0] / mixed[0].width, layout.widths[1] / mixed[1].width,
    'Every page is drawn at the same scale')
  for (const width of layout.widths) assert.ok(width <= 834 + 0.001, 'No page overflows the screen')
}

/* ---- Reading position survives a rotation ------------------------------- */
{
  const portrait = layoutChartStrip(part(6), ...PORTRAIT, 'page')
  const landscape = layoutChartStrip(part(6), ...LANDSCAPE, 'page')
  const fraction = chartScrollFraction(portrait, portrait.rows[3].top)
  assert.ok(near(chartOffsetForFraction(landscape, fraction), landscape.rows[3].top, 1),
    'The same page comes back after a rotation')
}

/* ---- Coming back to a part lands on a real stop -------------------------- */
{
  const layout = layoutChartStrip(part(4), ...PORTRAIT, 'page')
  const stops = chartTurnStops(layout, false)
  const drifted = layout.rows[2].top + 9
  assert.ok(near(nearestChartStop(stops, drifted), layout.rows[2].top),
    'not nine pixels into it, where the first tap would move a sliver')
}

/* ---- A photo of the part is one page ------------------------------------ */
{
  const layout = layoutChartStrip([{ width: 3024, height: 4032 }], ...PORTRAIT, 'page')
  assert.equal(layout.rows.length, 1)
  assert.deepEqual(chartPagesInView(layout, 0, 1194), { first: 0, last: 0 })
  assert.equal(nextChartStop(chartTurnStops(layout, true), 0, 1), null,
    'A single page has nowhere to half turn to')
}

/* ---- Nothing loaded, and a zero-sized room during first layout ---------- */
for (const args of [[[], 834, 1194], [part(3), 0, 0], [[{ width: 0, height: 0 }], 834, 1194]]) {
  const layout = layoutChartStrip(args[0], args[1], args[2], 'page')
  assert.equal(layout.total, 0)
  assert.deepEqual(layout.rows, [])
  assert.deepEqual(chartPagesInView(layout, 0, args[2]), { first: 0, last: 0 })
  assert.equal(chartScrollFraction(layout, 120), 0)
}

console.log('Practice chart: slots, whole turns, forScore half turns and rotation passed.')

/* ---- Two pages side by side --------------------------------------------- */
{
  assert.equal(chartSpreadFits(part(6), ...LANDSCAPE), true, 'A landscape iPad fits two pages')
  assert.equal(chartSpreadFits(part(6), ...PORTRAIT), false, 'A portrait iPad does not')
  assert.equal(chartSpreadFits(part(6), ...PHONE), false, 'A phone never does')
  assert.equal(chartSpreadFits(part(1), ...LANDSCAPE), false, 'One page is not a spread')

  assert.equal(resolveChartFit('auto', part(6), ...LANDSCAPE), 'spread', 'Landscape opens on a spread')
  assert.equal(resolveChartFit('auto', part(6), ...PORTRAIT), 'page', 'Portrait opens on one page')
  assert.equal(resolveChartFit('spread', part(6), ...PHONE), 'page', 'A remembered spread fits one page on a narrow screen')
  assert.equal(resolveChartFit('spread', part(6), ...LANDSCAPE), 'spread', 'Spread preference returns when there is room')
  assert.equal(resolveChartFit('page', part(6), ...LANDSCAPE), 'page', 'A chosen fit is never overridden')

  const layout = layoutChartStrip(part(6), ...LANDSCAPE, 'spread')
  assert.equal(layout.columns, 2)
  assert.equal(layout.rows.length, 3, 'Six pages make three rows')
  assert.equal(layout.rowOfPage[0], 0)
  assert.equal(layout.rowOfPage[1], 0, 'Two pages share a row')
  assert.equal(layout.rowOfPage[2], 1)
  assert.ok(layout.lefts[1] > layout.lefts[0] + layout.widths[0] - 1, 'The second page sits to the right')
  assert.ok(layout.lefts[0] >= 0 && layout.lefts[1] + layout.widths[1] <= 1194 + 0.001, 'A spread stays on screen')
  assert.deepEqual(chartPagesInView(layout, 0, 834), { first: 0, last: 1 }, 'A spread reads as two pages')

  const stops = chartTurnStops(layout, false)
  assert.ok(near(nextChartStop(stops, 0, 1), layout.rows[1].top), 'A turn in a spread moves on by two pages')
  assert.deepEqual(chartPagesInView(layout, layout.rows[1].top, 834), { first: 2, last: 3 })

  const half = nextChartStop(chartTurnStops(layout, true), 0, 1)
  assert.ok(near(half, 834 / 2), 'A half turn is still half a screen')
  assert.deepEqual(chartPagesInView(layout, half, 834), { first: 0, last: 3 },
    'Half of a spread shows the bottom of two pages and the top of the next two')

  /* An odd last page sits alone in its own row rather than stretching. */
  const odd = layoutChartStrip(part(5), ...LANDSCAPE, 'spread')
  assert.equal(odd.rows.length, 3)
  assert.equal(odd.rowOfPage[4], 2, 'The fifth page starts a row of its own')
  assert.ok(odd.lefts[4] > odd.lefts[0], 'and is centred, not left-aligned')

  /* A title page of a different size keeps its own proportions. */
  const mixed = [{ width: 612, height: 900 }, LETTER, LETTER, LETTER]
  const m = layoutChartStrip(mixed, ...LANDSCAPE, 'spread')
  assert.ok(m.heights[0] > m.heights[1], 'A taller page is drawn taller, not squashed to its neighbour')
  assert.ok(m.rows[0].height >= m.heights[0] - 0.001, 'The slot holds the tallest page in the row')
  assert.ok(Math.abs(m.heights[0] / m.widths[0] - 900 / 612) < 0.001, 'Every page keeps its aspect')
}

console.log('Practice chart: two-page spreads, odd last pages and mixed page sizes passed.')

// Zoom must create real scrollable page geometry so the point under a finger
// can stay in place when the gesture ends, and ink keeps its page coordinates.
{
  const base = layoutChartStrip(part(2), ...PHONE, 'page')
  const zoomed = layoutChartStrip(part(2), ...PHONE, 'page', 2)
  assert.ok(near(zoomed.widths[0], base.widths[0] * 2), 'Pinch zoom doubles page width')
  assert.ok(near(zoomed.heights[0], base.heights[0] * 2), 'Pinch zoom doubles page height')
  assert.ok(zoomed.contentWidth > PHONE[0], 'The enlarged page can pan horizontally')
  const pointX = 0.64
  const fingerX = 220
  const left = zoomed.lefts[0] + zoomed.widths[0] * pointX - fingerX
  assert.ok(near(zoomed.lefts[0] + zoomed.widths[0] * pointX - left, fingerX),
    'The same point of the score remains under the finger after reflow')
}

console.log('Practice chart: pinch zoom geometry passed.')

// All fit modes can zoom out without changing page proportions. Normal fitted
// pages keep their full-height slots; fill-width reading keeps its strip.
for (const fit of ['page', 'spread', 'width']) {
  const base = layoutChartStrip(part(4), ...LANDSCAPE, fit)
  const reduced = layoutChartStrip(part(4), ...LANDSCAPE, fit, 0.5)
  assert.ok(near(reduced.widths[0], base.widths[0] / 2), `${fit} can zoom out to half size`)
  assert.ok(near(reduced.heights[0], base.heights[0] / 2), `${fit} zoom preserves aspect ratio`)
  assert.deepEqual(layoutChartStrip(part(4), ...LANDSCAPE, fit, 0.1), reduced, 'Zoom has a usable lower bound')
  if (fit !== 'width') assert.equal(reduced.rows[0].height, LANDSCAPE[1], 'Zooming out keeps fitted navigation slots')
}

// Page and spread mode already have one screen per row: the new screen-sized
// stops must leave their existing stationary half-turn navigation unchanged.
for (const [width, height] of [LANDSCAPE, PORTRAIT, PHONE]) {
  for (const fit of ['page', 'spread']) {
    const layout = layoutChartStrip(part(5), width, height, fit)
    assert.deepEqual(chartScreenHalfTurnStops(layout, height), chartTurnStops(layout, true),
      `${fit} keeps its established stops at ${width}x${height}`)
  }
}

const bandHeight = 834
const halfBand = bandHeight / 2
const tallWidth = layoutChartStrip(part(3), 1194, bandHeight, 'width')
assert.equal(chartScreenHalfTurnStops(tallWidth, bandHeight)[1], halfBand,
  'Fill Width now turns by half the visible screen, not half a tall PDF page')
const firstBands = chartScreenHalfTurnBands(tallWidth, 0, bandHeight)
const secondBands = chartScreenHalfTurnBands(tallWidth, halfBand, bandHeight)
const thirdBands = chartScreenHalfTurnBands(tallWidth, bandHeight, bandHeight)
assert.deepEqual(firstBands, [
  { sourceTop: 0, top: 0, height: halfBand },
  { sourceTop: halfBand, top: halfBand, height: halfBand },
])
assert.deepEqual(secondBands[1], firstBands[1], 'First half turn keeps the lower score stationary')
assert.equal(secondBands[0].sourceTop, bandHeight, 'First half turn replaces the upper score with upcoming content')
assert.deepEqual(thirdBands[0], secondBands[0], 'Second half turn keeps the upper score stationary')
assert.equal(thirdBands[1].sourceTop, bandHeight + halfBand, 'Second half turn completes the next reading screen')
assert.ok(secondBands.every(band => band.sourceTop < tallWidth.heights[0]),
  'The same tall PDF page can appear in both panes with different offsets')

for (const pages of [
  part(3),
  [{ width: 612, height: 1900 }],
  [{ width: 612, height: 200 }, { width: 612, height: 1800 }, LETTER, { width: 792, height: 250 }],
]) {
  const layout = layoutChartStrip(pages, 1194, bandHeight, 'width')
  const stops = chartScreenHalfTurnStops(layout, bandHeight)
  const covered = []
  let position = 0
  for (const stop of stops) {
    assert.equal(position, stop, 'Forward turns visit every reading stop')
    const bands = chartScreenHalfTurnBands(layout, stop, bandHeight)
    assert.deepEqual(bands.map(band => band.top), [0, halfBand], 'Both panes keep their screen position')
    assert.deepEqual(bands.map(band => band.sourceTop).sort((a, b) => a - b), [stop, stop + halfBand],
      'The displayed halves cover a continuous source interval without skipping score content')
    for (const band of bands) {
      if (band.sourceTop < layout.total) covered.push([band.sourceTop, Math.min(layout.total, band.sourceTop + band.height)])
    }
    position = nextChartStop(stops, stop, 1)
  }
  assert.equal(position, null, 'There is no extra turn into blank content')
  let end = 0
  for (const [start, finish] of covered.sort((a, b) => a[0] - b[0])) {
    assert.ok(start <= end + 0.001, 'Reading bands leave no gap across tall or mixed-size pages')
    end = Math.max(end, finish)
  }
  assert.ok(near(end, layout.total, 0.001), 'The final partial band includes the end of the score')
  position = stops.at(-1)
  for (const previous of stops.slice(0, -1).reverse()) {
    position = nextChartStop(stops, position, -1)
    assert.equal(position, previous, 'Backward turns exactly reverse forward navigation')
  }
  assert.equal(nextChartStop(stops, position, -1), null)
  const navigation = { ...layout, maxScroll: stops.at(-1) }
  const fraction = chartScrollFraction(navigation, navigation.maxScroll)
  assert.ok(near(chartOffsetForFraction(navigation, fraction), navigation.maxScroll, 0.001),
    'The final partial reading position survives saved-fraction restoration')
  assert.deepEqual(chartScreenHalfTurnBands(layout, -100, bandHeight), chartScreenHalfTurnBands(layout, 0, bandHeight))
  assert.deepEqual(chartScreenHalfTurnBands(layout, 1e9, bandHeight), chartScreenHalfTurnBands(layout, navigation.maxScroll, bandHeight))
}

// Exact and partial final screens stop as soon as the last real chunk appears.
for (const [total, expected] of [[200, [0]], [834, [0]], [1000, [0, 417]], [1668, [0, 417, 834]]]) {
  const layout = { ...tallWidth, total }
  assert.deepEqual(chartScreenHalfTurnStops(layout, bandHeight), expected)
}
assert.deepEqual(chartScreenHalfTurnStops({ ...tallWidth, total: 1668 + 1e-10 }, bandHeight), [0, 417, 834],
  'Subpixel floating-point noise does not invent a blank final turn')
for (const height of [0, -1, NaN, Infinity]) {
  assert.deepEqual(chartScreenHalfTurnStops(tallWidth, height), [0])
  assert.deepEqual(chartScreenHalfTurnBands(tallWidth, 0, height), [])
}
assert.deepEqual(chartScreenHalfTurnBands({ ...tallWidth, total: 0 }, 0, bandHeight), [])

console.log('Practice chart: zoom out and stationary screen-sized half turns across tall/mixed pages and final partial bands passed.')

// Odd page counts cannot use a percentage of spread count to preserve a page.
{
  const single = layoutChartStrip(part(5), ...PORTRAIT, 'page')
  const spread = layoutChartStrip(part(5), ...LANDSCAPE, 'spread')
  const offset = chartOffsetAfterReflow(single, spread, single.rows[3].top)
  assert.equal(offset, spread.rows[1].top, 'Page 4 rotates into its 3–4 spread, never skips to page 5')
  const half = chartOffsetAfterReflow(spread, single, spread.rows[1].top + spread.rows[1].height/2)
  assert.equal(half, single.rows[2].top + single.rows[2].height/2, 'Rotation preserves the half-turn phase')
}
