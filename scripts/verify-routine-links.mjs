import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}
const bundle = await build({
  stdin: { contents: `
    export * from './src/utils/routineLink'
    export * from './src/utils/practiceRoutineShare'
    export * from './src/utils/practiceRoutines'
  `, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const routine = m.createRoutine('Sharing test · Fundamentals', [
  m.createStep({ title: 'Breathing', minutes: 2 }),
  m.createStep({ title: 'Long tones', minutes: 3 }),
  m.createStep({ title: 'Scales', minutes: 3 }),
  m.createStep({ title: 'Étude & reflection', minutes: 2 }),
], null)
const json = m.buildPracticePlanFile(routine, 'sharing-test')
const link = await m.buildRoutineLink(json)
assert.ok(link?.startsWith(m.ROUTINE_WEB_LINK_BASE + '#v1.'))
assert.ok(link.length < m.MAX_ROUTINE_LINK_LENGTH)
assert.equal(new URL(link).search, '', 'Routine data must stay out of the server query')
assert.equal(await m.decodeRoutineLink(link), json)
const appLink = m.ROUTINE_APP_LINK_PREFIX + new URL(link).hash
const received = m.importPracticePlanFromText(await m.decodeRoutineLink(appLink))
assert.ok(received.ok)
assert.equal(received.routine.name, routine.name)
assert.deepEqual(received.routine.steps.map(step => step.title), routine.steps.map(step => step.title))
assert.equal(await m.decodeRoutineLink('besttake://routine#v2.invalid'), null)
assert.equal(await m.decodeRoutineLink('besttake://routine#v1.invalid'), null)
assert.equal(await m.decodeRoutineLink('besttake://routine'), null)
assert.equal(await m.buildRoutineLink(randomBytes(80_000).toString('base64')), null,
  'Oversized links must use the file fallback')

// Run the actual hosted page script against the generated link, including its
// Unicode preview and app handoff; this catches drift between the two codecs.
const html = readFileSync('netlify-youtube-proxy/r.html', 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]
const elements = new Map(['open', 'name', 'summary', 'steps', 'error'].map(id => [id, {
  hidden: id === 'error', textContent: '', children: [], append(...children) { this.children.push(...children) },
}]))
await runInNewContext(script, {
  location: { hash: new URL(link).hash },
  document: {
    getElementById: id => elements.get(id),
    createElement: () => ({ children: [], append(...children) { this.children.push(...children) } }),
    createTextNode: text => ({ textContent: text }),
  },
  Uint8Array, atob, Blob, Response, DecompressionStream,
})
assert.equal(elements.get('open').href, appLink)
assert.equal(elements.get('name').textContent, routine.name)
assert.equal(elements.get('summary').textContent, '4 exercises · about 10 min')
assert.equal(elements.get('steps').children.length, 4)
if (process.env.BESTTAKE_ROUTINE_LINK_FIXTURE) {
  writeFileSync(process.env.BESTTAKE_ROUTINE_LINK_FIXTURE, link)
}
console.log('PASS: routine link round trip, Unicode, native import, hosted preview, invalid links and oversized file fallback')
