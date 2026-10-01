// Regression for take-card offsets surviving camera/multitrack layout changes.
// Run: node scripts/practice-qa/regressions/take-card-layout-bounds.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const bundle = await build({
  stdin: { contents: "export * from './src/utils/takeCardLayout'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const layout = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const initial = { left: 0, top: 0, width: 390, height: 844 }
const userPlaced = { x: 250, y: 650 }
const cardSize = { width: 300, height: 90 }
const cardAt = (bounds, position) => ({
  left: bounds.left + 50 + position.x,
  top: bounds.top + 50 + position.y,
  width: cardSize.width,
  height: cardSize.height,
})
const clampIn = (bounds, position) => layout.clampTakeCardTranslation({
  bounds, card: cardAt(initial, position), ...cardSize, scale: 1, position, inset: 8,
})
const reconcileIn = (bounds, preferredPosition, renderedPosition) => layout.clampTakeCardTranslation({
  bounds,
  card: cardAt(initial, renderedPosition),
  ...cardSize,
  scale: 1,
  position: preferredPosition,
  renderedPosition,
  inset: 8,
})

assert.equal(clampIn({ left: 0, top: 0, width: 0, height: 0 }, userPlaced), null,
  'hidden zero-sized bounds must not clamp a saved placement')
assert.equal(clampIn({ left: 0, top: 0, width: 180, height: 200 }, userPlaced), null,
  'small transient bounds must not clamp or become a new layout')
assert.equal(layout.takeCardBoundsAreStable(null, initial), false, 'one sample is not a stable layout')
assert.equal(layout.takeCardBoundsAreStable(initial, { ...initial, width: 320 }), false,
  'a viewport transition needs another settled sample')
assert.equal(layout.takeCardBoundsAreStable({ ...initial, width: 320 }, { ...initial, width: 320 }), true)

const deliberatelyPlacedInside = { x: 20, y: 30 }
assert.deepEqual(clampIn(initial, deliberatelyPlacedInside), deliberatelyPlacedInside,
  'a valid user placement stays where it was placed')
assert.deepEqual(clampIn(initial, { x: 0, y: 0 }), { x: 0, y: 0 },
  'an unplaced card already inside its bounds stays at the default position')

// Default/unplaced cards still need transient correction when the available
// shell narrows around their unchanged default origin.
const narrowShell = { left: 0, top: 0, width: 320, height: 600 }
const savedDefaultPosition = { x: 0, y: 0 }
const defaultCorrection = clampIn(narrowShell, savedDefaultPosition)
assert.ok(defaultCorrection && defaultCorrection.x < 0,
  'an unplaced default card outside a narrower shell is corrected')
const defaultRendered = cardAt(initial, defaultCorrection)
assert.ok(defaultRendered.left >= 8 && defaultRendered.left + defaultRendered.width <= narrowShell.width - 8)
assert.deepEqual(savedDefaultPosition, { x: 0, y: 0 },
  'the default offset stays untouched as the correction is transient')
assert.deepEqual(reconcileIn(initial, { x: 0, y: 0 }, { x: 43, y: 23 }), { x: 0, y: 0 },
  'a settled transition restores the exact default after constraints remap the rendered offset')
assert.deepEqual(reconcileIn(initial, { x: 20, y: 30 }, { x: -22, y: 53 }), { x: 20, y: 30 },
  'a settled transition restores the deliberate saved placement after constraint remapping')

// Keep this regression tied to MovableTakeSlot: the component callback must
// allow the helper to run for default offsets and keep automatic corrections
// out of persistent user-placement storage.
const component = await readFile('src/components/PipCompareRow.tsx', 'utf8')
const clampCallbackStart = component.indexOf('const clampPositionToBoundary = useCallback(() => {')
const clampCallbackEnd = component.indexOf('}, [boundaryRef, cardScale, dragX, dragY, editing, movable, positioningActive])', clampCallbackStart)
assert.ok(clampCallbackStart >= 0 && clampCallbackEnd > clampCallbackStart, 'find MovableTakeSlot clamp callback')
const clampCallback = component.slice(clampCallbackStart, clampCallbackEnd)
assert.doesNotMatch(clampCallback, /!savedPosition\.current.*currentX\s*===\s*0/,
  'the component must not skip default/unplaced offsets')
assert.doesNotMatch(clampCallback, /savePersistentWidgetPosition|savedPosition\.current\s*=/,
  'automatic corrections must not persist over intentional placement')

// Simulate repeated Multitrack close / camera return with a narrower app shell.
const tabletPortrait = narrowShell
let corrected = layout.clampTakeCardTranslation({
  bounds: tabletPortrait,
  card: cardAt(initial, userPlaced),
  ...cardSize,
  scale: 1,
  position: userPlaced,
  inset: 8,
})
assert.ok(corrected)
assert.deepEqual(userPlaced, { x: 250, y: 650 }, 'viewport correction must not overwrite saved user offsets')
let rendered = cardAt(initial, corrected)
assert.ok(rendered.left >= tabletPortrait.left + 8 && rendered.left + rendered.width <= tabletPortrait.left + tabletPortrait.width - 8)
assert.ok(rendered.top >= tabletPortrait.top + 8 && rendered.top + rendered.height <= tabletPortrait.top + tabletPortrait.height - 8)

// Rotate to landscape, then return to portrait; each stable boundary gets a
// transient clamp while the deliberate starting offset remains unchanged.
const tabletLandscape = { left: 0, top: 0, width: 844, height: 390 }
corrected = layout.clampTakeCardTranslation({
  bounds: tabletLandscape,
  card: cardAt(initial, corrected),
  ...cardSize,
  scale: 1,
  position: corrected,
  inset: 8,
})
assert.ok(corrected)
rendered = cardAt(initial, corrected)
assert.ok(rendered.left >= 8 && rendered.left + rendered.width <= tabletLandscape.width - 8)
assert.ok(rendered.top >= 8 && rendered.top + rendered.height <= tabletLandscape.height - 8)

const repeatedReturn = layout.clampTakeCardTranslation({
  bounds: tabletPortrait,
  card: cardAt(initial, corrected),
  ...cardSize,
  scale: 1,
  position: corrected,
  inset: 8,
})
assert.ok(repeatedReturn)
rendered = cardAt(initial, repeatedReturn)
assert.ok(rendered.left >= 8 && rendered.left + rendered.width <= tabletPortrait.width - 8)
assert.ok(rendered.top >= 8 && rendered.top + rendered.height <= tabletPortrait.height - 8)
console.log('PASS: default and placed cards clamp only into stable usable bounds; hidden/small bounds are ignored; automatic corrections do not persist over user placement')
