// Rehearsal marks: what is stored, what is thrown away, and what comes out of
// "Save PDF". Run: node scripts/verify-practice-chart-ink.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { PDFDocument } from 'pdf-lib'

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

console.log('Practice chart ink: parsing, thinning, and a marked PDF that keeps its pages passed.')
