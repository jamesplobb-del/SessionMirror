import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'ensemble-pitch-'))
try {
  await build({
    entryPoints: ['src/utils/stableNoteTracker.ts', 'src/utils/ensemblePitchMode.ts'],
    outdir: directory,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  })
  const { StableNoteTracker } = await import(pathToFileURL(join(directory, 'stableNoteTracker.mjs')))
  const { loadEnsemblePitchMode, saveEnsemblePitchMode } = await import(pathToFileURL(join(directory, 'ensemblePitchMode.mjs')))
  const context = { tunerInstrument: 'violin', transpositionId: 'concert' }
  const observations = []
  const tracker = new StableNoteTracker((observation) => observations.push(observation))
  const feedHeldNote = (startAt, midiNote, noteName, centsOffset) => {
    for (let offset = 0; offset <= 1800; offset += 50) {
      tracker.ingest({
        midiNote,
        noteName,
        centsOffset,
        frequencyHz: 440,
        confidence: 0.95,
        timestamp: startAt + offset,
      }, context)
    }
  }

  feedHeldNote(0, 69, 'A4', 6)
  tracker.discard()
  tracker.finish()
  assert.equal(observations.length, 0, 'cancelled capture must not emit an observation')

  feedHeldNote(2000, 69, 'A4', 6)
  tracker.finish()
  assert.equal(observations.length, 1, 'a confirmed single note can be measured')
  assert.equal(observations[0].noteName, 'A4')
  assert.equal(observations[0].centsOffset, 6)

  const memory = new Map()
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value) },
  }
  assert.equal(loadEnsemblePitchMode(), false)
  saveEnsemblePitchMode(true)
  assert.equal(loadEnsemblePitchMode(), true)
  saveEnsemblePitchMode(false)
  assert.equal(loadEnsemblePitchMode(), false)
  console.log('PASS: ensemble capture cancellation, held-note measurement, and mode persistence')
} finally {
  await rm(directory, { recursive: true, force: true })
}
