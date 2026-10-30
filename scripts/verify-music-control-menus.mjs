// Run with: node scripts/verify-music-control-menus.mjs
// Exercises production callbacks and menu events without adding a DOM test dependency.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'

const layerSource = await readFile('src/components/PracticeChartLayer.tsx', 'utf8')
const layerAst = ts.createSourceFile('PracticeChartLayer.tsx', layerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function productionCallback(name, bindings) {
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(layerAst) === name) {
      callback = node.initializer?.arguments?.[0]
    }
    ts.forEachChild(node, visit)
  }
  visit(layerAst)
  assert.ok(callback, `${name} remains a real production callback`)
  const code = ts.transpileModule(`const callback = ${callback.getText(layerAst)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  return new Function(...Object.keys(bindings), `${code}; return callback;`)(...Object.values(bindings))
}

const state = { menu: null, marker: null, workspace: true, anchor: null }
const anchor = { isConnected: true, focus: () => { anchor.focused = true } }
function open(mode) {
  productionCallback('openMusicMenu', {
    musicMenu: state.menu,
    setMusicMenu: value => { state.menu = value },
    setMusicMenuAnchor: value => { state.anchor = value },
    setMarker: value => { state.marker = value },
    setWorkspaceOpen: value => { state.workspace = value },
  })(mode, anchor)
}
open('markup')
assert.equal(state.menu, 'markup')
assert.equal(state.marker, 'black', 'opening Markup immediately picks up a marker')
assert.equal(state.workspace, false, 'Markup and Workspace are mutually exclusive')
state.marker = 'red'
open('page')
assert.equal(state.menu, 'page', 'Page opens Page even after red Markup')
assert.equal(state.marker, null, 'Page immediately returns score taps to reading')
open('markup')
open('page')
open('markup')
assert.equal(state.menu, 'markup', 'rapid menu switching ends on the requested mode')
assert.equal(state.marker, 'black')
open('markup')
assert.equal(state.menu, null, 'the active trigger toggles its menu closed')
assert.equal(state.marker, null, 'closing the active menu puts the marker away')
open('markup')
const dismiss = productionCallback('dismissMusicMenu', {
  musicMenuAnchor: anchor,
  setMusicMenu: value => { state.menu = value },
  setMarker: value => { state.marker = value },
})
dismiss(true)
assert.equal(state.menu, null)
assert.equal(state.marker, null)
assert.equal(anchor.focused, true, 'Done and Escape restore the opener')
anchor.focused = false
dismiss(false)
assert.equal(anchor.focused, false, 'an outside click does not steal the next control focus')

const documentListeners = new Map()
globalThis.document = {
  addEventListener: (event, listener) => documentListeners.set(event, listener),
  removeEventListener: (event, listener) => {
    if (documentListeners.get(event) === listener) documentListeners.delete(event)
  },
}
class TestElement {
  constructor(selectors = []) { this.selectors = selectors }
  closest(selector) { return this.selectors.includes(selector) ? this : null }
}
globalThis.Element = TestElement
const built = await build({
  entryPoints: ['src/components/practiceChart/MusicWidget.tsx'], bundle: true, write: false,
  platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'menu-test-ports', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|react-dom|framer-motion|lucide-react)$/ }, args => ({ path: args.path, namespace: 'ports' }))
    builder.onResolve({ filter: /PremiumMotionSurface$/ }, () => ({ path: 'motion-surface', namespace: 'ports' }))
    builder.onResolve({ filter: /usePrefersReducedMotion$/ }, () => ({ path: 'reduced-motion', namespace: 'ports' }))
    builder.onLoad({ filter: /.*/, namespace: 'ports' }, args => {
      if (args.path === 'react') return { contents: `
        let refs = [], index = 0, effects = [], cleanup = [];
        export const useRef = initial => refs[index++] ?? (refs[index - 1] = { current: initial });
        export const useState = initial => [initial, () => {}];
        export const useLayoutEffect = () => {};
        export const useEffect = effect => { effects.push(effect); };
        globalThis.__menuTest = {
          beginRender() { index = 0; effects = []; },
          flushEffects() { cleanup.forEach(fn => fn?.()); cleanup = effects.map(fn => fn()); },
          dispose() { cleanup.forEach(fn => fn?.()); cleanup = []; },
        };
      ` }
      if (args.path === 'react/jsx-runtime') return { contents: `export const jsx = (type, props, key) => ({ type, props, key }); export const jsxs = jsx; export const Fragment = 'fragment';` }
      if (args.path === 'react-dom') return { contents: `export const createPortal = children => children;` }
      if (args.path === 'framer-motion') return { contents: `export const AnimatePresence = 'presence';` }
      if (args.path === 'reduced-motion') return { contents: `export const usePrefersReducedMotion = () => !!globalThis.__menuReducedMotion;` }
      if (args.path === 'motion-surface') return { contents: `export const PremiumMotionDiv = 'motion-div';` }
      return { contents: ['Check','ChevronLeft','ChevronRight','Eraser','EyeOff','FileMusic','Plus','RefreshCw','Share','SquareSplitVertical','Trash2','Undo2','X','ZoomIn','ZoomOut'].map(name => `export const ${name} = 'svg';`).join('\n') }
    })
  } }],
})
const { default: MusicWidget } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
function nodes(tree, match) {
  if (Array.isArray(tree)) return tree.flatMap(value => nodes(value, match))
  if (!tree || typeof tree !== 'object') return []
  return [...(match(tree) ? [tree] : []), ...nodes(tree.props?.children, match)]
}
function label(tree) {
  if (Array.isArray(tree)) return tree.map(label).join('')
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  return tree && typeof tree === 'object' ? label(tree.props?.children) : ''
}
const events = []
const props = {
  boundaryRef: { current: {} }, visible: true, menuMode: 'page', menuAnchor: anchor, menuId: 'music-test',
  onDismiss: restore => events.push(['dismiss', restore]), hasChart: true, fileName: 'Part.pdf',
  pageView: { first: 0, last: 0, count: 3 }, paperVisible: true, busy: false, error: '',
  fit: 'page', zoom: 1, spreadAvailable: false, halfTurn: false, marker: null, inkWidth: 'fine', markCount: 2,
  saving: false, onAdd() {}, onRemove() {}, onTurn: direction => events.push(['turn', direction]),
  onFitChange: value => events.push(['fit', value]), onHalfTurnChange() {}, onPaperVisibleChange() {},
  onZoomChange: direction => events.push(['zoom', direction]), onResetZoom: () => events.push(['resetZoom']),
  onMarkerChange: value => events.push(['marker', value]), onInkWidthChange() {}, onUndoMark() {}, onClearMarks() {}, onSaveMarked() {},
}
function render(patch = {}) {
  Object.assign(props, patch)
  globalThis.__menuTest.beginRender()
  const tree = MusicWidget(props)
  globalThis.__menuTest.flushEffects()
  const dialog = nodes(tree, node => node.props?.role === 'dialog')[0]
  if (dialog) dialog.props.ref.current = { contains: target => target.selectors?.includes('inside-menu') }
  return { tree, dialog }
}
const page = render()
assert.equal(page.dialog.key, 'music-controls')
assert.equal(page.dialog.props.id, 'music-test-page')
assert.equal(nodes(page.tree, node => node.type === 'button' && /^(Black|Red|Erase)$/.test(label(node))).length, 0, 'Page contains no drawing palette or duplicated tabs')
assert.equal(nodes(page.tree, node => node.type === 'button' && label(node).startsWith('Two pages')).length, 0, 'a spread is absent when it cannot fit')
nodes(page.tree, node => node.type === 'button' && label(node).startsWith('Fill width'))[0].props.onClick()
assert.deepEqual(events.splice(0), [['fit', 'width'], ['dismiss', true]], 'choosing a reading fit applies it and returns focus to Page')
function zoomButtons(tree) {
  return {
    out: nodes(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Zoom out')[0],
    reset: nodes(tree, node => node.type === 'button' && node.props?.['aria-label']?.startsWith('Reset zoom to'))[0],
    in: nodes(tree, node => node.type === 'button' && node.props?.['aria-label'] === 'Zoom in')[0],
  }
}
const zoom = zoomButtons(page.tree)
assert.equal(label(zoom.reset), '100%Reset', 'Page shows the current zoom and a reset action')
assert.equal(zoom.out.props.disabled, false)
assert.equal(zoom.in.props.disabled, false)
zoom.out.props.onClick()
zoom.in.props.onClick()
zoom.in.props.onClick()
zoom.reset.props.onClick()
assert.deepEqual(events.splice(0), [['zoom', -1], ['zoom', 1], ['zoom', 1], ['resetZoom']], 'zoom and reset callbacks keep Page open for repeated adjustments')
const smallest = zoomButtons(render({ zoom: .5 }).tree)
assert.equal(smallest.out.props.disabled, true, 'zoom out stops at 50%')
assert.equal(smallest.in.props.disabled, false)
assert.equal(label(smallest.reset), '50%Reset')
const largest = zoomButtons(render({ zoom: 3 }).tree)
assert.equal(largest.in.props.disabled, true, 'zoom in stops at 300%')
assert.equal(largest.out.props.disabled, false)
assert.equal(label(largest.reset), '300%Reset')
const unavailableZoom = zoomButtons(render({ pageView: null }).tree)
assert.ok(Object.values(unavailableZoom).every(button => button.props.disabled), 'zoom controls wait for an available page')
render({ zoom: 1, pageView: { first: 0, last: 0, count: 3 } })
let stopped = false
page.dialog.props.onPointerUp({ stopPropagation: () => { stopped = true } })
assert.equal(stopped, true, 'menu clicks cannot bubble into score page turns')
documentListeners.get('pointerdown')({ target: new TestElement(['.practice-chart-scroll']) })
assert.deepEqual(events.splice(0), [['dismiss', false]], 'a score tap dismisses the reading menu')
const markup = render({ menuMode: 'markup', marker: 'black' })
assert.equal(markup.dialog.key, page.dialog.key, 'mode switches update one stable surface instead of sharing refs between departing and arriving dialogs')
assert.equal(nodes(markup.tree, node => node.props?.role === 'dialog').length, 1)
assert.equal(markup.dialog.props.id, 'music-test-markup')
assert.equal(nodes(markup.tree, node => node.type === 'button' && label(node).startsWith('One page')).length, 0, 'Markup contains no duplicate reading settings')
assert.ok(Object.values(zoomButtons(markup.tree)).every(button => button === undefined), 'zoom controls appear only in Page, not Markup')
documentListeners.get('pointerdown')({ target: new TestElement(['.practice-chart-scroll']) })
documentListeners.get('focusin')({ target: new TestElement(['.practice-chart-scroll']) })
assert.deepEqual(events, [], 'drawing on the score keeps Markup open')
documentListeners.get('pointerdown')({ target: new TestElement(['[data-music-menu-trigger]']) })
assert.deepEqual(events, [], 'trigger switching is owned by the trigger, without an outside-dismiss race')
nodes(markup.tree, node => node.props?.['aria-label'] === 'red marker')[0].props.onClick()
assert.deepEqual(events.splice(0), [['marker', 'red']], 'choosing ink keeps the palette open')
let prevented = false
documentListeners.get('keydown')({ key: 'Escape', preventDefault: () => { prevented = true }, stopPropagation() {} })
assert.equal(prevented, true)
assert.deepEqual(events.splice(0), [['dismiss', true]], 'Escape closes the palette and asks for opener focus')
documentListeners.get('pointerdown')({ target: new TestElement() })
assert.deepEqual(events.splice(0), [['dismiss', false]], 'a different workspace control dismisses Markup')
globalThis.__menuReducedMotion = true
const reduced = render()
assert.deepEqual(reduced.dialog.props.initial, { opacity: 0 }, 'a changed reduced-motion preference removes menu translation and scale')
assert.equal(reduced.dialog.props.transition.duration, .1)
const hidden = render({ visible: false })
assert.equal(hidden.dialog, undefined, 'hidden menus contain no accessible or clickable controls')
assert.equal(documentListeners.size, 0, 'hidden menu listeners are removed')
globalThis.__menuTest.dispose()

const workspaceBindings = {
  document: { activeElement: 'tool-button' }, workspacePanel: { current: { contains: node => node === 'tool-button' } },
  workspaceTrigger: { current: { focus: () => { anchor.focused = true } } },
  setWorkspaceOpen: value => { state.workspace = value },
}
anchor.focused = false
productionCallback('closeWorkspace', workspaceBindings)()
assert.equal(state.workspace, false)
assert.equal(anchor.focused, true, 'closing a keyboard-launched tray restores the Workspace trigger')
assert.match(layerSource, /onWorkspaceChange\(key, true\); closeWorkspace\(\)/, 'primary launches reopen enabled panels')
assert.match(layerSource, /onWorkspaceChange\(key, false\)/, 'panel removal remains explicit')
assert.match(layerSource, /onReferencesChange\(true\); closeWorkspace\(\)/, 'References has the same one-tap launch behavior')
assert.doesNotMatch(layerSource, /pageToolsRequested|markUpRequested/, 'one mode state makes Page and Markup mutually exclusive')
function removalCallback(call, bindings) {
  let callback
  function visit(node) {
    if (ts.isArrowFunction(node) && node.getText(layerAst).includes(call)
      && node.getText(layerAst).includes('event.currentTarget.parentElement')) callback = node
    ts.forEachChild(node, visit)
  }
  visit(layerAst)
  assert.ok(callback, 'the explicit removal callback restores its remaining launch control')
  const code = ts.transpileModule(`const callback = ${callback.getText(layerAst)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
  return new Function(...Object.keys(bindings), `${code}; return callback;`)(...Object.values(bindings))
}
const removeEvents = []
const primaryLaunch = { focus: options => { assert.equal(options.preventScroll, true); removeEvents.push('focus') } }
const removeEvent = { currentTarget: { parentElement: { querySelector: selector => {
  assert.equal(selector, 'button')
  return primaryLaunch
} } } }
state.workspace = true
for (const key of ['pitchTrackerEnabled', 'showMetronome', 'showDrone', 'showTakeCards']) {
  removalCallback('onWorkspaceChange(key, false)', {
    key, onWorkspaceChange: (removedKey, enabled) => {
      assert.deepEqual(removeEvents, ['focus'], 'focus transfers before the focused Remove button unmounts')
      assert.equal(removedKey, key)
      assert.equal(enabled, false)
      removeEvents.push('remove')
    },
  })(removeEvent)
  assert.deepEqual(removeEvents.splice(0), ['focus', 'remove'])
  assert.equal(state.workspace, true, 'removal keeps the Workspace tray open')
}
removalCallback('onReferencesChange(false)', {
  onReferencesChange: enabled => {
    assert.deepEqual(removeEvents, ['focus'], 'References removal uses the same focus order')
    assert.equal(enabled, false)
    removeEvents.push('remove')
  },
})(removeEvent)
assert.deepEqual(removeEvents.splice(0), ['focus', 'remove'])
assert.equal(state.workspace, true)
console.log('PASS: Page/Markup selection, bounded zoom/reset without dismissal, rapid switching, reading/drawing dismissal, Escape/focus, hidden controls, one-tap Workspace launch, and focused removal regressions.')
