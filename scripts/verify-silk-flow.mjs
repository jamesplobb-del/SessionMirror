import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
const result = await build({ stdin: { contents: `export * from './src/utils/reactiveSilkTuner'; export { PITCH_SILENCE_FLOOR_CENTS } from './src/utils/pitchConfig';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' })
const { drawSilkTuner, silkFlowColor, PITCH_SILENCE_FLOOR_CENTS: silence } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
assert.equal(silkFlowColor(0), '#039c70', 'Use the approved green rather than the old darkened neon')
assert.equal(silkFlowColor(11), '#df951c')
assert.equal(silkFlowColor(30), '#ef5c78')
assert.equal(silkFlowColor(0, true), '#59e7b5')
for (const boundary of [3, 10, 12, 22]) {
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const before = rgb(silkFlowColor(boundary - .01)), after = rgb(silkFlowColor(boundary + .01))
  assert.ok(before.every((v, i) => Math.abs(v - after[i]) <= 2), 'Tiny pitch changes must not flash the palette')
}
function render(points, dark = false, active = true) {
  const fills = [], strokes = [], dots = [], labels = [], gradients = []
  let path = [], balance = 0
  const ctx = new Proxy({
    save() { balance++ }, restore() { balance-- },
    beginPath() { path = [] }, moveTo(x, y) { path.push([x, y]) }, lineTo(x, y) { path.push([x, y]) },
    fill() { if (path.length) fills.push(path.slice()) },
    stroke() { strokes.push({ path: path.slice(), width: this.lineWidth, style: this.strokeStyle, cap: this.lineCap, join: this.lineJoin }) },
    arc(x, y, radius) { dots.push({ x, y, radius }) },
    fillText(text) { labels.push(text) },
    createLinearGradient() { const stops = []; gradients.push(stops); return { addColorStop(offset, color) { assert.ok(offset >= 0 && offset <= 1); stops.push({ offset, color }) } } },
    createRadialGradient() { assert.fail('Clean line must not draw a glow') },
  }, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) })
  const before = JSON.stringify(points)
  const color = drawSilkTuner(ctx, 390, 600, points, active, dark, true)
  assert.equal(JSON.stringify(points), before, 'Rendering cannot rewrite pitch history')
  assert.equal(balance, 0)
  assert.deepEqual(labels, [], 'No text on the graph')
  return { fills, strokes: strokes.filter(s => typeof s.style === 'object'), dots, color, gradients, allStrokes: strokes }
}
for (const dark of [false, true]) {
  const points = [{ x: 12, y: 180, cents: 24, time: 10 }, { x: 75, y: 240, cents: 12, time: 35 }, { x: 190, y: 315, cents: -3, time: 95 }, { x: 350, y: 300, cents: 0, time: 130 }]
  const drawn = render(points, dark)
  assert.equal(drawn.fills.length, 0, 'No ribbon or under-fill')
  assert.equal(drawn.strokes.length, 1, 'One continuous pitch stroke')
  assert.equal(drawn.allStrokes.length, 2, 'Only the center guide and pitch line; no endpoint outline')
  const line = drawn.strokes[0]
  assert.equal(line.width, 6, 'Approved constant 6 CSS pixel width')
  assert.equal(line.cap, 'round'); assert.equal(line.join, 'round')
  assert.deepEqual(line.path, points.map(p => [p.x, p.y]), 'Line follows the exact measured pitch')
  assert.ok(drawn.gradients.flat().every(stop => stop.color.endsWith(',0.92)')), 'Constant 92% opacity')
  assert.deepEqual(drawn.dots, [{ x: 350, y: 300, radius: 6 }], 'Solid head stays at the actual latest point')
  assert.equal(drawn.color, silkFlowColor(0, dark))
  const withRest = [...points.slice(0, 2), { x: 120, y: 0, cents: silence, time: 60 }, ...points.slice(2)]
  assert.equal(render(withRest, dark).strokes.length, 2, 'Real rests remain disconnected lines')
  const silent = render([...points, { x: 355, y: 0, cents: silence, time: 150 }], dark)
  assert.equal(silent.color, 'transparent'); assert.equal(silent.dots.length, 0)
  assert.equal(render(points, dark, false).color, 'transparent')
  assert.equal(render([], dark).dots.length, 0)
}
const styles = await readFile('src/styles/open-lens-system.css', 'utf8')
assert.match(styles, /var\(--silk-wash\) 32%,transparent/, 'Screen color follows the live wash')
assert.match(styles, /\),var\(--ls-bg\)!important/, 'Silence retains an opaque background')
const wash = await readFile('src/styles/reactive-silk-tuner.css', 'utf8')
assert.match(wash, /@property --silk-wash\s*\{[^}]*inherits:\s*false/, 'Preserve the WebKit memory fix')
console.log('PASS: constant 6px Clean line, no graph text/glow/under-fill, exact endpoint, light/dark, silence, real gaps, immutable history, opaque reactive background and non-inheriting wash.')
