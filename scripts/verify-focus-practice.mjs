// Exercise production helpers and the search function with deterministic external boundaries.
// Run: node scripts/verify-focus-practice.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { handler } from '../netlify-youtube-proxy/functions/youtube-search.mjs'

async function load(entry, define = {}) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', define })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const refs = await load('src/utils/practiceReferences.ts', { 'import.meta.env.VITE_YOUTUBE_SEARCH_ENDPOINT': '"https://search.example.test/references"' })
const embed = await load('src/utils/youtubeEmbed.ts')
const desks = await load('src/utils/workspaceDesks.ts')
const reference = { videoId: 'abcdefghijk', title: 'First reference', channel: 'Orchestra' }
refs.savePracticeReference(reference, 'excerpt-a')
refs.savePracticeReference(reference, 'excerpt-b')
assert.equal(refs.loadReferenceLibrary().items.length, 1, 'One bookmark can serve multiple excerpts')
assert.deepEqual(refs.loadReferenceLibrary().items[0].projectIds, ['excerpt-a', 'excerpt-b'])
refs.selectPracticeReference('excerpt-a', 'https://youtu.be/abcdefghijk')
assert.equal(embed.parseYoutubeVideoId(refs.getSelectedReferenceUrl('excerpt-a')), 'abcdefghijk')
assert.equal(refs.getSelectedReferenceUrl('excerpt-b'), null, 'References cannot bleed between excerpts')
refs.removePracticeReference('abcdefghijk')
assert.equal(refs.loadReferenceLibrary().items.length, 0)
assert.ok(refs.getSelectedReferenceUrl('excerpt-a'), 'Removing a bookmark must not interrupt an active desk')
refs.selectPracticeReference('excerpt-a', null)
assert.equal(refs.getSelectedReferenceUrl('excerpt-a'), null)
storage.set('besttake:practice-references:v1', '{broken')
assert.deepEqual(refs.loadReferenceLibrary().items, [], 'Corrupt bookmarks must not prevent startup')
assert.equal(embed.parseYoutubeVideoId('https://notyoutube.com/watch?v=abcdefghijk'), null)
assert.equal(embed.parseYoutubeVideoId('https://m.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk')
assert.equal(embed.parseYoutubeVideoId('https://youtube.com.evil.test/watch?v=abcdefghijk'), null)
const snapshot = { mode: 'audio', pitchTrackerEnabled: true, showMetronome: true, showDrone: true,
  showTakeCards: true, autoSoundRecording: false, audioEnhancerEnabled: false,
  metronome: { bpm: 72, meter: '4/4', subdivision: 'off' }, drone: { pitchClass: null, octave: 4 }, soundSilenceSeconds: 2 }
desks.saveFocusDesk('excerpt-a', snapshot)
assert.deepEqual(desks.loadFocusDesk('excerpt-a'), snapshot, 'A silent drone must stay silent on restore')
assert.equal(desks.loadFocusDesk('excerpt-b'), null)
let savedDesks = desks.upsertWorkspaceDesk([], 'Excerpt', snapshot)
const deskId = savedDesks[0].id
savedDesks = desks.upsertWorkspaceDesk(savedDesks, ' excerpt ', { ...snapshot, metronome: { ...snapshot.metronome, bpm: 84 } })
assert.equal(savedDesks.length, 1, 'Updating a name must not create a duplicate desk')
assert.equal(savedDesks[0].id, deskId)
assert.equal(savedDesks[0].metronome.bpm, 84)
for (const name of ['Warmup', 'Lesson', 'Run-through']) savedDesks = desks.upsertWorkspaceDesk(savedDesks, name, snapshot)
assert.equal(savedDesks.length, 3, 'Desk capacity remains bounded')
localStorage.setItem = () => { throw new Error('QuotaExceededError') }
assert.throws(() => refs.savePracticeReference(reference), /QuotaExceededError/, 'The UI must be able to report a failed save')

const request = { httpMethod: 'GET', headers: { origin: 'capacitor://localhost', 'x-nf-client-connection-ip': 'test-ip' }, queryStringParameters: { q: 'Mahler trumpet' } }
delete process.env.YOUTUBE_DATA_API_KEY
assert.equal((await handler(request)).statusCode, 503)
process.env.YOUTUBE_DATA_API_KEY = 'test-only-key'
assert.equal((await handler({ ...request, httpMethod: 'POST' })).statusCode, 405)
assert.equal((await handler({ ...request, queryStringParameters: { q: 'a' } })).statusCode, 400)
assert.equal((await handler({ ...request, headers: { origin: 'https://untrusted.example' } })).statusCode, 403)
let calls = 0
globalThis.fetch = async url => {
  calls++
  const params = new URL(url).searchParams
  assert.equal(params.get('videoEmbeddable'), 'true')
  assert.equal(params.get('videoSyndicated'), 'true')
  return new Response(JSON.stringify({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Test result', channelTitle: 'Test channel' } }, { id: { channelId: 'skip-me' } }] }))
}
const result = await handler(request)
assert.equal(result.statusCode, 200)
assert.equal(JSON.parse(result.body).items.length, 1)
assert.equal(result.headers['Access-Control-Allow-Origin'], 'capacitor://localhost')
assert.ok(!result.body.includes('test-only-key'))
await handler(request)
assert.equal(calls, 1, 'Repeated queries should use the warm cache')
globalThis.fetch = async () => new Response('{}', { status: 403 })
assert.equal((await handler({ ...request, queryStringParameters: { q: 'new query' } })).statusCode, 429)
globalThis.fetch = async () => { throw new Error('offline') }
assert.equal((await handler({ ...request, queryStringParameters: { q: 'offline query' } })).statusCode, 502)
for (let i = 0; i < 8; i++) await handler({ ...request, queryStringParameters: { q: `limit ${i}` } })
assert.equal((await handler({ ...request, queryStringParameters: { q: 'limited' } })).statusCode, 429)
globalThis.window = { location: { origin: 'http://localhost' } }
globalThis.fetch = async () => new Response(JSON.stringify({ items: [reference, { videoId: 'bad' }] }))
assert.deepEqual(await refs.searchPracticeReferences('Mahler', new AbortController().signal), [reference])
globalThis.fetch = async () => new Response('{}', { status: 429 })
await assert.rejects(refs.searchPracticeReferences('Mahler', new AbortController().signal), /busy/)
globalThis.fetch = async () => { throw new Error('offline') }
await assert.rejects(refs.searchPracticeReferences('Mahler', new AbortController().signal), /Could not connect/)
console.log('Focus practice checks passed: bookmark persistence, project isolation, storage failures, desk restore, URL validation, search filtering, cache, limits, and network failures.')

// Real SQLite schema + repository operations: multiple sittings, durable take metadata,
// and isolation between excerpts. Only the Capacitor connection is adapted for Node.
const { default: initSqlJs } = await import('sql.js')
const SQL = await initSqlJs()
const sqlite = new SQL.Database()
const adapter = {
  query: async (sql, values = []) => {
    const statement = sqlite.prepare(sql)
    try { statement.bind(values); const rows = []; while (statement.step()) rows.push(statement.getAsObject()); return { values: rows } }
    finally { statement.free() }
  },
  run: async (sql, values = []) => { sqlite.run(sql, values); return {} },
  execute: async sql => { sqlite.run(sql); return {} },
  executeSet: async entries => {
    sqlite.run('BEGIN')
    try { for (const entry of entries) sqlite.run(entry.statement, entry.values); sqlite.run('COMMIT') }
    catch (error) { sqlite.run('ROLLBACK'); throw error }
    return {}
  },
}
globalThis.__focusTestDb = adapter
const { CREATE_SCHEMA_SQL } = await load('src/db/schema.ts')
sqlite.run(CREATE_SCHEMA_SQL)
const { migrateVaultSchema } = await load('src/db/migrations.ts')
await migrateVaultSchema(adapter)
async function repository(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
    name: 'test-sqlite-adapter', setup(builder) {
      builder.onResolve({ filter: /^\.\/connection$/ }, () => ({ path: 'connection', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const getVaultDatabase = () => globalThis.__focusTestDb; export const persistVaultWebStore = async () => {};' }))
    },
  }] })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const practice = await repository('src/db/practiceRepository.ts')
const vault = await repository('src/db/vaultRepository.ts')
const project = await vault.createProject('Mahler opening')
const other = await vault.createProject('Soft attacks')
const first = await practice.startPracticeSession({ projectId: project.id, focusArea: project.name, comparison: 'current-best' })
await vault.saveTake({ projectId: project.id, filePath: 'test/one.m4a', duration: 12, practiceSessionId: first.session.id, focusArea: project.name, intention: 'Steady entrance', name: 'Attempt one' })
await practice.endPracticeSession(first.session.id)
const second = await practice.startPracticeSession({ projectId: project.id, focusArea: project.name, comparison: 'current-best' })
assert.notEqual(first.session.id, second.session.id)
await vault.saveTake({ projectId: project.id, filePath: 'test/two.m4a', duration: 13, practiceSessionId: second.session.id, focusArea: project.name, intention: 'Lighter tongue', name: 'Attempt two' })
const rows = await vault.getTakesByProject(project.id)
assert.equal(rows.length, 2)
assert.ok(rows.every(row => row.focusArea === project.name && row.practiceSessionId && row.intention))
assert.equal((await vault.getTakesByProject(other.id)).length, 0)
const sessions = await practice.listPracticeSessions(project.id)
assert.ok(sessions.find(session => session.id === first.session.id).endedAt)
assert.equal(sessions.find(session => session.id === second.session.id).endedAt, null)
const reopened = new SQL.Database(sqlite.export())
assert.equal(reopened.exec('SELECT COUNT(*) FROM takes')[0].values[0][0], 2, 'Attempts survive a database reopen')
reopened.close()
sqlite.close()
delete globalThis.__focusTestDb
console.log('Practice journal checks passed: real SQLite persistence, new sitting IDs, closed sessions, intentions, focus labels, and project isolation.')

/* ---- Journal grouping ---------------------------------------------------
 * The spine's whole value is showing days and sittings, so the grouping is
 * worth testing against real timestamps rather than eyeballing a rendered
 * list. `now` is injected so these never break at a day boundary. */
const journal = await repository('src/utils/practiceJournal.ts')
const NOW = new Date(2026, 8, 5, 12, 0, 0).getTime()
const DAY = 86_400_000
const at = (dayOffset, hour, sessionId, extra = {}) => ({
  id: `t-${dayOffset}-${hour}-${sessionId}`,
  timestamp: new Date(2026, 8, 5 - dayOffset, hour, 0, 0).getTime(),
  practiceSessionId: sessionId,
  rating: 0,
  notes: '',
  ...extra,
})

// Two sittings today, one a week ago, plus a legacy take with no session id.
const takes = [
  at(0, 9, 's2'), at(0, 9, 's2b'),
  at(0, 18, 's3'),
  at(7, 10, 's1'),
  { id: 'legacy', timestamp: new Date(2026, 8, 5 - 7, 11, 0, 0).getTime(), focusArea: 'Mahler', rating: 0, notes: '' },
]
const attempts = journal.toJournalAttempts(takes)
assert.equal(attempts.length, 5, 'every focused take is an attempt')
assert.equal(attempts[0].number, 5, 'newest attempt carries the highest number')
assert.equal(attempts[attempts.length - 1].number, 1, 'oldest attempt is number 1')
assert.ok(
  attempts.every((item, index) => index === 0 || item.take.timestamp <= attempts[index - 1].take.timestamp),
  'attempts come back newest first',
)

const sittings = journal.groupIntoSittings(attempts, NOW)
assert.equal(sittings.length, 5, 'each distinct session id is its own sitting')
assert.equal(sittings[0].dayLabel, 'Today')
assert.ok(sittings[0].sittingLabel, 'a day with several sittings numbers them')
assert.equal(sittings[0].sittingLabel, 'sitting 3', 'the newest sitting of the day has the highest number')
assert.equal(sittings[2].sittingLabel, 'sitting 1', 'the day\'s first sitting is numbered 1')
// A week ago holds two sittings too (the legacy take groups separately), so
// those are numbered as well — numbering is per day, not global.
assert.equal(sittings[3].sittingLabel, 'sitting 2')
assert.equal(sittings[4].sittingLabel, 'sitting 1')
assert.ok(
  sittings.slice(3).every(sitting => sitting.dayLabel === sittings[3].dayLabel),
  'the older sittings share one day label',
)

// Consecutive takes in one sitting collapse into a single group.
const oneSitting = journal.groupIntoSittings(
  journal.toJournalAttempts([at(0, 9, 's1'), at(0, 10, 's1'), at(0, 11, 's1')]),
  NOW,
)
assert.equal(oneSitting.length, 1, 'one session id is one sitting')
assert.equal(oneSitting[0].attempts.length, 3)
assert.equal(oneSitting[0].sittingLabel, null)

assert.equal(journal.describeJournalDay(NOW, NOW), 'Today')
assert.equal(journal.describeJournalDay(NOW - DAY, NOW), 'Yesterday')
assert.notEqual(journal.describeJournalDay(NOW - DAY * 9, NOW), 'Today')
assert.equal(journal.countJournalDays(attempts), 2, 'distinct calendar days, not sittings')
assert.equal(journal.groupIntoSittings(journal.toJournalAttempts([]), NOW).length, 0, 'no takes, no spine')

console.log('Journal grouping checks passed: attempt numbering, sitting split, day labels, single-sitting days, and the empty run.')
