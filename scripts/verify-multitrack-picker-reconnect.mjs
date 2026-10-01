import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import ts from 'typescript'

// Extract the real Take Vault pick handler from the workspace component. State
// setters are boundaries, but its branching and timing calculation are real.
const path = 'src/multitrack/components/MultitrackOverlay.tsx'
const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'MultitrackTakePicker') {
    const attribute = node.attributes.properties.find(property =>
      ts.isJsxAttribute(property) && property.name.getText(source) === 'onSelectTake')
    if (attribute?.initializer && ts.isJsxExpression(attribute.initializer)) {
      handler = attribute.initializer.expression?.getText(source)
    }
  }
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(handler, 'actual MultitrackTakePicker selection handler is present')
const js = ts.transpileModule(`const onSelectTake = (${handler})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

const timingBuild = await build({
  stdin: { contents: "export { timelineOffsetMsForTake } from './src/multitrack/synchronization/multitrackBeatSchedule.ts'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const { timelineOffsetMsForTake } = await import(
  `data:text/javascript;base64,${Buffer.from(timingBuild.outputFiles[0].text).toString('base64')}`,
)

function selectFromVault(panel, take) {
  const calls = { assignments: [], updates: [], picker: [], activePanel: [] }
  const env = {
    takePickerPanelId: panel.id,
    session: { panels: [panel], practice: { bpm: 120 } },
    assignTakeToPanel: (...args) => calls.assignments.push(args),
    timelineOffsetMsForTake,
    updatePanel: (...args) => calls.updates.push(args),
    setTakePickerPanelId: value => calls.picker.push(value),
    setActivePanelId: value => calls.activePanel.push(value),
  }
  const callback = new Function(...Object.keys(env), `${js}; return onSelectTake`)(...Object.values(env))
  callback(take)
  return calls
}

const retainedPanel = {
  kind: 'performance', id: 'extra-1', overlay: { xPercent: 30, yPercent: 40, widthPercent: 25, heightPercent: 20 },
  missingTakeId: 'original', label: 'Harmony', trimStartSec: 2.3, trimEndSec: 20,
  timelineOffsetMs: -10_000, sectionStartSec: 10, sectionEndSec: 27.7,
}
const originalTake = { id: 'original', duration: 30, timelineOffsetMs: -8_000 }
const reconnect = selectFromVault(retainedPanel, originalTake)
assert.deepEqual(reconnect.assignments, [['extra-1', originalTake]])
assert.deepEqual(reconnect.updates, [], 'reconnecting the original id must not reset saved placement or timing')
assert.deepEqual(reconnect.picker, [null])
assert.deepEqual(reconnect.activePanel, [null])

const replacementPanel = { ...retainedPanel, missingTakeId: 'original' }
const replacementTake = { id: 'replacement', duration: 18, timelineOffsetMs: -1_500 }
const replacement = selectFromVault(replacementPanel, replacementTake)
assert.deepEqual(replacement.assignments, [['extra-1', replacementTake]])
assert.deepEqual(replacement.updates, [[ 'extra-1', {
  timelineOffsetMs: -10_000, trimStartSec: 0,
  sectionStartSec: 10, sectionEndSec: 28,
} ]], 'a different replacement uses its own source timing within the existing overlay section')
assert.deepEqual(replacement.picker, [null])
assert.deepEqual(replacement.activePanel, [null])

console.log('PASS: actual Vault selection preserves timing for original-id reconnect and recalculates a different overlay replacement')
