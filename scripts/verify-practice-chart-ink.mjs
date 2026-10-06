// Rehearsal marks: what is stored, what is thrown away, and what comes out of
// "Save PDF". Run: node scripts/verify-practice-chart-ink.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { PDFDocument } from 'pdf-lib'
import zlib from 'node:zlib'

/**
 * What the page actually tells a reader to draw. pdf-lib deflates its content
 * streams, so searching the raw file for a colour finds nothing whether the
 * mark is there or not — which would make every assertion about ink pass by
 * saying nothing at all.
 */
function pageDrawingOps(bytes) {
  const raw = Buffer.from(bytes)
  const latin = raw.toString('latin1')
  let ops = ''
  for (const match of latin.matchAll(/stream\r?\n/g)) {
    const start = match.index + match[0].length
    const end = latin.indexOf('endstream', start)
    if (end < 0) continue
    const slice = raw.subarray(start, end)
    try { ops += zlib.inflateSync(slice).toString('latin1') } catch { ops += slice.toString('latin1') }
  }
  return ops
}

/** Capacitor is a device API; on the web path the export never calls it. */
const stubCapacitor = {
  name: 'stub-capacitor',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: 'cap' }))
    pluginBuild.onLoad({ filter: /.*/, namespace: 'cap' }, () => ({
      contents: `
        export const Capacitor = { isNativePlatform: () => false }
        export const Directory = { Cache: 'CACHE', Data: 'DATA' }
        export const Filesystem = {}
        export const Share = {}
        export const Encoding = { UTF8: 'utf8' }
      `,
      loader: 'js',
    }))
  },
}

async function load(entry, plugins = []) {
  const result = await build({
    // pdf-lib is bundled in, not left external: a bare specifier cannot be
    // resolved from the data: URL these modules are imported through.
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins,
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}

const ink = await load('src/components/practiceChart/chartInk.ts')
const exporter = await load('src/components/practiceChart/chartExport.ts', [stubCapacitor])

/* A failed save must be observable, keep the previous marks, and permit retry. */
{
  const previousStorage = globalThis.localStorage
  const store = new Map()
  let full = false
  let removalBlocked = false
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw new Error('Storage quota exceeded')
      store.set(key, value)
    },
    removeItem: key => {
      if (removalBlocked) throw new Error('Storage unavailable')
      store.delete(key)
    },
  }
  try {
    const original = [{ page: 0, colour: 'red', points: [0.1, 0.2, 0.4, 0.5] }]
    const edited = [...original, { page: 1, colour: 'black', points: [0.2, 0.3, 0.5, 0.6] }]
    assert.equal(ink.saveInkStrokes('qa-ink', original), true)
    assert.deepEqual(ink.loadInkStrokes('qa-ink'), original)
    full = true
    assert.equal(ink.saveInkStrokes('qa-ink', edited), false, 'The reader must know marks were not saved')
    assert.deepEqual(ink.loadInkStrokes('qa-ink'), original, 'A failed write leaves prior marks intact')
    full = false
    assert.equal(ink.saveInkStrokes('qa-ink', edited), true, 'Retry can save all current marks')
    assert.deepEqual(ink.loadInkStrokes('qa-ink'), edited)
    removalBlocked = true
    assert.equal(ink.clearInkStrokes('qa-ink'), false, 'A failed clear must be observable too')
    assert.deepEqual(ink.loadInkStrokes('qa-ink'), edited)
    removalBlocked = false
    assert.equal(ink.clearInkStrokes('qa-ink'), true)
    assert.deepEqual(ink.loadInkStrokes('qa-ink'), [])
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
}

/* ---- What survives being read back ------------------------------------- */

assert.deepEqual(ink.parseInkStrokes(null), [], 'Junk is not a set of marks')
assert.deepEqual(ink.parseInkStrokes([{ page: 0, colour: 'blue', points: [0, 0, 1, 1] }]), [],
  'Only the two marker colours are accepted')
assert.deepEqual(ink.parseInkStrokes([{ page: -1, colour: 'red', points: [0, 0, 1, 1] }]), [],
  'A mark cannot belong to a page that cannot exist')
assert.deepEqual(ink.parseInkStrokes([{ page: 0, colour: 'red', points: [0, 0] }]), [],
  'A single point is not a stroke')
assert.deepEqual(ink.parseInkStrokes([{ page: 1, colour: 'red', points: [-4, 0.5, 9, 2] }]),
  [{ page: 1, colour: 'red', points: [0, 0.5, 1, 1] }],
  'Points are clamped into the page rather than dropped')
assert.equal(ink.parseInkStrokes([{ page: 0, colour: 'black', points: [0, 0, 1, 1, 0.5] }]).length, 0,
  'An odd number of coordinates is not a stroke')
assert.deepEqual(
  ink.parseInkStrokes([{ page: 0, colour: 'red', points: [0, 0, 1, 1], width: 'fine' }]),
  [{ page: 0, colour: 'red', points: [0, 0, 1, 1], width: 'fine' }],
  'A chosen nib is kept')
assert.equal(
  ink.parseInkStrokes([{ page: 0, colour: 'red', points: [0, 0, 1, 1], width: 'huge' }])[0].width,
  undefined,
  'An unknown nib is dropped rather than invented')
assert.ok(ink.inkStrokeWidthPx('fine') < ink.inkStrokeWidthPx('bold'), 'Fine is thinner than bold')

/* ---- Thrown away: points that do not change the line -------------------- */
{
  const dense = []
  for (let i = 0; i < 400; i++) dense.push(0.2 + i * 0.000001, 0.3 + i * 0.000001)
  const thin = ink.simplifyStroke(dense)
  assert.ok(thin.length < dense.length / 10, 'A finger-speed stroke is thinned out')
  assert.deepEqual(thin.slice(0, 2), dense.slice(0, 2), 'The stroke still starts where it started')
  assert.deepEqual(thin.slice(-2), dense.slice(-2), 'and still ends where it ended')

  const deliberate = [0, 0, 0.5, 0.5, 1, 1]
  assert.deepEqual(ink.simplifyStroke(deliberate), deliberate, 'A real line is left alone')
  assert.deepEqual(ink.simplifyStroke([0, 0, 1, 1]), [0, 0, 1, 1], 'Two points cannot be thinned')
}

/* Long gestures keep their entire curve, including legacy persisted marks. */
{
  const previousStorage = globalThis.localStorage
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  }
  try {
    const circle = []
    for (let index = 0; index < 650; index++) {
      const angle = index * 2 * Math.PI / 649
      circle.push(0.5 + 0.3 * Math.cos(angle), 0.5 + 0.3 * Math.sin(angle))
    }
    const curved = ink.simplifyStroke(circle)
    assert.ok(curved.length > 800, 'The real gesture simplifier can produce more than 400 points')
    const written = []
    for (let index = 0; index < 2200; index++) written.push(index / 2199, 0.5 + 0.25 * Math.sin(index * 0.2))
    for (const points of [curved, written]) {
      const stroke = { page: 0, colour: 'red', width: 'fine', points }
      assert.equal(ink.saveInkStrokes('qa-long-ink', [stroke]), true)
      const loaded = ink.loadInkStrokes('qa-long-ink')[0]
      const rounded = points.map(value => Math.round(value * 1e4) / 1e4)
      assert.deepEqual(loaded.points, rounded, 'Every saved point returns, preserving the full gesture shape')
      assert.deepEqual(loaded.points.slice(0, 2), rounded.slice(0, 2))
      assert.deepEqual(loaded.points.slice(-2), rounded.slice(-2), 'The original endpoint survives reopening')
      assert.equal(loaded.width, 'fine')
    }
    const oldMark = { page: 0, colour: 'black', points: curved }
    store.set('besttake:practice-chart-ink:v1:qa-legacy-long', JSON.stringify([oldMark]))
    assert.deepEqual(ink.loadInkStrokes('qa-legacy-long'), [oldMark], 'Already saved long marks recover their old tail without migration')
    const lastArc = curved.slice(1140, 1142)
    assert.deepEqual(ink.eraseStrokesAt([oldMark], 0, lastArc[0], lastArc[1], 0.001, 0.001), [], 'Erasing the previously truncated tail removes the whole gesture')
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
}

/* ---- What comes out of Save PDF ---------------------------------------- */

async function fixturePdf(pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([612, 792])
  return doc.save()
}

const strokes = [
  { page: 0, colour: 'red', points: [0.1, 0.1, 0.5, 0.5, 0.9, 0.2], width: 'fine' },
  { page: 2, colour: 'black', points: [0.2, 0.8, 0.8, 0.8] },
]

{
  const source = await fixturePdf(3)
  const before = [...source]
  const chart = { mimeType: 'application/pdf', bytes: source, fileName: 'Etude.pdf', objectUrl: '' }
  const marked = await exporter.buildMarkedPdf(chart, strokes)

  const out = await PDFDocument.load(marked)
  assert.equal(out.getPageCount(), 3, 'The marked copy keeps every page of the part')
  assert.ok(marked.length > source.length, 'The marks are actually written into it')
  const size = out.getPage(0).getSize()
  assert.ok(Math.abs(size.width - 612) < 0.01 && Math.abs(size.height - 792) < 0.01,
    'Pages keep their own size, so the copy prints like the original')

  // The source bytes must survive being handed to pdf-lib: saving twice in a
  // row re-reads the same cached array, and a detached buffer would throw.
  const again = await exporter.buildMarkedPdf(chart, strokes)
  assert.ok(again.length > 0, 'Saving twice works — the cached bytes are not detached')
  assert.deepEqual([...source], before, 'The part in memory is never written to')
}

/* A mark for a page that is not there must not lose the rest of them. */
{
  const source = await fixturePdf(1)
  const chart = { mimeType: 'application/pdf', bytes: source, fileName: 'One.pdf', objectUrl: '' }
  const marked = await exporter.buildMarkedPdf(chart, [
    { page: 9, colour: 'red', points: [0.1, 0.1, 0.2, 0.2] },
    { page: 0, colour: 'black', points: [0.3, 0.3, 0.7, 0.7] },
  ])
  const out = await PDFDocument.load(marked)
  assert.equal(out.getPageCount(), 1, 'An orphan mark is skipped, not fatal')
}

/* A part with no marks still saves — a player may just want a copy. */
{
  const source = await fixturePdf(2)
  const chart = { mimeType: 'application/pdf', bytes: source, fileName: 'Clean.pdf', objectUrl: '' }
  const out = await PDFDocument.load(await exporter.buildMarkedPdf(chart, []))
  assert.equal(out.getPageCount(), 2)
}

/* ---- The eraser --------------------------------------------------------- */

{
  // A letter page: wider than it is tall in normalised terms it is not, but the
  // box is 612x792, so an eraser that is round on screen is an ellipse here.
  const across = { page: 0, colour: 'black', points: [0.2, 0.5, 0.8, 0.5] }
  const elsewhere = { page: 0, colour: 'red', points: [0.2, 0.1, 0.8, 0.1] }
  const otherPage = { page: 1, colour: 'red', points: [0.2, 0.5, 0.8, 0.5] }
  const all = [across, elsewhere, otherPage]

  assert.ok(ink.strokeHitsEraser(across, 0.5, 0.5, 0.03, 0.023),
    'The eraser takes a line it is sitting on')
  assert.ok(ink.strokeHitsEraser(across, 0.2, 0.5, 0.03, 0.023),
    'It takes a line at its very start, not only in the middle')
  assert.ok(!ink.strokeHitsEraser(across, 0.5, 0.9, 0.03, 0.023),
    'It leaves a line it is nowhere near')
  assert.ok(!ink.strokeHitsEraser(across, 0.05, 0.5, 0.03, 0.023),
    'Past the end of a line is past it, not on it')

  // Only what it touches, and only on the page it is touching.
  assert.deepEqual(ink.eraseStrokesAt(all, 0, 0.5, 0.5, 0.03, 0.023), [elsewhere, otherPage],
    'One mark goes; the other mark and the other page stay')
  assert.equal(ink.eraseStrokesAt(all, 0, 0.5, 0.75, 0.03, 0.023), null,
    'A drag across blank paper reports nothing, so nothing is rewritten')
  assert.equal(ink.eraseStrokesAt(all, 2, 0.5, 0.5, 0.03, 0.023), null,
    'A page with no marks on it cannot lose any')

  // A whole gesture at a time: rubbing one end of a circled accidental must not
  // leave the other half of the circle behind.
  const circle = { page: 0, colour: 'red', points: [0.4, 0.4, 0.6, 0.4, 0.6, 0.6, 0.4, 0.6, 0.4, 0.4] }
  assert.deepEqual(ink.eraseStrokesAt([circle], 0, 0.4, 0.4, 0.02, 0.015), [],
    'Touching one corner of a mark takes the whole mark')

  // A dot has no segment to measure against.
  const dot = { page: 0, colour: 'black', points: [0.5, 0.5] }
  assert.ok(ink.strokeHitsEraser(dot, 0.5, 0.5, 0.02, 0.015), 'A dot can be rubbed out')
  assert.ok(!ink.strokeHitsEraser(dot, 0.7, 0.5, 0.02, 0.015), 'A distant dot is left alone')

  // The radius is per axis precisely so the eraser is round on screen. On a
  // 612x792 page the same 17px reaches further across than down in page units,
  // and a point that is inside the circle on screen must be inside here too.
  const tall = { page: 0, colour: 'black', points: [0.5, 0.54, 0.5, 0.56] }
  assert.ok(!ink.strokeHitsEraser(tall, 0.5, 0.5, 0.0278, 0.0215),
    'A mark below the eraser, outside its shorter vertical reach, survives')
  const wide = { page: 0, colour: 'black', points: [0.525, 0.5, 0.53, 0.5] }
  assert.ok(ink.strokeHitsEraser(wide, 0.5, 0.5, 0.0278, 0.0215),
    'The same distance sideways is inside its longer horizontal reach')
}

/* What is left after erasing is what gets written into the PDF. */
{
  const source = await fixturePdf(1)
  const chart = { mimeType: 'application/pdf', bytes: source, fileName: 'Erased.pdf', objectUrl: '' }
  const kept = ink.eraseStrokesAt([
    { page: 0, colour: 'red', points: [0.2, 0.5, 0.8, 0.5] },
    { page: 0, colour: 'black', points: [0.2, 0.1, 0.8, 0.1] },
  ], 0, 0.5, 0.5, 0.03, 0.023)
  assert.equal(kept.length, 1, 'One of the two marks was rubbed out')
  const erased = pageDrawingOps(await exporter.buildMarkedPdf(chart, kept))
  assert.ok(erased.includes('0.1 0.1 0.12'), 'The mark that was kept is drawn in the saved PDF')
  assert.ok(!erased.includes('0.84 0.13 0.13'),
    'The rubbed-out red mark is not drawn in the saved PDF')

  // The same check the other way around, so the assertion above is known to be
  // capable of failing.
  const untouched = pageDrawingOps(await exporter.buildMarkedPdf(chart, [
    { page: 0, colour: 'red', points: [0.2, 0.5, 0.8, 0.5] },
    { page: 0, colour: 'black', points: [0.2, 0.1, 0.8, 0.1] },
  ]))
  assert.ok(untouched.includes('0.84 0.13 0.13'),
    'Without the eraser, the red mark is there — so its absence above means something')
}

console.log('Practice chart ink: parsing, thinning, erasing, and a marked PDF that keeps its pages passed.')
