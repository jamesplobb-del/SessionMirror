// Generate a real importable BestTake project through the app's file encoder.
// Run: node scripts/practice-qa/make-multitrack-fixture.mjs
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const mediaDir = join(here, 'results', 'media')
const outputPath = join(mediaDir, 'qa-pulses-two-part.btmulti')
const inputs = [
  { name: '440 Hz pulses', path: join(mediaDir, 'qa-pulses-440hz.wav') },
  { name: '660 Hz pulses', path: join(mediaDir, 'qa-pulses-660hz.wav') },
]

function wavDuration(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', 'Expected RIFF WAV')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', 'Expected WAVE audio')
  const byteRate = bytes.readUInt32LE(28)
  assert.ok(byteRate > 0, 'WAV byte rate must be positive')
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(offset + 4)
    if (bytes.toString('ascii', offset, offset + 4) === 'data') return size / byteRate
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV data chunk missing')
}

const temp = await mkdtemp(join(tmpdir(), 'besttake-qa-multitrack-'))
const urls = []
let opened
try {
  await build({
    entryPoints: ['src/multitrack/state/multitrackFile.ts'],
    bundle: true, format: 'esm', platform: 'node',
    define: { 'import.meta.env': '{}' },
    outfile: join(temp, 'multitrack-file.mjs'),
  })
  const { buildMultitrackFile, readMultitrackFile } = await import(pathToFileURL(join(temp, 'multitrack-file.mjs')))
  const originals = await Promise.all(inputs.map(async input => {
    const bytes = await readFile(input.path)
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    urls.push(url)
    return { ...input, bytes, url, duration: wavDuration(bytes) }
  }))
  const panels = originals.map((item, index) => ({
    kind: 'performance', id: index === 0 ? 'a' : 'b',
    label: item.name, volume: index === 0 ? 0.7 : 0.6,
    take: {
      id: `qa-pulses-${index}`, name: item.name,
      filePath: '', videoUrl: item.url, videoMimeType: 'audio/wav',
      mediaType: 'audio', thumbnailUrl: '', duration: item.duration,
      timestamp: Date.now(), rating: 0, notes: 'Synthetic QA audio',
    },
  }))
  const session = {
    projectId: 'qa-pulses-two-part', name: 'QA pulses two part',
    aspectRatio: '9:16', layoutId: 'two', panels,
    sheetMusic: { kind: 'sheet-music', id: 'music', asset: null, cues: [] },
    backing: { kind: 'none', volume: 0.85 },
    practice: { bpm: 120, meter: '4/4', clickSound: 'classic', countInBars: 0,
      clickEnabled: false, showMetronome: false, showPitch: false, practiceOverlayEnabled: true },
  }
  const encoded = await buildMultitrackFile(session)
  opened = await readMultitrackFile(encoded)
  assert.equal(opened.session.panels.length, 2)
  for (const [index, panel] of opened.session.panels.entries()) {
    assert.ok(panel.take, `Part ${index + 1} must have a take`)
    const actual = Buffer.from(await (await fetch(panel.take.videoUrl)).arrayBuffer())
    assert.deepEqual(actual, originals[index].bytes, `Part ${index + 1} audio must round trip exactly`)
  }
  await writeFile(outputPath, new Uint8Array(await encoded.arrayBuffer()))
  console.log(`Created ${outputPath} (${encoded.size} bytes; two audio parts, exact bytes verified)`)
} finally {
  opened?.dispose()
  urls.forEach(url => URL.revokeObjectURL(url))
  await rm(temp, { recursive: true, force: true })
}
