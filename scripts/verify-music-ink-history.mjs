// Actual history and eraser geometry; no storage, DOM, or duplicate implementation.
// Run: node scripts/verify-music-ink-history.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const compiled = await build({
  stdin: { contents: "export { ChartInkHistory } from './src/components/practiceChart/chartInkHistory'; export { eraseStrokesAt } from './src/components/practiceChart/chartInk';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const { ChartInkHistory, eraseStrokesAt } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const stroke = (x, page = 0) => Object.freeze({ page, colour: 'black', width: 'fine', points: Object.freeze([x, .1, x, .2]) })
const a = stroke(.1), b = stroke(.3), c = stroke(.5), otherPage = stroke(.1, 1)
const copied = strokes => strokes.map(mark => ({ ...mark, points: [...mark.points] }))

{
  const history = new ChartInkHistory('score-a')
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)
  assert.deepEqual(history.edit([a]), [a])
  assert.deepEqual(history.edit([a, b]), [a, b])
  assert.equal(history.canUndo, true)
  assert.deepEqual(history.undo(), [a], 'Undo removes one completed drawing')
  assert.deepEqual(history.undo(), [], 'The first drawing also has a reversible empty baseline')
  assert.equal(history.undo(), null)
  assert.deepEqual(history.redo(), [a])
  assert.deepEqual(history.redo(), [a, b], 'Redo restores the exact mark sequence')
  assert.equal(history.redo(), null)
}

{
  const initial = [a, b, c, otherPage]
  const history = new ChartInkHistory('score-a', initial)
  history.begin()
  let next = eraseStrokesAt(history.snapshot(), 0, .1, .15, .02, .02)
  assert.deepEqual(history.edit(next), [b, c, otherPage])
  assert.equal(history.canUndo, true, 'The first changed erase update enables Undo before pointer-up')
  history.begin() // A repeated begin must not split or replace the drag baseline.
  next = eraseStrokesAt(history.snapshot(), 0, .3, .15, .02, .02)
  history.edit(next)
  next = eraseStrokesAt(history.snapshot(), 0, .5, .15, .02, .02)
  history.edit(next)
  assert.equal(history.end(), true)
  assert.deepEqual(history.snapshot(), [otherPage], 'Erasing affects only touched marks on the selected page')
  assert.deepEqual(history.undo(), initial, 'One Undo restores all marks erased during the drag')
  assert.equal(history.undo(), null, 'The erase updates did not create extra undo steps')
  assert.deepEqual(history.redo(), [otherPage], 'One Redo repeats the entire eraser drag')
  assert.equal(history.end(), false, 'A duplicate end cannot record another operation')
}

{
  const history = new ChartInkHistory('score-a', [a, b])
  history.edit([])
  assert.deepEqual(history.undo(), [a, b], 'Clear is undoable')
  assert.equal(history.canRedo, true)
  assert.equal(history.edit(copied([a, b])), null, 'A value-equivalent edit is a no-op')
  assert.equal(history.canRedo, true, 'A no-op edit preserves Redo')
  history.begin()
  assert.equal(history.end(), false, 'A no-touch erase gesture is a no-op')
  assert.equal(history.canRedo, true)
  history.begin()
  history.edit([a])
  assert.equal(history.canRedo, false, 'A changed in-flight gesture cannot redo an earlier branch')
  history.edit(copied([a, b]))
  assert.equal(history.end(), false, 'A gesture with no net change does not create history')
  assert.equal(history.canRedo, true, 'A no-net-change gesture preserves the earlier redo branch')
  assert.deepEqual(history.redo(), [])
  assert.equal(history.edit([]), null, 'Clearing an empty score adds no operation')
  history.undo()
  history.edit([a, b, c])
  assert.equal(history.canRedo, false, 'A real new edit clears Redo')
  assert.equal(history.redo(), null)
}

{
  const history = new ChartInkHistory('score-a', [a, b])
  history.edit([a, b, c]); history.undo()
  history.begin(); history.edit([b])
  assert.deepEqual(history.cancel(), [a, b], 'A pinch or cancelled pointer restores the erase baseline')
  assert.equal(history.canUndo, false, 'Cancelled erasing adds no undo operation')
  assert.equal(history.canRedo, true, 'Cancelling erasing preserves the previous redo branch')
  assert.deepEqual(history.redo(), [a, b, c])
  assert.equal(history.cancel(), null, 'Cancellation without a gesture is harmless')
  history.begin()
  assert.equal(history.cancel(), null, 'Cancelling an unchanged gesture needs no persistence write')
  history.begin(); history.edit([a])
  assert.deepEqual(history.undo(), [a, b, c], 'Undo closes and reverses an unfinished erase gesture')
  assert.deepEqual(history.redo(), [a], 'Its Redo remains one operation')
}

{
  const history = new ChartInkHistory('score-a', [a])
  history.edit([a, b]); history.undo()
  history.begin(); history.edit([])
  history.reset('score-b', [otherPage])
  assert.equal(history.identity, 'score-b')
  assert.deepEqual(history.snapshot(), [otherPage])
  assert.equal(history.canUndo, false)
  assert.equal(history.canRedo, false)
  assert.equal(history.cancel(), null, 'An old gesture cannot restore marks onto a replacement score')
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)
  history.edit([])
  history.reset('score-b', [b])
  assert.equal(history.canUndo, false, 'An authoritative reload also resets history for the same identity')
}

{
  const initial = [a], history = new ChartInkHistory('score-a', initial)
  initial.push(b)
  assert.deepEqual(history.snapshot(), [a], 'Caller changes to the initial list do not alter history')
  const next = [a, b], returned = history.edit(next)
  next.pop(); returned.length = 0
  assert.deepEqual(history.snapshot(), [a, b], 'History owns its list independently of inputs and returned arrays')
  const snapshot = history.snapshot()
  assert.equal(snapshot[0], a, 'Immutable strokes and point buffers are shared, not deep-copied per pointer move')
  snapshot.pop()
  const undone = history.undo(); undone.push(c)
  assert.deepEqual(history.redo(), [a, b], 'Changing a returned list cannot corrupt stored undo/redo snapshots')
}

for (const limit of [3, 50]) {
  const history = limit === 50 ? new ChartInkHistory('score-a') : new ChartInkHistory('score-a', [], limit)
  for (let index = 0; index < limit + 4; index++) history.edit([stroke(index / 100)])
  let undoCount = 0
  while (history.undo() !== null) undoCount++
  assert.equal(undoCount, limit, 'History retains at most the configured operation limit')
  let redoCount = 0
  while (history.redo() !== null) redoCount++
  assert.equal(redoCount, limit, 'The retained operations remain fully redoable')
}
for (const invalid of [0, -1, 1.5, Infinity, NaN]) {
  assert.throws(() => new ChartInkHistory('score-a', [], invalid), RangeError)
}

console.log('PASS: ink history drawing, grouped eraser/Undo/Redo, Clear, no-op redo preservation, interrupted gesture rollback, score reset, immutable snapshot ownership, and bounded operations.')
