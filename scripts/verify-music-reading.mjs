// Exercise the actual reader gesture callbacks, including interrupted gestures.
// Run: node scripts/verify-music-reading.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile('src/components/PracticeChartLayer.tsx', 'utf8')
const ast = ts.createSourceFile('reader.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['TAP_SLOP_PX', 'TAP_MS', 'TURN_ZONE', 'isControlTarget', 'onPointerDown', 'onPointerMove', 'onPointerUp']
const declarations = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(declarations.size, names.length)
const code = ts.transpileModule(names.map(name => `const ${declarations.get(name)};`).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
class Target {
  constructor(control = false) { this.control = control }
  closest() { return this.control ? this : null }
}
const events = []
const state = { marker: null, loadFailed: false, reading: true }
const bindings = {
  gesture: { current: null }, Element: Target,
  paper: { current: { turn: direction => events.push(direction) } },
  revealControls: () => { events.push('show'); state.reading = false },
  hideControls: () => { events.push('hide'); state.reading = true },
  state,
}
const handlers = new Function(...Object.keys(bindings), `
  return () => {
    const { marker, loadFailed, reading } = state;
    ${code}
    return { onPointerDown, onPointerMove, onPointerUp };
  };
`)(...Object.values(bindings))
let width = 834
const event = (fraction, patch = {}) => ({ isPrimary: true, button: 0, pointerId: 1,
  clientX: 10 + fraction * width, clientY: 200, target: new Target(),
  currentTarget: { getBoundingClientRect: () => ({ left: 10, width }) }, ...patch })
function tap(fraction, patch) {
  const h = handlers()
  h.onPointerDown(event(fraction, patch))
  h.onPointerUp(event(fraction, patch))
}
for (width of [390, 834, 1194]) {
  for (const fraction of [.01, .22, .30, 1 / 3]) tap(fraction)
  assert.deepEqual(events.splice(0), [-1, -1, -1, -1], `wider left zone at ${width}px`)
  for (const fraction of [.67, .70, .78, .99]) tap(fraction)
  assert.deepEqual(events.splice(0), [1, 1, 1, 1], `wider right zone at ${width}px`)
  tap(.5); tap(.5)
  assert.deepEqual(events.splice(0), ['show', 'hide'], 'the center reveals and hides without turning')
}
for (const patch of [{ button: 2 }, { isPrimary: false }, { target: new Target(true) }]) {
  tap(.3, patch); tap(.5, patch); tap(.7, patch)
}
assert.deepEqual(events, [], 'right-clicks, secondary pointers and controls do not act on the score')
for (const marker of ['black', 'red', 'eraser']) {
  state.marker = marker
  tap(.1); tap(.5); tap(.9)
}
assert.deepEqual(events, [], 'drawing and erasing never turn pages or hide the palette')
state.marker = null
state.loadFailed = true
tap(.5); tap(.9)
assert.deepEqual(events, [], 'error recovery controls cannot be hidden by taps')
state.loadFailed = false
let h = handlers()
h.onPointerDown(event(.3))
h.onPointerMove(event(.6))
h.onPointerMove(event(.3))
h.onPointerUp(event(.3))
assert.deepEqual(events, [], 'a drag back to its origin is still not a tap')
h.onPointerDown(event(.7))
h.onPointerDown(event(.5, { isPrimary: false, pointerId: 2 }))
h.onPointerUp(event(.7))
assert.deepEqual(events, [], 'a second finger cancels the first tap')
h.onPointerDown(event(.5))
bindings.gesture.current = null // pointercancel / multi-touch capture
h.onPointerUp(event(.5))
h.onPointerDown(event(.9))
bindings.gesture.current.at -= 600
h.onPointerUp(event(.9))
assert.deepEqual(events, [], 'cancelled gestures and long presses do nothing')
h.onPointerDown(event(.9))
h.onPointerUp(event(.9, { pointerId: 3 }))
assert.deepEqual(events, [], 'a different pointer cannot finish a gesture')
console.log('PASS: Music clean-view toggle, expanded page-turn zones at phone/tablet widths, markup, controls, drags, multi-touch, cancellation, and long presses.')
