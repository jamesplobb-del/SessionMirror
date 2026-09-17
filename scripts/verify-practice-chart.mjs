import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/components/practiceChart/chartLayout.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const {
  layoutChartStrip, chartTurnStops, nextChartStop, chartPagesInView,
  chartScrollFraction, chartOffsetForFraction, nearestChartStop,
  nextChartHalfTurn, chartHalfTurnFromFraction, chartFractionFromHalfTurn,
  chartHalfTurnView, chartRowCount,
} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const LETTER = { width: 612, height: 792 }
const part = count => Array.from({ length: count }, () => LETTER)
const near = (a, b, tolerance = 0.5) => Math.abs(a - b) <= tolerance

/* A whole page means a whole page. On a landscape iPad the page is height
 * limited, so one page has to fill the screen exactly — anything else leaves a
 * sliver of the next page under the last system. */
{
  const layout = layoutChartStrip(part(4), 1366, 1024, 'page')
  assert.ok(near(layout.heights[0], 1024), 'A fitted page fills the height of a landscape iPad')
  assert.ok(layout.widths[0] <= 1366, 'A fitted page never overflows the width')
  const stops = chartTurnStops(layout, false)
  assert.ok(near(nextChartStop(stops, 0, 1), layout.tops[1]), 'A full turn lands on the next page')
  const view = chartPagesInView(layout, layout.tops[1], 1024)
  assert.deepEqual(view, { first: 1, last: 1 }, 'After a full turn exactly one page is on the stand')
}

/* The half turn: the bottom of the page being played stays on screen while the
 * top of the next one comes up underneath it. Both pages must be readable. */
{
  const layout = layoutChartStrip(part(4), 1366, 1024, 'page')
  const stops = chartTurnStops(layout, true)
  const half = nextChartStop(stops, 0, 1)
  assert.ok(near(half, layout.heights[0] / 2), 'A half turn moves exactly half a page')
  assert.deepEqual(chartPagesInView(layout, half, 1024), { first: 0, last: 1 },
    'A half turn leaves two pages on the stand at once')
  assert.ok(near(nextChartStop(stops, half, 1), layout.tops[1]),
    'The turn after a half turn completes the page')
  assert.ok(near(nextChartStop(stops, half, -1), 0), 'Turning back undoes a half turn')
}

/* No tap may be dead. Turning forward from the top has to walk every stop and
 * arrive at the end of the part, and the last turn has to actually move. */
for (const halfTurn of [false, true]) {
  for (const [width, height] of [[1024, 1366], [1366, 1024], [390, 844], [844, 390]]) {
    const layout = layoutChartStrip(part(5), width, height, 'page')
    const stops = chartTurnStops(layout, halfTurn)
    let offset = 0
    let turns = 0
    for (;;) {
      const next = nextChartStop(stops, offset, 1)
      if (next === null) break
      assert.ok(next > offset, 'Every turn moves forward')
      assert.ok(next <= layout.maxScroll + 0.001, 'No turn scrolls past the end of the part')
      offset = next
      assert.ok((turns += 1) <= 40, 'Turning forward terminates')
    }
    assert.ok(near(offset, layout.maxScroll), 'Turning forward reaches the end of the part')
    while (offset > 0) {
      const back = nextChartStop(stops, offset, -1)
      assert.ok(back !== null && back < offset, 'Every turn back moves back')
      offset = back
    }
    assert.equal(offset, 0, 'Turning back reaches the first page')
  }
}

/* Fill width on a landscape iPad zooms past the screen, which is the point:
 * the part is readable and the turn now moves within a page. */
{
  const layout = layoutChartStrip(part(2), 1366, 1024, 'width')
  assert.ok(near(layout.widths[0], 1366), 'Fill width uses the whole screen')
  assert.ok(layout.heights[0] > 1024, 'A filled page is taller than the screen')
  assert.ok(layout.maxScroll > 0, 'A filled page scrolls')
}

/* One scale for the whole file: a part that mixes a landscape page in with
 * portrait ones must not jump width mid-turn or overflow the screen. */
{
  const mixed = [LETTER, { width: 792, height: 612 }, LETTER]
  const layout = layoutChartStrip(mixed, 1024, 1366, 'page')
  assert.equal(layout.widths[0] / mixed[0].width, layout.widths[1] / mixed[1].width,
    'Every page is drawn at the same scale')
  for (const width of layout.widths) assert.ok(width <= 1024 + 0.001, 'No page overflows the screen')
}

/* Reading position survives a rotation, which changes every pixel offset. */
{
  const portrait = layoutChartStrip(part(6), 1024, 1366, 'page')
  const landscape = layoutChartStrip(part(6), 1366, 1024, 'page')
  const atPage4 = portrait.tops[3]
  const fraction = chartScrollFraction(portrait, atPage4)
  assert.ok(near(chartOffsetForFraction(landscape, fraction), landscape.tops[3], 1),
    'The same page comes back after a rotation')
}

/* A restored position lands on a real stop, so the first tap is a real turn. */
{
  const layout = layoutChartStrip(part(4), 1024, 1366, 'page')
  const stops = chartTurnStops(layout, false)
  const drifted = layout.tops[2] + 9
  assert.ok(near(nearestChartStop(stops, drifted), layout.tops[2]),
    'Coming back to a part snaps onto the page, not nine pixels into it')
}

/* A photo of the part is one page, and must not break the turn maths. */
{
  const layout = layoutChartStrip([{ width: 3024, height: 4032 }], 1024, 1366, 'page')
  assert.equal(layout.tops.length, 1)
  assert.deepEqual(chartPagesInView(layout, 0, 1366), { first: 0, last: 0 })
  assert.equal(nextChartStop(chartTurnStops(layout, false), 0, 1), null,
    'A single page has nowhere to turn to')
}

/* Nothing loaded yet, and a zero-sized room during the first layout pass. */
for (const args of [[[], 1024, 1366], [part(3), 0, 0], [[{ width: 0, height: 0 }], 1024, 1366]]) {
  const layout = layoutChartStrip(args[0], args[1], args[2], 'page')
  assert.equal(layout.total, 0)
  assert.deepEqual(chartPagesInView(layout, 0, args[2]), { first: 0, last: 0 })
  assert.equal(chartScrollFraction(layout, 120), 0)
}

console.log('Practice chart: page fit, whole and half turns, rotation and single-page parts passed.')

/* A fitted page on a portrait screen leaves room under it, and the strip of the
 * next page showing through is not a page anyone is reading. The page number
 * has to say what is on the stand, not what is on the screen. */
{
  const layout = layoutChartStrip(part(6), 834, 1194, 'page')
  assert.ok(layout.heights[0] < 1194, 'A portrait page is width limited, so it does not fill the height')
  assert.deepEqual(chartPagesInView(layout, 0, 1194), { first: 0, last: 0 },
    'A sliver of the next page is not a second page')
  const half = nextChartStop(chartTurnStops(layout, true), 0, 1)
  assert.deepEqual(chartPagesInView(layout, half, 1194), { first: 0, last: 1 },
    'A real half turn still reads as two pages')
}

console.log('Practice chart: portrait page numbering passed.')

/* Two pages side by side. An iPad in landscape has room for a spread, and
 * showing one page with half the screen left white is not what the stand is
 * for. The turn maths has to keep working row by row. */
{
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  const { chartSpreadFits, resolveChartFit } = mod
  const landscape = [1194, 834]
  const portrait = [834, 1194]
  const phone = [390, 844]

  assert.equal(chartSpreadFits(part(6), ...landscape), true, 'A landscape iPad fits two pages')
  assert.equal(chartSpreadFits(part(6), ...portrait), false, 'A portrait iPad does not')
  assert.equal(chartSpreadFits(part(6), ...phone), false, 'A phone never does')
  assert.equal(chartSpreadFits(part(1), ...landscape), false, 'One page is not a spread')

  assert.equal(resolveChartFit('auto', part(6), ...landscape), 'spread', 'Landscape opens on a spread')
  assert.equal(resolveChartFit('auto', part(6), ...portrait), 'page', 'Portrait opens on one page')
  assert.equal(resolveChartFit('page', part(6), ...landscape), 'page', 'A chosen fit is never overridden')

  const layout = layoutChartStrip(part(6), ...landscape, 'spread')
  assert.equal(layout.columns, 2)
  assert.equal(layout.tops[0], layout.tops[1], 'Two pages in a spread share a row')
  assert.ok(layout.lefts[1] > layout.lefts[0] + layout.widths[0] - 1, 'The second page sits to the right of the first')
  assert.ok(layout.lefts[0] >= 0 && layout.lefts[1] + layout.widths[1] <= 1194 + 0.001, 'A spread stays on screen')
  assert.equal(layout.tops.length, 6)
  assert.ok(Math.abs(layout.total - 3 * layout.heights[0]) < 0.001, 'Six pages make three rows')
  assert.deepEqual(chartPagesInView(layout, 0, 834), { first: 0, last: 1 }, 'A spread reads as two pages')

  const stops = chartTurnStops(layout, false)
  assert.ok(near(nextChartStop(stops, 0, 1), layout.tops[2]), 'A turn in a spread moves on by two pages')
  assert.deepEqual(chartPagesInView(layout, layout.tops[2], 834), { first: 2, last: 3 })

  const half = nextChartStop(chartTurnStops(layout, true), 0, 1)
  assert.ok(near(half, layout.heights[0] / 2), 'A half turn is still half of what is on the stand')
  assert.deepEqual(chartPagesInView(layout, half, 834), { first: 0, last: 3 },
    'Half of a spread shows the bottom of two pages and the top of the next two')

  /* An odd last page sits alone rather than stretching across the spread. */
  const odd = layoutChartStrip(part(5), ...landscape, 'spread')
  assert.equal(odd.tops.length, 5)
  assert.ok(odd.tops[4] > odd.tops[3], 'The fifth page starts a row of its own')
  assert.ok(odd.lefts[4] > odd.lefts[0], 'A lone last page is centred, not left-aligned')

  /* A title page of a different size keeps its own proportions in the row. */
  const mixed = [{ width: 612, height: 900 }, LETTER, LETTER, LETTER]
  const m = layoutChartStrip(mixed, ...landscape, 'spread')
  assert.equal(m.heights[0], m.heights[1], 'A row is as tall as its tallest page')
  assert.ok(m.drawHeights[1] < m.heights[1], 'The shorter page is not stretched to fill the row')
  assert.ok(Math.abs(m.drawHeights[0] / m.widths[0] - 900 / 612) < 0.001, 'Every page keeps its aspect')
}

console.log('Practice chart: two-page spreads, odd last pages and mixed page sizes passed.')

/* forScore half turn: bottom of the current page stays, top of the next comes
 * in above it. One tap peeks, the next tap completes the page. */
{
  assert.equal(chartRowCount(6, 1), 6)
  assert.equal(chartRowCount(6, 2), 3)
  const start = { row: 0, peek: false }
  const peek = nextChartHalfTurn(start, 4, 1)
  assert.deepEqual(peek, { row: 0, peek: true }, 'The first half turn keeps the current page on the bottom')
  assert.deepEqual(chartHalfTurnView(peek, 1, 4), { first: 0, last: 1 })
  assert.deepEqual(nextChartHalfTurn(peek, 4, 1), { row: 1, peek: false }, 'The next tap finishes the turn')
  assert.deepEqual(nextChartHalfTurn(peek, 4, -1), start, 'Turning back undoes the peek')
  assert.equal(nextChartHalfTurn({ row: 3, peek: false }, 4, 1), null, 'The last page has nowhere to peek')

  const restored = chartHalfTurnFromFraction(chartFractionFromHalfTurn(peek, 4), 4)
  assert.deepEqual(restored, peek, 'A peek survives being stored as a fraction')
}

console.log('Practice chart: forScore half turns passed.')
