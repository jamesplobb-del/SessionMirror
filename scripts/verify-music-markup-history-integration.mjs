// Exercise the production Layer callbacks with real ink history and storage.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import ts from 'typescript'

const source = readFileSync('src/components/PracticeChartLayer.tsx', 'utf8')
const ast = ts.createSourceFile('layer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = ['restoreInk', 'pickMarker', 'currentInkHistory', 'persistStrokes', 'editStrokes',
  'handleStroke', 'eraseAt', 'beginErase', 'finishErase', 'undoStroke', 'redoStroke', 'clearMarks']
const declarations = new Map()
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) {
    declarations.set(node.name.getText(ast), node.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(declarations.size, names.length)
const callbacks = ts.transpileModule(names.map(name => `const ${declarations.get(name)};`).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
async function load(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const [ink, { ChartInkHistory }] = await Promise.all([
  load('src/components/practiceChart/chartInk.ts'),
  load('src/components/practiceChart/chartInkHistory.ts'),
])
const memory = new Map()
let failWrites = false
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem(key, value) { if (failWrites) throw new Error('Storage full'); memory.set(key, String(value)) },
  removeItem(key) { if (failWrites) throw new Error('Storage full'); memory.delete(key) },
}
const stroke = (coordinate, colour = 'black') => ({ page: 0, colour, width: 'fine', points: [coordinate, coordinate, coordinate + .01, coordinate + .01] })
const a = stroke(.1), b = stroke(.5, 'red'), c = stroke(.8)

function fixture() {
  const projectId = 'markup-history-integration'
  let chart = { attachmentId: 'score-a', fileName: 'part.pdf' }
  let revision = 0
  const state = { strokes: [], failed: false, marker: null, penColour: ink.loadInkColour(), activeEraseIdentity: null }
  const inkHistory = { current: new ChartInkHistory(projectId, []) }
  const strokesRef = { current: state.strokes }
  const eraseTransaction = { current: null }
  const commitMetadata = () => memory.set(`besttake:practice-chart:v1:${projectId}`, JSON.stringify(chart))
  commitMetadata()
  const render = () => {
    const bindings = {
      ...ink, useCallback: fn => fn, projectId, chart,
      inkIdentity: `${projectId}:${chart.attachmentId}:${revision}`,
      inkHistory, strokesRef, eraseTransaction,
      setStrokes: next => { state.strokes = next },
      setInkSaveFailed: failed => { state.failed = failed },
      setMarker: marker => { state.marker = marker },
      setPenColour: colour => { state.penColour = colour },
      setActiveEraseIdentity: identity => { state.activeEraseIdentity = identity },
    }
    return new Function(...Object.keys(bindings), `${callbacks}\nreturn { ${names.join(', ')} };`)(...Object.values(bindings))
  }
  return {
    state, inkHistory, render,
    saved: () => ink.loadInkStrokes(projectId),
    replace() { chart = { attachmentId: 'score-b', fileName: 'replacement.pdf' }; revision++; commitMetadata() },
  }
}

{
  const f = fixture(), api = f.render()
  api.handleStroke(a); api.handleStroke(b)
  assert.equal(f.saved().length, 2)
  api.undoStroke()
  assert.deepEqual(f.state.strokes, [a])
  assert.equal(f.inkHistory.current.canRedo, true)
  api.beginErase(); api.eraseAt(0, .1, .1, .04, .04)
  assert.deepEqual(f.state.strokes, [])
  api.finishErase(true)
  assert.deepEqual(f.state.strokes, [a], 'Cancelled erasing restores the complete baseline')
  assert.equal(f.inkHistory.current.canRedo, true, 'Cancelled erasing preserves the prior redo operation')
  api.redoStroke()
  assert.deepEqual(f.state.strokes, [a, b])
  api.beginErase(); api.eraseAt(0, .1, .1, .04, .04); api.eraseAt(0, .5, .5, .04, .04); api.finishErase(false)
  assert.deepEqual(f.state.strokes, [])
  api.undoStroke()
  assert.deepEqual(f.state.strokes, [a, b], 'One Undo restores all marks removed by one eraser drag')
  assert.equal(f.saved().length, 2, 'Undo persists restored markings')
  api.redoStroke()
  assert.deepEqual(f.saved(), [], 'Redo persists erasure')
  api.undoStroke(); api.clearMarks()
  assert.deepEqual(f.saved(), [])
  api.undoStroke()
  assert.deepEqual(f.state.strokes, [a, b], 'Clear is a reversible operation')
  api.redoStroke()
  assert.deepEqual(f.state.strokes, [])
}

{
  const f = fixture(), old = f.render()
  old.handleStroke(a); old.beginErase(); old.eraseAt(0, .1, .1, .04, .04)
  f.replace()
  const current = f.render()
  current.restoreInk([c]); current.beginErase(); current.eraseAt(0, .8, .8, .04, .04)
  old.finishErase(true)
  assert.deepEqual(f.state.strokes, [], 'An old score cancellation cannot overwrite the new score')
  current.finishErase(true)
  assert.deepEqual(f.state.strokes, [c], 'The current score still owns its erase transaction')
  assert.equal(f.inkHistory.current.canUndo, false, 'Replacing the score discards unrelated undo history')
  assert.deepEqual(f.saved(), [c])
}

{
  const f = fixture(), api = f.render()
  failWrites = true
  api.handleStroke(a)
  assert.equal(f.state.failed, true, 'A failed save remains visible to the user')
  assert.deepEqual(f.state.strokes, [a], 'The unsaved mark remains available in memory')
  failWrites = false
  api.undoStroke(); api.redoStroke()
  assert.equal(f.state.failed, false)
  assert.deepEqual(f.saved(), [a], 'Restored storage can persist an undone/redone mark')
  api.pickMarker('red'); api.pickMarker('eraser'); api.pickMarker(null)
  assert.equal(ink.loadInkColour(), 'red', 'Only the chosen pen colour persists, never eraser or active mode')
  const reopened = fixture()
  assert.equal(reopened.state.penColour, 'red')
  assert.equal(reopened.state.marker, null, 'A new reader opens without an active marking tool')
}

console.log('PASS: Layer history/storage integration, grouped erase cancellation and redo, reversible Clear, score ownership, save failures, and remembered pen without automatic marking.')
