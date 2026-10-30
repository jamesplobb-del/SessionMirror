// Exercise the production reader callbacks with isolated React/DOM ports.
// Geometry comes from the real layout module; no PDF or live browser is needed.
// Run: node scripts/verify-practice-chart-zoom.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import ts from 'typescript'

const source = await readFile('src/components/practiceChart/PracticeChartPaper.tsx', 'utf8')
const ast = ts.createSourceFile('paper.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = [
  'MAX_ZOOM', 'POSITION_SETTLE_MS', 'clampZoom', 'resolvedFit', 'layout', 'baseLayout',
  'stationaryHalfTurn', 'widthHalfTurn', 'stops', 'persistPosition', 'reportView', 'anchorAt',
  'clearZoomPreview', 'changeZoom', 'resetZoom', 'zoomBy', 'handleScroll', 'turn',
]
const declarations = new Map()
let readingEffect, pinchEffect, positionFlushEffect
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.getText(ast))
  }
  if (ts.isCallExpression(node)) {
    const name = node.expression.getText(ast), body = node.arguments[0]?.getText(ast) ?? ''
    if (name === 'useLayoutEffect' && body.includes('pendingTurnRef.current')) readingEffect = body
    if (name === 'useEffect' && body.includes("addEventListener('touchstart'")) pinchEffect = body
    if (name === 'useEffect' && body.includes('flushRef.current()')) positionFlushEffect = body
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(declarations.size, names.length, 'All production zoom/turn callbacks are present')
assert.ok(readingEffect && pinchEffect && positionFlushEffect, 'Production layout, touch, and position-flush effects are present')
const code = ts.transpileModule([
  ...names.map(name => `const ${declarations.get(name)};`),
  `const applyReadingLayout = ${readingEffect};`,
  `const installPinch = ${pinchEffect};`,
  `const installPositionFlush = ${positionFlushEffect};`,
  `return { ${names.slice(3).join(', ')}, applyReadingLayout, installPinch, installPositionFlush };`,
].join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const compiled = await build({ entryPoints: ['src/components/practiceChart/chartLayout.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const geometry = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .01, `${message}: ${actual} versus ${expected}`)
const ref = current => ({ current })

function fixture({ fit = 'page', halfTurn = false, width = 1194, height = 834, count = 6 } = {}) {
  let api, zoom = 1, nextZoom = 1, cleanup, scrollTop = 0, scrollLeft = 0, timer = 0, obscured = false
  const listeners = new Map(), timers = new Map(), fractions = []
  const style = { removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] } }
  const scroll = {
    get scrollTop() { return scrollTop },
    set scrollTop(value) { scrollTop = Math.max(0, Math.min(value, api?.stationaryHalfTurn ? 0 : api?.layout.maxScroll ?? 0)) },
    get scrollLeft() { return scrollLeft },
    set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(value, Math.max(0, (api?.layout.contentWidth ?? width) - width))) },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height, width, height }),
    addEventListener(type, fn) { assert.ok(!listeners.has(type), `Only one ${type} listener`); listeners.set(type, fn) },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  function pageNodes() {
    const { layout, stationaryHalfTurn, widthHalfTurn } = api
    const bands = widthHalfTurn ? geometry.chartScreenHalfTurnBands(layout, scope.offsetRef.current, height) : [null]
    return bands.flatMap(band => layout.tops.map((top, page) => {
      const presentation = stationaryHalfTurn && !band ? geometry.chartHalfTurnPresentation(layout, scope.offsetRef.current, page) : null
      const rectTop = band ? band.top + top - band.sourceTop : presentation?.top ?? top - scrollTop
      const visible = band ? top < band.sourceTop + band.height && top + layout.heights[page] > band.sourceTop : presentation?.visible ?? true
      const rect = { left: layout.lefts[page] - scrollLeft, top: rectTop, width: layout.widths[page], height: layout.heights[page] }
      rect.right = rect.left + rect.width; rect.bottom = rect.top + rect.height
      const pane = band ? { getBoundingClientRect: () => ({ left: 0, right: width, top: band.top, bottom: band.top + band.height, width, height: band.height }) } : null
      return {
        dataset: { page: String(page) }, style: { visibility: visible ? '' : 'hidden', clipPath: presentation ? `inset(${presentation.clipTop}px 0 ${presentation.clipBottom}px 0)` : '' },
        getBoundingClientRect: () => rect,
        closest(selector) { return selector === '.practice-chart-half-band' ? pane : selector === '.practice-chart-page' ? this : null },
        hits(x, y) {
          const clipTop = band?.top ?? rect.top + (presentation?.clipTop ?? 0)
          const clipBottom = band ? band.top + band.height : rect.bottom - (presentation?.clipBottom ?? 0)
          return visible && x >= rect.left && x < rect.right && y >= Math.max(rect.top, clipTop) && y < Math.min(rect.bottom, clipBottom)
        },
      }
    }))
  }
  // Keep node identity stable during one anchor lookup, as a real DOM does.
  let queriedNodes = []
  const strip = { style, querySelectorAll() { queriedNodes = pageNodes(); return queriedNodes } }
  const scope = {
    ...geometry, useMemo: fn => fn(), useCallback: fn => fn,
    pages: Array.from({ length: count }, () => ({ width: 612, height: 792 })),
    fit, halfTurn, viewport: { width, height }, zoom,
    scrollRef: ref(scroll), stripRef: ref(strip), pendingZoomRef: ref(null), zoomOriginRef: ref(null), pendingTurnRef: ref(null),
    pinchRef: ref(null), offsetRef: ref(0), fractionRef: ref(0), previousLayoutRef: ref(null), restoredRef: ref(false),
    drawingRef: ref(null), erasingRef: ref(null), settleRef: ref(null), flushRef: ref(null),
    setZoom: value => { nextZoom = value }, setOffset() {}, setDrawing() {}, onView() {}, onFraction: value => fractions.push(value),
    document: { elementFromPoint: (x, y) => obscured ? { closest: () => null } : [...queriedNodes].reverse().find(node => node.hits(x, y)) ?? null },
    window: { clearTimeout: id => timers.delete(id), setTimeout(fn) { timers.set(++timer, fn); return timer } },
  }
  const render = new Function(...Object.keys(scope), code)
  function commit() {
    cleanup?.()
    scope.zoom = zoom = nextZoom
    api = render(...Object.values(scope))
    scope.flushRef.current = api.persistPosition
    api.applyReadingLayout()
    cleanup = api.installPinch()
  }
  function flush() { if (nextZoom !== zoom) commit() }
  commit()
  const flushOnClose = api.installPositionFlush()
  return {
    get api() { return api }, get zoom() { return zoom }, get offset() { return scope.offsetRef.current },
    scope, scroll, style, fractions, timers,
    zoomBy(direction) { api.zoomBy(direction); flush() },
    reset() { api.resetZoom(); flush() },
    turn(direction) { api.turn(direction); flush() },
    pan(top, left = 100) { scroll.scrollTop = top; scroll.scrollLeft = left; api.handleScroll() },
    obscurePoint(value = true) { obscured = value },
    resize(nextWidth, nextHeight) { width = nextWidth; height = nextHeight; scope.viewport = { width, height }; commit() },
    settle() { for (const [id, fn] of timers) { timers.delete(id); fn() } },
    touch(type, touches) {
      const event = { touches: touches.map(([clientX, clientY]) => ({ clientX, clientY })), cancelable: true, preventDefault() {} }
      listeners.get(type)?.(event); flush()
    },
    close() { cleanup?.(); flushOnClose?.(); assert.equal(listeners.size, 0, 'Touch listeners are removed') },
  }
}

let scenarios = 0
for (const fit of ['page', 'spread', 'width', 'auto']) {
  for (const halfTurn of [false, true]) {
    for (const zoomDirection of [-1, 1]) {
      const f = fixture({ fit, halfTurn })
      f.turn(1); f.turn(1)
      const origin = f.offset, baseStops = f.api.stops, baseWidth = f.api.layout.widths[0]
      f.zoomBy(-1)
      assert.equal(f.zoom, 1, `${fit} cannot zoom out below its normal fit`)
      near(f.offset, origin, 'Attempting to shrink below normal fit preserves the reading position')
      const inspect = () => {
        if (zoomDirection === -1) { f.zoomBy(1); f.zoomBy(1) }
        f.zoomBy(zoomDirection)
      }
      inspect()
      assert.equal(f.zoom, 1.25, `${fit} permits enlarging and reducing an enlarged page`)
      near(f.api.layout.widths[0], baseWidth * f.zoom, `${fit} applies the actual scale`)
      f.pan(f.api.layout.maxScroll * .7)
      f.turn(1)
      assert.equal(f.zoom, 1, `${fit} turn resets zoom`)
      near(f.offset, geometry.nextChartStop(baseStops, origin, 1) ?? origin, `${fit} advances from the original stop after panning`)
      near(f.scroll.scrollLeft, 0, 'Turn clears horizontal panning')
      if (halfTurn) near(f.scroll.scrollTop, 0, 'Half turn keeps the viewport fixed')
      assert.equal(f.timers.size, 0, 'Turn cancels the old position save')
      const forward = f.offset
      inspect(); f.pan(f.api.layout.maxScroll * .8); f.turn(-1)
      near(f.offset, geometry.nextChartStop(baseStops, forward, -1) ?? forward, 'Back reverses one base stop')
      const beforeReset = f.offset
      inspect(); f.pan(f.api.layout.maxScroll * .75); f.reset()
      near(f.offset, beforeReset, 'Reset restores the inspection origin')
      f.close(); scenarios++
    }
  }
}

for (const fit of ['page', 'spread', 'width']) {
  const f = fixture({ fit, halfTurn: true })
  f.turn(1)
  const origin = f.offset
  for (const steps of [1, 2]) {
    for (let i = 0; i < steps; i++) f.zoomBy(1)
    f.pan(f.api.layout.maxScroll * .8)
    for (let i = 0; i < steps; i++) f.zoomBy(-1)
    assert.equal(f.zoom, 1)
    near(f.offset, origin, 'Crossing back to exactly 1× restores the original half stop')
    assert.equal(f.scope.zoomOriginRef.current, null, 'The completed inspection releases its saved origin')
  }
  f.close(); scenarios++
}

{
  const f = fixture()
  const baseWidth = f.api.layout.widths[0]
  for (let i = 0; i < 20; i++) f.zoomBy(-1)
  assert.equal(f.zoom, 1, 'Zoom out stops at 100%')
  near(f.api.layout.widths[0], baseWidth, 'Repeated zoom-out attempts preserve the fitted page size')
  for (let i = 0; i < 30; i++) f.zoomBy(1)
  assert.equal(f.zoom, 3, 'Zoom in stops at 300%')
  f.reset(); f.turn(-1)
  f.zoomBy(1); f.turn(-1)
  assert.equal(f.zoom, 1, 'A backward turn at the first page still resets zoom')
  near(f.offset, 0, 'First-page boundary cannot move backward')
  while (geometry.nextChartStop(f.api.stops, f.offset, 1) !== null) f.turn(1)
  const last = f.offset
  f.zoomBy(1); f.turn(1)
  assert.equal(f.zoom, 1, 'A forward turn at the last page still resets zoom')
  near(f.offset, last, 'Last-page boundary cannot advance')
  f.close(); scenarios++
}

for (const fit of ['page', 'width']) {
  const f = fixture({ fit, halfTurn: true })
  f.turn(1)
  const origin = f.offset
  f.scope.drawingRef.current = { pointerId: 1 }
  f.scope.erasingRef.current = 1
  f.touch('touchstart', [[400, 300], [600, 300]])
  assert.equal(f.scope.drawingRef.current, null, 'A pinch cancels the pending stroke')
  assert.equal(f.scope.erasingRef.current, null, 'A pinch cancels the pending erase')
  f.touch('touchmove', [[400, 340], [600, 340]])
  f.touch('touchend', [])
  assert.equal(f.zoom, 1)
  near(f.offset, origin, 'A same-scale pinch cannot change the half stop')
  near(f.scroll.scrollTop, 0, 'A same-scale pinch cannot scroll the fixed half-turn viewport')
  assert.equal(f.style.transform, undefined, 'Same-scale finish removes the preview')
  f.touch('touchstart', [[400, 300], [600, 300]])
  f.touch('touchmove', [[450, 300], [550, 300]])
  assert.match(f.style.transform, /scale\(1\)/, 'Pinching inward at normal fit cannot preview a smaller page')
  f.touch('touchend', [])
  assert.equal(f.zoom, 1, 'Pinching inward cannot commit a scale below normal fit')
  near(f.offset, origin, 'A bounded inward pinch preserves the original reading stop')
  f.touch('touchstart', [[400, 300], [600, 300]])
  f.touch('touchmove', [[300, 300], [700, 300]])
  assert.match(f.style.transform, /scale\(2\)/, 'Pinching previews without committing a new layout')
  f.touch('touchcancel', [])
  assert.equal(f.zoom, 1, 'Cancellation does not commit the preview zoom')
  assert.equal(f.style.transform, undefined)
  assert.equal(f.scope.pinchRef.current, null)
  f.touch('touchend', [])
  near(f.offset, origin, 'A late end after cancellation cannot change position')
  f.touch('touchstart', [[400, 300], [600, 300]])
  f.touch('touchmove', [[300, 300], [700, 300]])
  f.touch('touchend', [])
  assert.equal(f.zoom, 2, 'A finished pinch commits its scale')
  f.pan(f.api.layout.maxScroll * .8)
  f.touch('touchstart', [[300, 300], [700, 300]])
  f.touch('touchmove', [[400, 300], [600, 300]])
  f.touch('touchend', [])
  assert.equal(f.zoom, 1)
  near(f.offset, origin, 'Pinching back to 1× restores the reading origin')
  f.close(); scenarios++
}

// The menu can cover the point used by +/-; fallback must inspect only each
// clipped pane's visible part, rather than the duplicated full page bounds.
{
  const f = fixture({ fit: 'width', halfTurn: true, width: 1194, height: 834 })
  f.turn(1)
  near(f.offset, 417, 'First odd width stop is half a screen')
  f.obscurePoint()
  const anchor = f.api.anchorAt(597, 417)
  assert.equal(anchor.page, 0, 'Both width-band copies refer to the first source page')
  near(f.api.layout.tops[anchor.page] + anchor.y * f.api.layout.heights[anchor.page], 417,
    'Covered midpoint anchors source 417 in the bottom pane, not source 1251 in the top copy')
  f.zoomBy(1)
  near(f.scroll.scrollTop, 417 * 1.25 - 417, 'Zoom-in control keeps the chosen lower-pane system at the midpoint')
  f.close(); scenarios++
}

{
  const f = fixture({ fit: 'page', halfTurn: true, width: 1194, height: 834 })
  f.turn(1); f.obscurePoint()
  const upper = f.api.anchorAt(597, 200)
  assert.equal(upper.page, 1, 'Covered upper half anchors the next page, not the clipped current page')
  near(upper.y * f.api.layout.heights[1], 200, 'Fitted clipping preserves page-normalized anchor coordinates')
  const boundary = f.api.anchorAt(597, 417)
  assert.equal(boundary.page, 0, 'Half-open clipping gives the exact midpoint to the lower half')
  const margin = f.api.anchorAt(10, 100)
  assert.equal(margin.page, 1, 'Nearest-page fallback uses the visible clipped region when the point is in a margin')
  f.close(); scenarios++
}

{
  const f = fixture({ fit: 'auto', width: 1194, height: 834 })
  f.touch('touchstart', [[400, 300], [600, 300]])
  f.touch('touchmove', [[300, 300], [700, 300]])
  assert.ok(f.scope.pinchRef.current)
  assert.match(f.style.transform, /scale\(2\)/)
  f.resize(834, 1194)
  assert.equal(f.scope.pinchRef.current, null, 'Rotation cancels the active pinch before using the new geometry')
  assert.equal(f.style.transform, undefined, 'Rotation removes the old visual preview')
  assert.equal(f.style.transformOrigin, undefined)
  f.touch('touchend', [])
  assert.equal(f.zoom, 1, 'A late touchend after rotation cannot commit the old pinch')
  f.close(); scenarios++
}

for (const fit of ['page', 'width']) {
  const f = fixture({ fit, halfTurn: true })
  f.turn(1)
  near(f.offset, 417, 'Saved reading position begins at the first half stop')
  const originFraction = geometry.chartScrollFraction(f.api.layout, f.offset)
  f.zoomBy(1)
  near(f.fractions.at(-1), originFraction, 'Zoom commit saves the original reading fraction')
  f.pan(f.api.layout.maxScroll * .7)
  assert.ok(Math.abs(f.scope.fractionRef.current - originFraction) > .1, 'Inspection position is different from the reading origin')
  f.settle()
  near(f.fractions.at(-1), originFraction, 'Settled panning preserves the saved reading origin')
  f.pan(f.api.layout.maxScroll * .8)
  const saves = f.fractions.length
  f.close()
  assert.equal(f.fractions.length, saves + 1, 'Unmount flushes a pending position save')
  near(f.fractions.at(-1), originFraction, 'Unmount preserves the reading origin while the zoomed inspection is open')
  assert.equal(f.timers.size, 0, 'Unmount clears the pending position timer')
  scenarios++
}

for (const action of ['forward', 'back', 'reset', 'zoom-back']) {
  const f = fixture({ fit: 'width', halfTurn: false, width: 1194, height: 834 })
  const nextPage = f.api.layout.rows[1].top
  assert.ok(nextPage > 1545 && nextPage < 1546, 'Width fixture has its next page near 1545px')
  f.pan(1000, 0)
  near(f.offset, 1000, 'Continuous width reading may begin between turn stops')
  f.zoomBy(1)
  f.pan(f.api.layout.maxScroll * .7)
  if (action === 'forward') f.turn(1)
  else if (action === 'back') f.turn(-1)
  else if (action === 'reset') f.reset()
  else f.zoomBy(-1)
  assert.equal(f.zoom, 1, `${action} returns to the fitted width`)
  const expected = action === 'forward' ? nextPage : action === 'back' ? 0 : 1000
  near(f.offset, expected, `${action} preserves the continuous origin when choosing the landing position`)
  near(f.scroll.scrollTop, expected, `${action} scrolls to the expected continuous position`)
  f.close(); scenarios++
}

console.log(`PASS: ${scenarios} production zoom/turn interaction scenarios: all fits, half turns, bounds, reset, continuous-width positions, panning, saved origin, 1× return, obscured/clipped anchors, pinch preview/cancel/rotation, and listener cleanup (isolated DOM ports; no browser).`)
