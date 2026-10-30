// Run: node scripts/verify-music-markup-interaction.mjs
// Exercise the real palette and pointer callbacks with isolated DOM ports.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import ts from 'typescript'

async function sourceFile(path) {
  const source = await readFile(path, 'utf8')
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
const [layer, paper] = await Promise.all([
  sourceFile('src/components/PracticeChartLayer.tsx'),
  sourceFile('src/components/practiceChart/PracticeChartPaper.tsx'),
])
function find(ast, match) {
  let found
  function visit(node) {
    if (match(node)) found = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(found, 'The tested production callback exists')
  return found
}
function compile(text, bindings) {
  const code = ts.transpileModule(text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings))
}
function callback(ast, name, bindings) {
  const declaration = find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
  return compile(`return ${declaration.initializer.arguments[0].getText(ast)};`, bindings)
}
function attributeCallback(ast, name, matchElement, bindings) {
  const element = find(ast, node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && matchElement(node))
  const attribute = element.attributes.properties.find(node => node.name?.getText(ast) === name)
  assert.ok(attribute?.initializer?.expression, `${name} is wired to the rendered element`)
  return compile(`return ${attribute.initializer.expression.getText(ast)};`, bindings)
}
function hasAttribute(element, name, value) {
  return element.attributes.properties.some(node => node.name?.getText() === name && node.initializer?.text === value)
}

function layerFixture(tool = 'red') {
  const state = { marker: tool, menu: 'markup', workspace: false, focused: false, popups: [], penColour: 'red' }
  const frames = []
  const anchor = { isConnected: true, focus(options) { assert.equal(options.preventScroll, true); state.focused = true } }
  const fallback = { focus(options) { assert.equal(options.preventScroll, true); state.focused = true; state.fallbackFocused = true } }
  const bindings = {
    musicMenuAnchor: anchor,
    paperSurface: { current: { querySelector: () => fallback } },
    requestAnimationFrame: fn => frames.push(fn),
    penColour: state.penColour,
    setMarker(value) { state.marker = typeof value === 'function' ? value(state.marker) : value },
    setMusicMenu(value) { state.menu = value },
    setMusicMenuAnchor(value) { assert.equal(value, anchor) },
    setWorkspaceOpen(value) { state.workspace = value },
  }
  const dismissMusicMenu = callback(layer, 'dismissMusicMenu', bindings)
  const tuckMarkupMenu = callback(layer, 'tuckMarkupMenu', bindings)
  const finishMarkingOnEscape = callback(layer, 'finishMarkingOnEscape', {
    dismissMusicMenu,
    document: { querySelectorAll(selector) {
      assert.match(selector, /\[role="menu"\]/, 'Open menus can own Escape')
      assert.match(selector, /\[role="dialog"\]\[aria-modal="true"\]/, 'Modal dialogs can own Escape')
      return state.popups
    } },
    getComputedStyle: node => ({ visibility: node.visibility ?? 'visible' }),
  })
  const escapeEffect = find(layer, node => ts.isCallExpression(node) && node.expression.getText(layer) === 'useEffect'
    && node.arguments[0]?.getText(layer).includes("addEventListener('keydown', finishMarkingOnEscape)"))
  return {
    state, anchor, dismiss: dismissMusicMenu,
    flushFocus() { frames.splice(0).forEach(fn => fn()) },
    tuck: attributeCallback(layer, 'onMarkStart', node => node.tagName.getText(layer) === 'PracticeChartPaper', { tuckMarkupMenu }),
    open(mode) { callback(layer, 'openMusicMenu', { ...bindings, musicMenu: state.menu })(mode, anchor) },
    done: attributeCallback(layer, 'onDone', node => node.tagName.getText(layer) === 'MarkupToolbar', { dismissMusicMenu }),
    key(event, showing = true) {
      let listener
      const install = compile(`return ${escapeEffect.arguments[0].getText(layer)};`, {
        marker: state.marker, musicMenu: state.menu, showing, finishMarkingOnEscape,
        document: {
          addEventListener(type, fn) { assert.equal(type, 'keydown'); listener = fn },
          removeEventListener(type, fn) { assert.equal(type, 'keydown'); assert.equal(fn, listener); listener = undefined },
        },
      })
      const cleanup = install()
      const installed = Boolean(listener)
      listener?.(event)
      cleanup?.()
      assert.equal(listener, undefined, 'The document Escape listener is removed when its scope ends')
      return installed
    },
  }
}

for (const tool of ['black', 'red', 'eraser']) {
  const f = layerFixture(tool)
  f.tuck()
  assert.equal(f.state.menu, null, 'Starting a mark tucks the palette away')
  assert.equal(f.state.marker, tool, 'Auto-hide keeps the active drawing tool')
  assert.equal(f.state.focused, false, 'Auto-hide does not move focus during a captured gesture')
  f.open('markup')
  assert.equal(f.state.menu, 'markup')
  assert.equal(f.state.marker, tool, 'Reopening the palette preserves the selected tool')
  assert.equal(f.key({ key: 'Escape' }), false, 'The open palette owns its own Escape handler')
  f.tuck(); f.done()
  assert.equal(f.state.marker, null, 'The compact Done button exits drawing')
  assert.equal(f.state.menu, null)
  assert.equal(f.state.focused, false, 'Done waits until the compact toolbar has been removed')
  f.flushFocus()
  assert.equal(f.state.focused, true, 'Done restores the palette trigger after rendering')
  f.open('markup')
  assert.equal(f.state.marker, 'red', 'A fresh marking session restores the remembered pen')
  f.tuck()
  assert.equal(f.key({ key: 'Escape' }, false), false, 'A hidden score does not intercept global Escape')
  f.key({ key: 'Escape', defaultPrevented: true, preventDefault() { throw new Error('Already handled Escape') } })
  f.key({ key: 'ArrowRight', preventDefault() { throw new Error('Only Escape should be handled') } })
  assert.equal(f.state.marker, 'red', 'Handled Escape and other keys leave the current drawing session alone')
  let prevented = false
  f.key({ key: 'Escape', defaultPrevented: false, target: {}, currentTarget: {}, preventDefault() { prevented = true } })
  f.flushFocus()
  assert.equal(prevented, true)
  assert.equal(f.state.marker, null, 'Document-level Escape exits drawing even if palette removal left focus on body')
  assert.equal(f.key({ key: 'Escape' }), false, 'Reading mode does not install the marking Escape handler')
  f.open('markup'); f.tuck(); f.open('page')
  assert.equal(f.state.marker, null, 'Page controls explicitly return to reading')
}

for (const popup of ['visible-menu', 'visible-modal', 'display-none', 'visibility-hidden']) {
  const f = layerFixture('red')
  f.tuck()
  f.state.popups = [{
    getClientRects: () => popup === 'display-none' ? [] : [{}],
    visibility: popup === 'visibility-hidden' ? 'hidden' : 'visible',
  }]
  let prevented = false
  f.key({ key: 'Escape', defaultPrevented: false, preventDefault() { prevented = true } })
  f.flushFocus()
  const visible = popup.startsWith('visible-')
  assert.equal(prevented, !visible, `${popup}: only an actually visible popup owns Escape`)
  assert.equal(f.state.marker, visible ? 'red' : null, `${popup}: visible popups preserve the drawing session behind them`)
  assert.equal(f.state.focused, !visible, `${popup}: Escape cannot move focus behind a visible popup`)
  if (visible) {
    f.state.popups = []
    f.key({ key: 'Escape', defaultPrevented: false, preventDefault() { prevented = true } })
    f.flushFocus()
    assert.equal(f.state.marker, null, 'Escape resumes marking dismissal after the popup closes')
    assert.equal(f.state.focused, true)
  }
}

{
  const f = layerFixture()
  f.anchor.isConnected = false
  f.tuck(); f.done(); f.flushFocus()
  assert.equal(f.state.fallbackFocused, true, 'Done finds the replacement trigger after the compact toolbar unmounts')
}

const built = await build({ entryPoints: ['src/components/practiceChart/chartInk.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const ink = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const declarations = [
  'ERASER_RADIUS_PX', 'MAX_ZOOM', 'clampZoom', 'cancelDrawingPreview', 'queueDrawingPreview', 'prepareMarking',
  'beginStroke', 'appendStrokePoints', 'extendStroke', 'endStroke', 'cancelStroke', 'finishErase',
  'eraseAtEvent', 'beginErase', 'extendErase', 'endErase', 'cancelErase', 'cancelActiveMarking', 'clearZoomPreview',
]
const paperCode = declarations.map(name => {
  const declaration = find(paper, node => ts.isVariableDeclaration(node) && node.name.getText(paper) === name)
  return `const ${declaration.getText(paper)};`
}).join('\n')
const pinchEffect = find(paper, node => ts.isCallExpression(node) && node.expression.getText(paper) === 'useEffect'
  && node.arguments[0]?.getText(paper).includes("addEventListener('touchstart'"))
const markingCleanupEffect = find(paper, node => ts.isCallExpression(node) && node.expression.getText(paper) === 'useEffect'
  && node.arguments[0]?.getText(paper).includes('finishErase(true)'))
const executable = `${paperCode}\nconst installPinch = ${pinchEffect.arguments[0].getText(paper)};\nconst installMarkingCleanup = ${markingCleanupEffect.arguments[0].getText(paper)};\nreturn { ${declarations.slice(3).join(', ')}, installPinch, installMarkingCleanup };`

function drawingFixture(tool = 'red', selectionWhere = 'inside') {
  const palette = layerFixture(tool), events = [], strokes = [], erases = [], eraseTransactions = [], captures = new Set(), listeners = new Map(), frames = new Map()
  const inside = { score: true }, outside = { score: false }
  let cleared = 0, live = null, frameId = 0, previews = 0
  const selection = selectionWhere === 'none' ? null : {
    anchorNode: selectionWhere === 'inside' ? inside : outside,
    focusNode: selectionWhere === 'outside' ? outside : inside,
    removeAllRanges() { cleared++; events.push('clear-selection') },
  }
  const target = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 600, height: 800 }),
    setPointerCapture(id) { captures.add(id); events.push('capture') },
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture(id) { captures.delete(id); events.push('release') },
  }
  const scroll = {
    contains: node => node?.score === true, scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type) },
  }
  const style = { removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] } }
  const scope = {
    ...ink, useCallback: fn => fn, marker: tool, inkWidth: 'fine',
    drawingRef: { current: null }, erasingRef: { current: null }, pinchRef: { current: null }, pendingZoomRef: { current: null },
    drawingPreviewFrameRef: { current: null }, eraseEndRef: { current: cancelled => eraseTransactions.push(cancelled) },
    scrollRef: { current: scroll }, stripRef: { current: { style } },
    document: { getSelection: () => selection },
    onMarkStart() {
      assert.ok(captures.size, 'The pointer is captured before the palette disappears')
      events.push('hide-menu'); palette.tuck()
    },
    window: { requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId }, cancelAnimationFrame: id => frames.delete(id) },
    setDrawing(value) { live = value; previews++ }, onStroke: value => strokes.push(value), onErase: (...args) => erases.push(args),
    onEraseStart: () => eraseTransactions.push('start'),
    layout: { tops: [0], lefts: [0], widths: [600], heights: [800] }, zoom: 1, stationaryHalfTurn: false,
    anchorAt: (x, y) => ({ page: 0, x: .5, y: .5, clientX: x, clientY: y }),
    changeZoom() { throw new Error('A cancelled pinch must not commit zoom') },
  }
  let api = compile(executable, scope)
  const event = (patch = {}) => ({
    isPrimary: true, button: 0, pointerId: 7, pointerType: 'touch', clientX: 70, clientY: 180, currentTarget: target,
    preventDefault() { events.push('prevent') }, ...patch,
  })
  return {
    get api() { return api }, scope, palette, events, strokes, erases, eraseTransactions, captures, event, style,
    get cleared() { return cleared }, get live() { return live }, get previews() { return previews },
    get pendingFrames() { return frames.size },
    render(patch) { Object.assign(scope, patch); api = compile(executable, scope) },
    frame() { for (const [id, fn] of frames) { frames.delete(id); fn() } },
    touch(type, touches) { listeners.get(type)?.({ touches: touches.map(([clientX, clientY]) => ({ clientX, clientY })), cancelable: true, preventDefault() {} }) },
    listenerCount: () => listeners.size,
  }
}

for (const selectionWhere of ['inside', 'crossing', 'outside', 'none']) {
  const f = drawingFixture('red', selectionWhere)
  f.api.beginStroke(2, f.event())
  assert.equal(f.palette.state.menu, null, 'A valid stroke hides the palette immediately')
  assert.equal(f.palette.state.marker, 'red')
  assert.equal(f.cleared, ['inside', 'crossing'].includes(selectionWhere) ? 1 : 0, 'Only a selection intersecting this score is cleared')
  assert.deepEqual(f.events.slice(0, 2), ['capture', 'prevent'], 'Native selection and scrolling are suppressed before auto-hide')
  f.api.extendStroke(f.event({ clientX: 130, clientY: 260 }))
  f.api.endStroke(f.event({ clientX: 130, clientY: 260 }))
  assert.equal(f.captures.size, 0)
  assert.equal(f.live, null)
  assert.deepEqual(f.strokes, [{ page: 2, colour: 'red', width: 'fine', points: [.1, .2, .2, .3] }], 'The captured stroke completes after the palette closes')
}

for (const method of ['beginStroke', 'beginErase']) {
  for (const patch of [{ isPrimary: false }, { button: 2 }]) {
    const f = drawingFixture(method === 'beginErase' ? 'eraser' : 'black')
    f.api[method](0, f.event(patch))
    assert.equal(f.palette.state.menu, 'markup', 'Secondary contacts and non-left clicks do not start marking')
    assert.equal(f.events.length, 0)
    assert.equal(f.scope.drawingRef.current, null)
    assert.equal(f.scope.erasingRef.current, null)
  }
}

{
  const f = drawingFixture()
  f.api.beginStroke(0, f.event())
  f.api.cancelStroke(f.event())
  f.api.endStroke(f.event())
  assert.equal(f.strokes.length, 0, 'Cancelled pointer capture never commits a dot or line')
  assert.equal(f.captures.size, 0)
  assert.equal(f.live, null)
}

for (const pointerType of ['touch', 'pen', 'mouse']) {
  const f = drawingFixture('eraser', 'outside')
  f.api.beginErase(1, f.event({ pointerType }))
  assert.equal(f.palette.state.menu, null, 'The eraser also hides the palette')
  assert.equal(f.palette.state.marker, 'eraser')
  assert.equal(f.cleared, 0, 'Erasing leaves a selection elsewhere in the app alone')
  assert.equal(f.erases.length, pointerType === 'touch' ? 0 : 1, 'A touch waits for movement in case it becomes a pinch')
  f.api.extendErase(1, f.event({ pointerType, clientX: 130 }))
  assert.equal(f.erases.at(-1)[0], 1)
  assert.equal(f.erases.at(-1)[1], .2)
  f.api.endErase(f.event({ pointerType }))
  assert.equal(f.captures.size, 0)
  assert.equal(f.scope.erasingRef.current, null)
  assert.deepEqual(f.eraseTransactions, ['start', false], 'All eraser movement belongs to one completed transaction')
}

// Fast Pencil samples are preserved independently of the rate React paints.
{
  const f = drawingFixture('red')
  f.api.beginStroke(2, f.event({ pointerType: 'pen' }))
  const previews = f.previews
  f.api.extendStroke(f.event({ pointerType: 'pen', clientX: 190, clientY: 420, nativeEvent: {
    getCoalescedEvents: () => [
      { pointerId: 7, clientX: 130, clientY: 260 },
      { pointerId: 9, clientX: 1000, clientY: 1000 },
      { pointerId: 7, clientX: NaN, clientY: 200 },
      { pointerId: 7, clientX: 160, clientY: 380 },
      { pointerId: 7, clientX: 190, clientY: 420 },
    ],
  } }))
  assert.deepEqual(f.scope.drawingRef.current.points, [.1, .2, .2, .3, .25, .45, .3, .5], 'Coalesced samples stay in order; duplicate, foreign, and invalid samples are excluded')
  f.api.extendStroke(f.event({ pointerType: 'pen', clientX: 220, clientY: 420 }))
  assert.equal(f.pendingFrames, 1, 'Many pointer events schedule one live preview per animation frame')
  assert.equal(f.previews, previews)
  assert.deepEqual(f.live.points, [.1, .2], 'The already rendered preview is not mutated by later samples')
  f.frame()
  assert.equal(f.previews, previews + 1)
  assert.deepEqual(f.live.points, f.scope.drawingRef.current.points, 'The frame paints the latest complete stroke')
  assert.equal(f.live.colour, 'red')
  assert.equal(f.live.width, 'fine')
  f.render({ marker: 'eraser', inkWidth: 'bold' })
  const isPage = node => node.attributes.properties.some(attribute => attribute.name?.getText(paper) === 'data-page')
  const routeMove = attributeCallback(paper, 'onPointerMove', isPage, { extendStroke: f.api.extendStroke, extendErase: f.api.extendErase, index: 2 })
  const routeUp = attributeCallback(paper, 'onPointerUp', isPage, { endStroke: f.api.endStroke, endErase: f.api.endErase })
  routeMove(f.event({ pointerType: 'pen', clientX: 250, clientY: 460 }))
  routeUp(f.event({ pointerType: 'pen', clientX: 250.3, clientY: 460.4 }))
  assert.equal(f.strokes.length, 1, 'A tool change during capture does not drop the finishing stroke')
  assert.equal(f.strokes[0].colour, 'red', 'The completed stroke keeps its starting colour')
  assert.equal(f.strokes[0].width, 'fine', 'The completed stroke keeps its starting nib')
  assert.deepEqual(f.strokes[0].points.slice(-2), [(250.3 - 10) / 600, (460.4 - 20) / 800], 'Pointerup records the final position even below the movement threshold')
  assert.equal(f.erases.length, 0, 'Changing tools cannot route the captured pen into erasing')
  assert.equal(f.pendingFrames, 0)
  assert.equal(f.live, null)
  f.frame()
  assert.equal(f.live, null, 'A queued frame cannot resurrect a completed stroke')
}

for (const finish of ['endStroke', 'cancelStroke']) {
  const f = drawingFixture('black')
  f.api.beginStroke(0, f.event({ pointerType: 'pen' }))
  f.api[finish](f.event({ pointerType: 'pen' }))
  assert.equal(f.strokes.length, finish === 'endStroke' ? 1 : 0, 'A stationary pen contact becomes a dot only when completed')
  if (f.strokes.length) assert.equal(f.strokes[0].points.length, 4)
}

{
  const f = drawingFixture('red')
  f.api.beginStroke(0, f.event())
  f.api.extendStroke(f.event({ clientX: 200 }))
  f.render({ marker: null, inkWidth: 'bold' })
  f.api.endStroke(f.event({ clientX: 220 }))
  assert.equal(f.strokes[0].colour, 'red', 'Putting down the marker does not discard an already captured stroke')
  assert.equal(f.strokes[0].width, 'fine')
}

for (const cancellation of ['pointercancel', 'pinch', 'unmount']) {
  const f = drawingFixture('eraser')
  const cleanup = f.api.installMarkingCleanup()
  const disposePinch = f.api.installPinch()
  f.api.beginErase(0, f.event())
  f.api.extendErase(0, f.event({ clientX: 130 }))
  f.api.extendErase(0, f.event({ clientX: 160 }))
  assert.equal(f.erases.length, 2, 'The transaction already contains real erase updates')
  const previewCount = f.previews
  if (cancellation === 'pointercancel') f.api.cancelErase(f.event())
  else if (cancellation === 'pinch') f.touch('touchstart', [[100, 200], [300, 200]])
  else cleanup()
  assert.deepEqual(f.eraseTransactions, ['start', true], `${cancellation} asks the owner to restore the entire eraser baseline`)
  assert.equal(f.captures.size, 0, `${cancellation} releases pointer capture`)
  f.api.extendErase(0, f.event({ clientX: 200 }))
  f.api.endErase(f.event())
  cleanup()
  assert.deepEqual(f.eraseTransactions, ['start', true], 'Late end and repeated cleanup cannot commit or cancel twice')
  assert.equal(f.erases.length, 2, 'Late moves cannot mutate a cancelled erase')
  if (cancellation === 'unmount') assert.equal(f.previews, previewCount, 'Unmount cleanup does not schedule React state')
  disposePinch()
}

{
  const f = drawingFixture('red')
  const cleanup = f.api.installMarkingCleanup()
  f.api.beginStroke(0, f.event())
  f.api.extendStroke(f.event({ clientX: 220 }))
  const previewCount = f.previews
  cleanup()
  assert.equal(f.pendingFrames, 0)
  assert.equal(f.captures.size, 0)
  assert.equal(f.scope.drawingRef.current, null)
  f.frame(); f.api.endStroke(f.event({ clientX: 220 }))
  assert.equal(f.previews, previewCount, 'A pending preview cannot update an unmounted Paper')
  assert.equal(f.strokes.length, 0)
}

for (const tool of ['red', 'eraser']) {
  const f = drawingFixture(tool)
  const dispose = f.api.installPinch()
  f.api[tool === 'eraser' ? 'beginErase' : 'beginStroke'](0, f.event())
  f.touch('touchstart', [[100, 200], [300, 200]])
  assert.equal(f.scope.drawingRef.current, null, 'A second finger cancels the pending stroke')
  assert.equal(f.scope.erasingRef.current, null, 'A second finger cancels the pending erase')
  assert.equal(f.live, null)
  f.api.extendStroke(f.event({ clientX: 200 }))
  f.api.extendErase(0, f.event({ clientX: 200 }))
  f.api.endStroke(f.event())
  f.api.endErase(f.event())
  assert.equal(f.strokes.length, 0)
  assert.equal(f.erases.length, 0, 'A touch that becomes a pinch neither draws nor erases')
  f.touch('touchmove', [[50, 200], [350, 200]])
  assert.match(f.style.transform, /scale\(1.5\)/)
  f.touch('touchcancel', [])
  f.touch('touchend', [])
  assert.equal(f.scope.pinchRef.current, null)
  assert.equal(f.style.transform, undefined)
  assert.equal(f.style.transformOrigin, undefined)
  dispose()
  assert.equal(f.listenerCount(), 0, 'Gesture listeners are removed on unmount')
}

for (const attribute of ['onContextMenu', 'onDragStart']) {
  let prevented = false
  attributeCallback(paper, attribute, node => hasAttribute(node, 'role', 'document'), {})(
    { preventDefault() { prevented = true } },
  )
  assert.equal(prevented, true, 'The score suppresses browser image menus and drag gestures')
}

console.log('PASS: Markup auto-hide, remembered pen, Done/Escape, coalesced samples, stroke tool snapshot, final endpoint/dot, frame-batched preview, grouped erase lifecycle, pinch/unmount cancellation, and scoped selection/menu suppression.')
