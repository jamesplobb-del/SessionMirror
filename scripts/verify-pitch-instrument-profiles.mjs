// Run: node scripts/verify-pitch-instrument-profiles.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import initSqlJs from 'sql.js'
import { join } from 'node:path'

const storage = new Map()
let failStorage = false
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { if (failStorage) throw new Error('Storage unavailable'); storage.set(key, value) },
  removeItem: key => storage.delete(key),
}
const bundle = await build({
  stdin: { contents: "export * from './src/utils/pitchInstrumentProfiles'; export * from './src/utils/stableNoteTracker'; export * from './src/db/pitchInsightsRepository'; export * from './src/db/schema'; export * from './src/db/migrations'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'real-sqlite-fixture', setup(b) {
    b.onResolve({ filter: /^\.\/connection$/ }, () => ({ path: 'connection', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const initVaultDatabase=async()=>globalThis.__pitchProfileDb; export const persistVaultWebStore=async()=>{}' }))
  } }],
})
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
const api = await import(moduleUrl)
globalThis.window = new EventTarget()
const cleanupEvents = []
window.addEventListener(api.PITCH_INSIGHTS_UPDATED_EVENT, event => cleanupEvents.push(event.detail))
const SQL = await initSqlJs({ locateFile: file => join(process.cwd(), 'node_modules/sql.js/dist', file) })
const database = new SQL.Database()
const db = {
  query: async (sql, params = []) => {
    const statement = database.prepare(sql)
    try { statement.bind(params); const values = []; while (statement.step()) values.push(statement.getAsObject()); return { values } }
    finally { statement.free() }
  },
  run: async (sql, params = []) => { database.run(sql, params) },
  execute: async sql => { database.run(sql) },
}
globalThis.__pitchProfileDb = db
try {
  database.run(api.CREATE_SCHEMA_SQL.replace(',\n  instrument_profile_id TEXT,\n  instrument_profile_name TEXT', ''))
  database.run("INSERT INTO pitch_observations(id,midi_note,note_name,octave,cents_offset,observed_at,duration_ms,sample_count) VALUES ('legacy',60,'C4',4,1,500,1000,20)")
  await api.migrateVaultSchema(db)
  await api.migrateVaultSchema(db)
  const legacy = await api.listPitchObservations({ instrumentProfileId: null, transpositionId: 'concert' })
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].id, 'legacy')
  assert.equal(legacy[0].instrumentProfileId, null, 'Migration never assigns an old observation to a named instrument')

  const trumpet = api.createPitchInstrumentProfile('C trumpet', 'concert')
  const flute = api.createPitchInstrumentProfile('Flute', 'concert')
  assert.notEqual(trumpet.id, flute.id, 'Same-key instruments have independent identities')
  api.selectPitchInstrumentProfile(trumpet.id)
  const reloaded = await import(`${moduleUrl}#reload`)
  assert.equal(reloaded.loadPitchInstrumentProfiles().activeId, trumpet.id, 'Selection survives a fresh module/reload')
  assert.equal(reloaded.loadPitchInstrumentProfiles().profiles.length, 2)
  const beforeFailure = new Map(storage)
  failStorage = true
  assert.throws(() => api.createPitchInstrumentProfile('Oboe', 'concert'), /Storage unavailable/)
  failStorage = false
  assert.deepEqual(storage, beforeFailure, 'Failed profile creation cannot replace existing profiles or selection')
  assert.throws(() => api.createPitchInstrumentProfile(' ', 'concert'), /name/)
  const keyChanges = []
  api.changePitchInstrumentKey('concert', key => keyChanges.push(key))
  assert.equal(api.loadPitchInstrumentProfiles().activeId, trumpet.id, 'Selecting an active instrument’s current key keeps its identity')
  assert.equal(keyChanges.length, 0, 'The same-key tap is a no-op')
  failStorage = true
  assert.throws(() => api.changePitchInstrumentKey('bb', key => keyChanges.push(key)), /Storage unavailable/)
  assert.equal(api.loadPitchInstrumentProfiles().activeId, trumpet.id, 'A failed profile deselection retains the prior selection')
  assert.equal(keyChanges.length, 0, 'A failed profile deselection cannot change the tuner key')
  failStorage = false
  api.changePitchInstrumentKey('bb', key => keyChanges.push(key))
  assert.equal(api.loadPitchInstrumentProfiles().activeId, null, 'A different key explicitly returns capture to legacy/default')
  failStorage = true
  api.changePitchInstrumentKey('concert', key => keyChanges.push(key))
  failStorage = false
  assert.deepEqual(keyChanges, ['bb', 'concert'], 'Legacy key changes do not rewrite profile preferences')
  api.changePitchInstrumentKey('concert', key => keyChanges.push(key), 'concert')
  assert.equal(keyChanges.length, 2, 'A legacy tap on the current default key avoids all preference writes')
  // The Insights default-profile button has already deselected the profile;
  // it must still persist its displayed key if underlying app settings differ.
  api.changePitchInstrumentKey('bb', key => keyChanges.push(key), 'concert')
  assert.equal(keyChanges.at(-1), 'bb', 'Explicit Legacy/default selection retains the chosen displayed key')
  api.selectPitchInstrumentProfile(trumpet.id)

  const captured = []
  const tracker = new api.StableNoteTracker(observation => captured.push(observation))
  const context = profile => ({ tunerInstrument: 'winds', transpositionId: profile.transpositionId, sessionId: 'same-session', instrumentProfileId: profile.id, instrumentProfileName: profile.name })
  const play = (profile, start) => {
    for (let index = 0; index < 40; index++) tracker.ingest({ midiNote: 60, noteName: 'C4', centsOffset: 2, frequencyHz: 261.6, confidence: 0.99, timestamp: start + index * 50 }, context(profile))
  }
  play(trumpet, 1000)
  play(flute, 3000)
  tracker.finish()
  assert.deepEqual(captured.map(row => [row.instrumentProfileId, row.instrumentProfileName]), [[trumpet.id, 'C trumpet'], [flute.id, 'Flute']], 'Switching same-key profiles flushes the previous candidate with its original name/identity')
  for (const observation of captured) await api.savePitchObservation(observation)
  await api.savePitchObservation({ ...captured[0], transpositionId: 'bb' })
  const trumpetRows = await api.listPitchObservations({ instrumentProfileId: trumpet.id, transpositionId: 'concert' })
  const fluteRows = await api.listPitchObservations({ instrumentProfileId: flute.id, transpositionId: 'concert' })
  assert.equal(trumpetRows.length, 1)
  assert.equal(fluteRows.length, 1)
  const rows = await api.listPitchObservations()
  assert.equal(api.filterPitchProfileObservations(rows, api.pitchSourceId(trumpet.id, 'concert')).length, 1, 'Displayed history filters by both identity and recorded key')
  assert.ok(api.pitchProfileSources([], rows, 'concert').some(source => source.label === 'C trumpet · C'), 'Stored observation names remain readable if preferences are unavailable')
  await api.deletePitchObservationsInRange(0, 10000, 'concert', trumpet.id)
  assert.equal((await api.listPitchObservations({ instrumentProfileId: trumpet.id, transpositionId: 'concert' })).length, 0)
  assert.equal((await api.listPitchObservations({ instrumentProfileId: flute.id, transpositionId: 'concert' })).length, 1, 'Resetting one profile cannot delete another instrument with the same key')
  assert.equal((await api.listPitchObservations({ instrumentProfileId: trumpet.id, transpositionId: 'bb' })).length, 1)
  assert.equal((await api.listPitchObservations({ instrumentProfileId: null })).length, 1, 'Named reset preserves legacy history')
  // All four identities overlap in the same mounted-tuner session and time window.
  for (const [profile, key] of [[trumpet, 'concert'], [flute, 'concert'], [trumpet, 'bb'], [null, 'concert']]) {
    await api.savePitchObservation({ ...captured[0], observedAt: 12000, transpositionId: key,
      instrumentProfileId: profile?.id ?? null, instrumentProfileName: profile?.name ?? null })
  }
  await api.deletePitchObservationsForSessionRange('same-session', 11000, 13000,
    { transpositionId: 'concert', instrumentProfileId: trumpet.id })
  const overlap = (await api.listPitchObservations()).filter(row => row.observedAt === 12000)
  assert.deepEqual(overlap.map(row => [row.instrumentProfileId, row.transpositionId]).sort(),
    [[flute.id, 'concert'], [trumpet.id, 'bb'], [null, 'concert']].sort(), 'Noisy cleanup preserves another same-key profile, another key, and Legacy/default')
  assert.deepEqual(cleanupEvents.at(-1), { kind: 'session-range-deleted', sessionId: 'same-session', startAt: 11000, endAt: 13000, transpositionId: 'concert', instrumentProfileId: trumpet.id })
  const reset = profile => ({ kind: 'session-range', sessionId: 'same-session', startAt: 0, endAt: 10000, requestedAt: 10000, transpositionId: 'concert', instrumentProfileId: profile.id })
  captured.length = 0
  play(flute, 1000)
  tracker.reset(reset(trumpet))
  tracker.finish()
  assert.equal(captured.length, 1, 'An origin-profile cleanup does not discard another profile’s active candidate')
  captured.length = 0
  play(trumpet, 1000)
  tracker.reset(reset(flute))
  tracker.finish()
  assert.equal(captured.length, 0, 'A second scoped fence does not replace the first profile’s delayed-frame fence')
  tracker.ingest(null, context(trumpet))
  play(trumpet, 11000)
  tracker.reset({ ...reset(trumpet), startAt: 10000, endAt: 15000, requestedAt: 15000 })
  tracker.finish()
  assert.equal(captured.length, 0, 'Matching origin-profile cleanup discards its unfinished candidate')
  await api.deletePitchObservationsForSessionRange('same-session', 11000, 13000)
  assert.equal((await api.listPitchObservations()).filter(row => row.observedAt === 12000).length, 0, 'Existing unscoped callers retain whole-session cleanup semantics')
  api.selectPitchInstrumentProfile(null)
  assert.equal(api.loadPitchInstrumentProfiles().activeId, null, 'Returning to direct-key/default capture retains named profiles')
  assert.equal(api.loadPitchInstrumentProfiles().profiles.length, 2)
  console.log('PASS: real SQLite migration, profile/key isolation, noisy origin scope and unscoped compatibility, candidate reset fences, capture boundary, profile reload and storage failure')
} finally { database.close(); delete globalThis.__pitchProfileDb }
