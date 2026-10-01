import assert from 'node:assert/strict'
import { build } from 'esbuild'

const storage = new Map()
let failWrites = false
let writeCount = 0
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { writeCount++; if (failWrites) throw Error('Storage full'); storage.set(key, value) },
  removeItem: key => storage.delete(key),
}
globalThis.window = new EventTarget()
const bundle = async (entry, ui = false) => {
  const mocks = {
    plus: 'export const canUsePlus=()=>false,requirePlus=()=>false',
    react: 'export const useState=(...args)=>globalThis.__setlistHooks.useState(...args),useRef=(...args)=>globalThis.__setlistHooks.useRef(...args)',
    'react/jsx-runtime': 'export const jsx=(type,props)=>({type,props}),jsxs=jsx;export const Fragment="Fragment"',
    icons: 'export const ArrowDown="ArrowDown",ArrowUp="ArrowUp",BookOpen="BookOpen",Copy="Copy",Trash2="Trash2",X="X"',
    sheet: 'export default "Sheet"',
  }
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const path = args.path.endsWith('/plusAccess') ? 'plus' : ui && args.path === 'react' ? 'react' : ui && args.path === 'react/jsx-runtime' ? 'react/jsx-runtime' : ui && args.path === 'lucide-react' ? 'icons' : ui && args.path.endsWith('/AnimatedBottomSheet') ? 'sheet' : null
      if (path) return { path, namespace: 'fixture' }
    })
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path] }))
  } }] })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const api = await bundle('src/utils/musicSetlists.ts')
const scores = [{ id: 'score-a', name: 'Opening march', createdAt: 1 }, { id: 'score-b', name: 'Finale', createdAt: 2 }]
storage.set('besttake:music-setup:v1:score-a', JSON.stringify({ mode: 'audio', showMetronome: true, metronome: { bpm: 112, meter: '3/4', subdivision: 'off' }, drone: { pitchClass: 0, octave: 4 }, autoSoundRecording: true }))
storage.set('score:bytes:score-a', 'original PDF bytes')
storage.set('besttake:routine-library:v1', '[]')
let first = api.createMusicSetlist([scores[0], scores[0], scores[1]], 'Friday rehearsal')
assert.equal(new Set(first.entries.map(entry => entry.id)).size, 3, 'Repeated scores get independent occurrence IDs')
assert.equal(first.entries[0].desk.metronome.bpm, 112)
assert.equal(first.entries[0].desk.autoSoundRecording, false, 'A score’s hands-free preset cannot start recording in a setlist')
assert.equal(first.entries[0].desk.showMusic, true)
first.entries[0].cue = 'Count-in, then start at bar 24'
first.entries[1].cue = 'Encore: take the repeat'
const second = api.createMusicSetlist([scores[0]], 'Saturday concert')
api.saveMusicSetlist(first); api.saveMusicSetlist(second)
assert.equal(api.loadMusicSetlists().length, 2, 'A score may belong to overlapping lists')
const reloaded = api.loadMusicSetlists().find(list => list.id === first.id)
assert.deepEqual(reloaded.entries.map(entry => [entry.projectId, entry.cue]), first.entries.map(entry => [entry.projectId, entry.cue]))
storage.set('besttake:music-setup:v1:score-a', JSON.stringify({ mode: 'audio', metronome: { bpm: 70 } }))
assert.equal(api.loadMusicSetlists().find(list => list.id === first.id).entries[0].desk.metronome.bpm, 112, 'Library setup changes do not mutate saved occurrence snapshots')
first = api.moveSetlistEntry(first, first.entries[2].id, -1)
assert.deepEqual(first.entries.map(entry => entry.projectId), ['score-a', 'score-b', 'score-a'])
const repeat = api.duplicateSetlistEntry(first, first.entries[0].id)
assert.notEqual(repeat.entries[0].id, repeat.entries[1].id)
repeat.entries[1].cue = 'New cue'
repeat.entries[1].desk.metronome.bpm = 130
assert.equal(first.entries[0].cue, 'Count-in, then start at bar 24')
assert.equal(first.entries[0].desk.metronome.bpm, 112, 'Repeated occurrence has its own cue and desk')
const repaired = api.replaceSetlistScore(first, first.entries[0].id, scores[1])
assert.equal(repaired.entries[0].id, first.entries[0].id)
assert.equal(repaired.entries[0].cue, first.entries[0].cue)
assert.equal(first.entries[0].projectId, 'score-a')
assert.equal(api.loadMusicSetlists().find(list => list.id === second.id).entries[0].projectId, 'score-a', 'Repairing one occurrence cannot change another saved list')
const renamed = { ...repaired, name: 'Friday concert' }
const beforeFailure = new Map(storage)
failWrites = true
assert.throws(() => api.saveMusicSetlist(renamed), /Storage full/)
assert.deepEqual(storage, beforeFailure, 'One atomic failing write leaves all prior lists and scores unchanged')
failWrites = false
api.saveMusicSetlist(renamed)
assert.equal(api.loadMusicSetlists().filter(list => list.id === first.id).length, 1, 'Save retry replaces the list without duplication')
const full = api.createMusicSetlist(Array.from({ length: 100 }, () => scores[0]))
assert.throws(() => api.appendSetlistScore(full, scores[1]), /100/)
assert.throws(() => api.duplicateSetlistEntry(full, full.entries[0].id), /100/)
assert.throws(() => api.createMusicSetlist(Array.from({ length: 101 }, () => scores[0])), /100/)
const overLimit = { ...full, entries: [...full.entries, api.createSetlistEntry(scores[1])] }
assert.equal(api.parseMusicSetlist(overLimit).entries.length, 101, 'Loaded over-limit data remains visible instead of being truncated')
assert.throws(() => api.saveMusicSetlist(overLimit), /100/)
const normalized = api.parseMusicSetlist({ ...first, name: '  Rehearsal  ', entries: [{ projectId: 'missing-score', id: 'repeat', cue: 9 }, { projectId: 'missing-score', id: 'repeat' }] })
assert.equal(normalized.name, 'Rehearsal')
assert.equal(normalized.entries.length, 2)
assert.notEqual(normalized.entries[0].id, normalized.entries[1].id)
assert.equal(normalized.entries[0].cue, '')
assert.equal(normalized.entries[0].scoreName, 'Music')
assert.equal(normalized.entries[0].projectId, 'missing-score', 'Missing score references stay repairable')
assert.equal(api.parseMusicSetlist({ ...first, entries: [{ projectId: null }] }), null)
const beforeDelete = new Map(storage)
api.deleteMusicSetlist(first.id)
assert.equal(api.loadMusicSetlists().length, 1)
for (const [key, value] of beforeDelete) if (key !== api.MUSIC_SETLISTS_KEY) assert.equal(storage.get(key), value, 'Deleting a setlist changes only setlist storage')
storage.set(api.MUSIC_SETLISTS_KEY, '{corrupted')
assert.deepEqual(api.loadMusicSetlists(), [])
assert.throws(() => api.saveMusicSetlist(second))
assert.equal(storage.get(api.MUSIC_SETLISTS_KEY), '{corrupted', 'Unrecoverable saved data is never silently overwritten')
storage.delete(api.MUSIC_SETLISTS_KEY)

// Actual editor function and callbacks in an isolated hooks/JSX fixture; no DOM.
class Hooks {
  slots = []; cursor = 0
  useState(initial) {
    const index = this.cursor++
    if (!(index in this.slots)) this.slots[index] = typeof initial === 'function' ? initial() : initial
    return [this.slots[index], next => { this.slots[index] = typeof next === 'function' ? next(this.slots[index]) : next }]
  }
  useRef(initial) { const index = this.cursor++; return this.slots[index] ??= { current: initial } }
  render() { this.cursor = 0; globalThis.__setlistHooks = this; this.tree = Editor(this.props); return this.tree }
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props?.children)]
}
const find = (h, predicate) => { const node = nodes(h.tree).find(predicate); assert.ok(node, 'Expected rendered control'); return node }
const tick = async h => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); h.render() }
const { default: Editor } = await bundle('src/components/MusicSetlistEditor.tsx', true)
const h = new Hooks()
const draft = api.createMusicSetlist([scores[0]], 'Draft concert')
draft.entries[0].cue = 'Legacy cue'
let reads = 0
let rejectRead = true
h.props = { setlist: draft, scores, onCancel() {}, onSave: next => { api.saveMusicSetlist(next) }, onRead: async () => { reads++; if (rejectRead) throw Error('Score could not be opened') } }
h.render()
find(h, node => node.type === 'input').props.onChange({ target: { value: 'Updated concert' } })
h.render()
failWrites = true
find(h, node => node.type === 'button' && node.props['aria-label']?.startsWith('Read entry')).props.onClick()
await tick(h)
assert.equal(reads, 0, 'Read awaits saving; a failed save cannot falsely start a score')
assert.equal(find(h, node => node.type === 'input').props.value, 'Updated concert')
assert.equal(find(h, node => node.props?.role === 'alert').props.children, 'Storage full')
failWrites = false
find(h, node => node.type === 'button' && node.props['aria-label']?.startsWith('Read entry')).props.onClick()
await tick(h)
assert.equal(reads, 1)
assert.equal(find(h, node => node.props?.role === 'alert').props.children, 'Score could not be opened')
assert.equal(api.loadMusicSetlists()[0].name, 'Updated concert', 'Successful save survives a later reader failure')
assert.equal(api.loadMusicSetlists()[0].entries[0].cue, 'Legacy cue', 'Simplified editing preserves prior stored data')
rejectRead = false
find(h, node => node.type === 'button' && node.props['aria-label']?.startsWith('Read entry')).props.onClick()
await tick(h)
assert.equal(reads, 2)
assert.equal(api.loadMusicSetlists().length, 1, 'Reader retry does not duplicate the saved list')
let resolveSave
let saves = 0
h.props.onSave = () => { saves++; return new Promise(resolve => { resolveSave = resolve }) }
h.render()
const submit = find(h, node => node.type === 'form').props.onSubmit
submit({ preventDefault() {} }); submit({ preventDefault() {} })
assert.equal(saves, 1, 'Busy ref prevents two same-turn Save taps')
resolveSave(); await tick(h)
const missing = new Hooks()
let deleted = 0
missing.props = { ...h.props, setlist: normalized, scores, onDelete: async () => { deleted++ } }
missing.render()
assert.equal(find(missing, node => node.type === 'button' && node.props['aria-label']?.startsWith('Read entry')).props.disabled, true, 'A missing score cannot falsely launch')
find(missing, node => node.type === 'select' && node.props['aria-label'] === 'Replace score for entry 1').props.onChange({ target: { value: 'score-b' } })
missing.render()
assert.equal(find(missing, node => node.type === 'button' && node.props['aria-label']?.startsWith('Read entry')).props.disabled, false, 'Choosing an available replacement repairs only that entry')
find(missing, node => node.type === 'button' && node.props.className === 'music-setlist-editor__danger' && node.props.children?.some?.(child => child?.props?.children === 'Delete list')).props.onClick()
missing.render()
assert.equal(deleted, 0, 'Delete list first presents a confirmation')
const confirmation = find(missing, node => node.props?.['aria-label'] === 'Delete setlist confirmation')
assert.ok(nodes(confirmation).some(node => node.props?.children === 'Only this setlist will be deleted. Your scores and annotations stay in the music library.'))
find(missing, node => node.type === 'button' && node.props.children === 'Delete setlist').props.onClick()
await tick(missing)
assert.equal(deleted, 1, 'Confirmed deletion invokes only the collection callback')
console.log('PASS: real setlist storage/order/occurrences/snapshot/replacement isolation, limits, quota/retry, corruption preservation, list-only deletion; actual editor async save/read/retry/draft/doubletap callbacks (isolated hooks; no DOM)')
