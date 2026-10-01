#!/usr/bin/env node
/**
 * Focused Pitch Insights reset regression using the real tracker, analytics,
 * transposition, and repository modules. SQL is backed by an in-memory mock;
 * UI, native audio, and durable SQLite/IndexedDB persistence are not tested.
 * Run from the repository root with:
 *   node scripts/practice-qa/audits/pitch-insights-2026-10-01.mjs
 */
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const resultDir = resolve(root, 'scripts/practice-qa/results/pitch-games-2026-10-01')
const buildDir = await mkdtemp(join(tmpdir(), 'pitch-insights-audit-'))
const rows = []
const sqlLog = []
const checks = []
let blockNextInsert = false
let releaseInsert = null
let insertStartedResolve = null

class DetailEvent extends Event {
  constructor(type, init = {}) { super(type); this.detail = init.detail }
}
globalThis.CustomEvent = DetailEvent
globalThis.window = new EventTarget()
globalThis.__pitchInsightsAuditDb = {
  async run(sql, values = []) {
    sqlLog.push({ sql, values: [...values] })
    if (sql.startsWith('INSERT INTO pitch_observations')) {
      if (blockNextInsert) {
        blockNextInsert = false
        insertStartedResolve?.()
        await new Promise((resolveInsert) => { releaseInsert = resolveInsert })
      }
      const [id, midi_note, note_name, octave, cents_offset, observed_at, duration_ms,
        sample_count, variability_cents, tuner_instrument, transposition_id, session_id] = values
      rows.push({ id, midi_note, note_name, octave, cents_offset, observed_at, duration_ms,
        sample_count, variability_cents, tuner_instrument, transposition_id, session_id })
      return
    }
    if (sql === 'DELETE FROM pitch_observations') {
      rows.splice(0)
      return
    }
    if (sql.includes('session_id = ? AND observed_at >= ?')) {
      const [sessionId, startAt, endAt] = values
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i]
        if (row.session_id === sessionId && row.observed_at >= startAt && row.observed_at < endAt) rows.splice(i, 1)
      }
      return
    }
    if (sql.includes('observed_at >= ? AND observed_at < ?')) {
      const [startAt, endAt] = values
      const transpositionId = sql.includes('AND transposition_id = ?') ? values[2] : null
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i]
        if (row.observed_at >= startAt && row.observed_at < endAt &&
            (transpositionId == null || row.transposition_id === transpositionId)) rows.splice(i, 1)
      }
      return
    }
    throw new Error(`Unexpected mock SQL: ${sql}`)
  },
  async query(sql, values = []) {
    let result = [...rows]
    if (sql.includes('WHERE transposition_id = ?')) result = result.filter((row) => row.transposition_id === values[0])
    result.sort((left, right) => right.observed_at - left.observed_at)
    const limit = sql.match(/LIMIT \?$/) ? Number(values.at(-1)) : null
    if (limit != null) result = result.slice(0, limit)
    return { values: result }
  },
}
globalThis.__pitchInsightsPersistCalls = 0

const realDateNow = Date.now
function setClock(timestamp) { Date.now = () => timestamp }
function restoreClock() { Date.now = realDateNow }
function record(id, expected, actual, evidence = '') {
  const pass = assert.deepEqual(actual, expected) === undefined
  checks.push({ id, expected, actual, pass, evidence })
}
function trackerContext(transpositionId, sessionId = `session-${transpositionId}`) {
  return { tunerInstrument: 'winds', transpositionId, sessionId }
}
function frame(timestamp, midiNote = 69, centsOffset = 2) {
  return { midiNote, noteName: 'A4', centsOffset, frequencyHz: 440, confidence: 0.95, timestamp }
}
function feedStable(tracker, context, startAt, midiNote = 69) {
  for (let index = 0; index <= 1200; index += 60) tracker.ingest(frame(startAt + index, midiNote), context)
}
function wireResetEvent(tracker, repository) {
  const listener = (event) => tracker.reset(event.detail)
  window.addEventListener(repository.PITCH_INSIGHTS_RESET_EVENT, listener)
  return () => window.removeEventListener(repository.PITCH_INSIGHTS_RESET_EVENT, listener)
}
function observation({ id, observedAt, transpositionId = 'concert', midiNote = 69 }) {
  return {
    id, midiNote, noteName: 'A4', octave: 4, centsOffset: 2, observedAt,
    durationMs: 900, sampleCount: 12, variabilityCents: 1,
    tunerInstrument: 'winds', transpositionId, sessionId: `saved-${transpositionId}`,
  }
}

try {
  await build({
    entryPoints: [
      'src/utils/pitchInsightsCapture.ts',
      'src/utils/stableNoteTracker.ts',
      'src/utils/pitchInsightsAnalytics.ts',
      'src/utils/tunerTransposition.ts',
      'src/utils/pitchUtils.ts',
      'src/db/pitchInsightsRepository.ts',
    ],
    outdir: buildDir,
    outbase: 'src',
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [{
      name: 'pitch-insights-memory-db',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^\.\/connection$/ }, () => ({ path: 'connection', namespace: 'audit-db' }))
        pluginBuild.onLoad({ filter: /.*/, namespace: 'audit-db' }, () => ({
          contents: 'export const initVaultDatabase = async () => globalThis.__pitchInsightsAuditDb; export const persistVaultWebStore = async () => { globalThis.__pitchInsightsPersistCalls += 1 }',
        }))
      },
    }],
  })

  const capture = await import(pathToFileURL(join(buildDir, 'utils/pitchInsightsCapture.mjs')))
  const { StableNoteTracker } = await import(pathToFileURL(join(buildDir, 'utils/stableNoteTracker.mjs')))
  const analytics = await import(pathToFileURL(join(buildDir, 'utils/pitchInsightsAnalytics.mjs')))
  const transposition = await import(pathToFileURL(join(buildDir, 'utils/tunerTransposition.mjs')))
  const pitchUtils = await import(pathToFileURL(join(buildDir, 'utils/pitchUtils.mjs')))
  const repository = await import(pathToFileURL(join(buildDir, 'db/pitchInsightsRepository.mjs')))

  // Existing capture/preferences and tracker behaviors remain covered.
  const memory = new Map()
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  }
  record('capture-default-enabled', true, capture.loadPitchInsightsCaptureEnabled())
  memory.set('besttake:pitch-insights-ensemble-mode', 'true')
  record('legacy-opt-out-migrates', false, capture.loadPitchInsightsCaptureEnabled())
  capture.savePitchInsightsCaptureEnabled(true)
  record('explicit-capture-on-persists', true, capture.loadPitchInsightsCaptureEnabled())
  capture.savePitchInsightsCaptureEnabled(false)
  record('explicit-capture-off-persists', false, capture.loadPitchInsightsCaptureEnabled())

  const context = trackerContext('bb')
  const longToneSaves = []
  const longTone = new StableNoteTracker((item) => longToneSaves.push(item))
  feedStable(longTone, context, 100_000)
  longTone.finish()
  record('long-tone-saves-one-observation', 1, longToneSaves.length)
  for (let at = 200_000; at <= 200_120; at += 60) longTone.ingest(frame(at), context)
  longTone.discard()
  longTone.finish()
  record('capture-off-discard-drops-partial-tone', 1, longToneSaves.length)

  const contextSaves = []
  const contextTracker = new StableNoteTracker((item) => contextSaves.push(item))
  feedStable(contextTracker, trackerContext('bb'), 300_000)
  contextTracker.ingest(frame(301_260), trackerContext('concert'))
  record('transposition-change-keeps-old-context', 'bb', contextSaves.at(-1)?.transpositionId)
  feedStable(contextTracker, trackerContext('concert'), 400_000)
  contextTracker.ingest(frame(401_260), { ...trackerContext('concert'), tunerInstrument: 'voice' })
  record('instrument-change-keeps-old-context', 'winds', contextSaves.at(-1)?.tunerInstrument)

  // The repository event is synchronous. The live tuner listener is verified
  // by source contract; dispatch the same exported event into real trackers.
  const liveTunerSource = await readFile(resolve(root, 'src/components/LivePitchTuner.tsx'), 'utf8')
  assert.match(liveTunerSource, /addEventListener\(PITCH_INSIGHTS_RESET_EVENT, handleReset\)/)
  assert.match(liveTunerSource, /stableNoteTrackerRef\.current\?\.reset\(detail\)/)
  assert.match(liveTunerSource, /tracker\.ingest\(null, insightsContextRef\.current\)/,
    'silence must release the same-note fence before the musician starts another held note')
  checks.push({ id: 'live-tuner-subscribes-to-reset-event', expected: true, actual: true, pass: true,
    evidence: 'Source contract confirms the tuner connects the repository reset event to StableNoteTracker.reset.' })

  // Reset All: discard an unfinished candidate, reject delayed pre-reset
  // frames, block continuation of that held note, then accept one fresh note
  // after silence. This uses the actual repository event and tracker reset.
  rows.splice(0)
  const now = 1_800_000_000_000
  setClock(now)
  const resetContext = trackerContext('concert', 'reset-all-session')
  const resetTracker = new StableNoteTracker((item) => repository.savePitchObservation(item))
  const unlistenAll = wireResetEvent(resetTracker, repository)
  feedStable(resetTracker, resetContext, now - 1600)
  let resetIntent = null
  window.addEventListener(repository.PITCH_INSIGHTS_RESET_EVENT, (event) => { resetIntent = event.detail }, { once: true })
  await repository.clearPitchObservations()
  assert.equal(resetIntent.kind, 'all')
  record('reset-all-intent-has-request-time', true, Number.isFinite(resetIntent.requestedAt))
  resetTracker.ingest(frame(resetIntent.requestedAt, 69), resetContext)
  resetTracker.ingest(frame(resetIntent.requestedAt + 60, 69), resetContext)
  resetTracker.finish()
  record('reset-all-discards-old-candidate-and-held-continuation', 0, (await repository.listPitchObservations()).length)
  resetTracker.ingest(null, resetContext)
  feedStable(resetTracker, resetContext, resetIntent.requestedAt + 100)
  resetTracker.finish()
  await new Promise((resolveTurn) => setTimeout(resolveTurn, 0))
  const afterFreshTone = await repository.listPitchObservations()
  record('fresh-same-note-after-silence-saves-once', 1, afterFreshTone.length)
  record('fresh-tone-timestamp-is-after-reset', true, afterFreshTone[0].observedAt > resetIntent.requestedAt)
  unlistenAll()

  // Queue an already-finished stable observation behind a controllable SQL
  // gate, request a scoped reset, then create a new note. FIFO must persist the
  // old insert before DELETE and the new insert after DELETE.
  rows.splice(0)
  sqlLog.splice(0)
  const queueNow = 1_800_000_100_000
  setClock(queueNow)
  const queuedTracker = new StableNoteTracker((item) => repository.savePitchObservation(item))
  const unlistenQueued = wireResetEvent(queuedTracker, repository)
  feedStable(queuedTracker, trackerContext('bb', 'queued-session'), queueNow - 1600)
  let insertStarted
  const didStartInsert = new Promise((resolveInsert) => { insertStarted = resolveInsert })
  blockNextInsert = true
  queuedTracker.finish()
  insertStartedResolve = insertStarted
  await didStartInsert
  const queuedReset = repository.deletePitchObservationsInRange(queueNow - 2000, queueNow + 1, 'bb')
  // The old note was already enqueued before the reset; a fresh tone now
  // queues behind the deletion and must be the only surviving row.
  feedStable(queuedTracker, trackerContext('bb', 'queued-session'), queueNow + 100)
  queuedTracker.finish()
  releaseInsert?.()
  await queuedReset
  const rowsAfterQueuedReset = await repository.listPitchObservations()
  record('prequeued-save-settles-before-scoped-delete', 1, rowsAfterQueuedReset.length)
  record('queued-reset-keeps-only-new-tone', true, rowsAfterQueuedReset.length === 1 && rowsAfterQueuedReset[0].observedAt > queueNow)
  const queueKinds = sqlLog.map((entry) => entry.sql.startsWith('INSERT') ? 'insert' : entry.sql.startsWith('DELETE') ? 'delete' : 'other')
  record('pre-reset-delete-post-reset-write-order', ['insert', 'delete', 'insert'], queueKinds)
  unlistenQueued()
  insertStartedResolve = null

  // Repeat with the reset event observed synchronously, verify candidate
  // selection, and ensure the unaffected candidate plus same-day rows survive.
  rows.splice(0)
  sqlLog.splice(0)
  const sampleDay = new Date(2026, 8, 30, 12).getTime()
  const day = analytics.localPracticeDayBounds(sampleDay)
  const resetAt = day.startAt + 10_000
  setClock(resetAt)
  for (const item of [
    observation({ id: 'concert-before', observedAt: day.startAt - 1, transpositionId: 'concert' }),
    observation({ id: 'concert-at-start', observedAt: day.startAt, transpositionId: 'concert' }),
    observation({ id: 'concert-before-end', observedAt: day.endAt - 1, transpositionId: 'concert' }),
    observation({ id: 'concert-at-end', observedAt: day.endAt, transpositionId: 'concert' }),
    observation({ id: 'bb-at-start', observedAt: day.startAt, transpositionId: 'bb' }),
    observation({ id: 'bb-before-end', observedAt: day.endAt - 1, transpositionId: 'bb' }),
  ]) await repository.savePitchObservation(item)
  const filteredDays = analytics.summarizePitchPracticeDays(await repository.listPitchObservations({ transpositionId: 'concert' }))
  const selectedTargetDay = filteredDays.find((candidate) => candidate.key === day.key)
  assert.ok(selectedTargetDay)

  const targetContext = trackerContext('concert', 'target-active')
  const otherContext = trackerContext('bb', 'other-active')
  const targetSaved = []
  const otherSaved = []
  const targetTracker = new StableNoteTracker((item) => targetSaved.push(item))
  const otherTracker = new StableNoteTracker((item) => {
    otherSaved.push(item)
    void repository.savePitchObservation(item)
  })
  const stopTarget = wireResetEvent(targetTracker, repository)
  const stopOther = wireResetEvent(otherTracker, repository)
  feedStable(targetTracker, targetContext, day.startAt + 1000)
  feedStable(otherTracker, otherContext, day.startAt + 1000)
  let observedScopedIntent = null
  const scopeListener = (event) => { observedScopedIntent = event.detail }
  window.addEventListener(repository.PITCH_INSIGHTS_RESET_EVENT, scopeListener, { once: true })
  await repository.deletePitchObservationsInRange(selectedTargetDay.startAt, selectedTargetDay.endAt, 'concert')
  record('scoped-reset-intent-carries-transposition', 'concert', observedScopedIntent.transpositionId)
  record('scoped-reset-intent-has-request-time', true, Number.isFinite(observedScopedIntent.requestedAt))
  targetTracker.ingest(frame(observedScopedIntent.requestedAt + 1), targetContext)
  targetTracker.finish()
  otherTracker.ingest(frame(observedScopedIntent.requestedAt + 1), otherContext)
  otherTracker.finish()
  await new Promise((resolveTurn) => setTimeout(resolveTurn, 0))
  const afterScopedReset = await repository.listPitchObservations()
  const remainingIds = afterScopedReset.filter((item) => item.sessionId !== 'other-active').map((item) => item.id).sort()
  record('reset-range-is-start-inclusive-end-exclusive-and-filtered',
    ['bb-at-start', 'bb-before-end', 'concert-at-end', 'concert-before'].sort(), remainingIds)
  record('target-inflight-candidate-discarded', 0, targetSaved.length)
  record('other-group-inflight-candidate-survives-once', 1, otherSaved.length)
  record('other-group-new-observation-persists-once', 1, afterScopedReset.filter((item) => item.sessionId === 'other-active').length)
  window.removeEventListener(repository.PITCH_INSIGHTS_RESET_EVENT, scopeListener)
  stopTarget()
  stopOther()

  // Exercise the written-name conversion passed to the note detail: concert
  // MIDI remains the stored pitch, while the active profile changes its label.
  const writtenLabels = Object.fromEntries(['concert', 'bb', 'eb', 'c_octave_down'].map((id) => {
    const offset = transposition.getTunerTransposition(id).writtenOffsetSemitones
    return [id, pitchUtils.midiToNoteName(69 + offset)]
  }))
  record('selected-written-pitch-labels', {
    concert: 'A4', bb: 'B4', eb: 'F#5', c_octave_down: 'A5',
  }, writtenLabels)
  const liveScreenSource = await readFile(resolve(root, 'src/components/LivePitchTuner.tsx'), 'utf8')
  const insightsScreenSource = await readFile(resolve(root, 'src/components/audioPractice/PitchInsightsScreen.tsx'), 'utf8')
  assert.match(insightsScreenSource, /midiToNoteName\(midiNote \+ displayProfile\.writtenOffsetSemitones\)/)
  assert.match(insightsScreenSource, /getTunerTransposition\(selectedSource === 'all' \? 'concert' : selectedSource as TunerTranspositionId\)/)
  checks.push({ id: 'screen-formats-selected-note-with-active-written-profile', expected: true, actual: true, pass: true,
    evidence: 'Source contract confirms the selected note label uses the active transposition offset.' })

  // The screen has no exported visibility helper, so bind these lightweight
  // predicate cases to the exact source expression and exercise its truth
  // table. This covers the regression without mounting the full React sheet.
  assert.match(insightsScreenSource,
    /instrumentIds\.length > 1 \|\| addedInstruments\.length > 0 \|\|\s*instrumentIds\.some\(\(id\) => id !== selectedSource \|\| id !== transpositionId\)/)
  const filterVisibility = (instrumentIds, addedInstruments, selectedSource, transpositionId) =>
    instrumentIds.length > 1 || addedInstruments.length > 0 ||
    instrumentIds.some((id) => id !== selectedSource || id !== transpositionId)
  const filterCases = [
    { id: 'other-only-history-shows-filter-on-active-concert', inputs: [['bb'], [], 'concert', 'concert'], expected: true },
    { id: 'all-filter-remains-available-for-other-only-history', inputs: [['bb'], [], 'all', 'concert'], expected: true },
    { id: 'matching-single-group-keeps-compact-default', inputs: [['bb'], [], 'bb', 'bb'], expected: false },
    { id: 'empty-history-has-no-filter', inputs: [[], [], 'concert', 'concert'], expected: false },
    { id: 'added-historyless-group-keeps-picker-visible', inputs: [[], ['bb'], 'concert', 'concert'], expected: true },
  ]
  for (const filterCase of filterCases) {
    record(filterCase.id, filterCase.expected, filterVisibility(...filterCase.inputs))
  }
  assert.match(insightsScreenSource, /setSelectedSource\('all'\)/)
  checks.push({ id: 'all-pill-selects-all-visible-history', expected: true, actual: true, pass: true,
    evidence: 'Source contract confirms the All pill changes the source filter to all.' })

  // Product decisions outside the requested reset repair remain evidence for
  // review, not gating regressions.
  const detector = new capture.PitchActivityDetector()
  let fifthsPrompt = null
  ;[60, 67, 60, 67, 60, 67, 60].forEach((note, index) => {
    fifthsPrompt ||= detector.observe(note, 1_900_000_000_000 + index * 300)
  })
  const liveSaveCallback = liveTunerSource.slice(
    liveTunerSource.indexOf('new StableNoteTracker((observation) =>'),
    liveTunerSource.indexOf('// A sustained in-app drone'),
  )
  const policyReview = {
    repeatedFifthsPrompt: fifthsPrompt,
    captureCallbackHasPlusGate: liveSaveCallback.includes('plus.active') || liveSaveCallback.includes('insightsEnabled'),
    note: 'Prompt behavior and capture access are policy/product review items; they do not fail this reset regression.',
  }

  const failures = checks.filter((check) => !check.pass)
  const result = {
    audit: 'pitch-insights-2026-10-01',
    generatedAt: new Date().toISOString(),
    execution: {
      runner: 'Node.js + esbuild',
      modules: ['pitchInsightsCapture', 'stableNoteTracker', 'pitchInsightsAnalytics', 'tunerTransposition', 'pitchUtils', 'pitchInsightsRepository'],
      database: 'in-memory SQL mock with controllable INSERT delay; repository FIFO and SQL predicates exercised',
      persistCalls: globalThis.__pitchInsightsPersistCalls,
    },
    limitations: [
      'No React/UI, microphone, native audio, SQLite/IndexedDB durability, or device restart was exercised.',
      'The tuner subscription and selected-note label wiring are source-contract checks; the underlying event, tracker, repo, and label conversion use real modules.',
    ],
    checks,
    policyReview,
    failures: failures.map(({ id, expected, actual, evidence }) => ({ id, expected, actual, evidence })),
    exitCode: failures.length ? 1 : 0,
  }
  await mkdir(resultDir, { recursive: true })
  await writeFile(join(resultDir, 'pitch-evidence.json'), `${JSON.stringify(result, null, 2)}\n`)
  const lines = [
    `Pitch Insights audit: ${result.audit}`,
    `Generated: ${result.generatedAt}`,
    `DB: ${result.execution.database}`,
    ...checks.map((check) => `${check.pass ? 'PASS' : 'FAIL'} ${check.id}: expected ${JSON.stringify(check.expected)}; actual ${JSON.stringify(check.actual)}${check.evidence ? ` — ${check.evidence}` : ''}`),
    `POLICY REVIEW repeated-fifths prompt: ${JSON.stringify(policyReview.repeatedFifthsPrompt)}`,
    `POLICY REVIEW capture Plus gate: ${policyReview.captureCallbackHasPlusGate}`,
    `Failures: ${failures.length}; exit status ${result.exitCode}.`,
    'UI/native/durable restart behavior remains unverified.',
  ]
  await writeFile(join(resultDir, 'pitch-evidence.log'), `${lines.join('\n')}\n`)
  console.log(lines.join('\n'))
  if (failures.length) process.exitCode = 1
} catch (error) {
  restoreClock()
  throw error
} finally {
  restoreClock()
  await rm(buildDir, { recursive: true, force: true })
}
