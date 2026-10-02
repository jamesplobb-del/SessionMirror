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
    react: 'export const useState=(...args)=>globalThis.__setlistHooks.useState(...args),useRef=(...args)=>globalThis.__setlistHooks.useRef(...args),useMemo=fn=>fn(),useLayoutEffect=()=>{},useEffect=()=>{}',
    'react/jsx-runtime': 'export const jsx=(type,props)=>({type,props}),jsxs=jsx;export const Fragment="Fragment"',
    icons: 'export const BookOpen="BookOpen",Check="Check",GripVertical="GripVertical",Plus="Plus",Trash2="Trash2",X="X"',
    sheet: 'export default "Sheet"',
    picker: 'export default "Picker"',
    thumb: 'export default "Thumb"',
    sortable: 'export const useSortableList=options=>{globalThis.__sortable=options;return {listRef:{current:null},sorting:false,itemProps:()=>({}),handleProps:()=>({}),liveRegion:null}}',
  }
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'isolated-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const path = args.path.endsWith('/plusAccess') ? 'plus' : ui && args.path === 'react' ? 'react' : ui && args.path === 'react/jsx-runtime' ? 'react/jsx-runtime' : ui && args.path === 'lucide-react' ? 'icons' : ui && args.path.endsWith('/AnimatedBottomSheet') ? 'sheet'
        : ui && args.path.endsWith('/MusicScorePicker') ? 'picker' : ui && args.path.endsWith('/ScoreThumbnail') ? 'thumb' : ui && args.path.endsWith('/useSortableList') ? 'sortable' : null
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

// Drag/keyboard ordering, picker adds and Undo are pure list operations.
const ordered = api.createMusicSetlist([scores[0], scores[1], scores[0]], 'Order')
const letters = list => list.entries.map(entry => entry.projectId === 'score-a' ? 'a' : 'b').join('')
assert.equal(letters(ordered), 'aba')
assert.equal(letters(api.reorderSetlistEntry(ordered, 0, 2)), 'baa', 'Moving the first piece to the end keeps the others in order')
assert.equal(letters(api.reorderSetlistEntry(ordered, 2, 0)), 'aab', 'Moving the last piece to the front')
assert.equal(api.reorderSetlistEntry(ordered, 1, 1), ordered, 'No move returns the same list')
assert.equal(api.reorderSetlistEntry(ordered, 0, 9), ordered, 'An out-of-range move changes nothing')
const tapped = api.appendSetlistScores(ordered, [scores[1], scores[0]])
assert.equal(letters(tapped), 'ababa', 'Picker choices append in the order they were tapped')
assert.equal(new Set(tapped.entries.map(entry => entry.id)).size, 5, 'Every added piece gets its own identity')
assert.throws(() => api.appendSetlistScores(api.createMusicSetlist(Array.from({ length: 99 }, () => scores[0])), [scores[0], scores[1]]), /100/, 'Adding past the limit is refused whole')
const removedEntry = ordered.entries[1]
const removedList = api.removeSetlistEntry(ordered, removedEntry.id)
assert.equal(api.restoreSetlistEntry(removedList, removedEntry, 1).entries.map(entry => entry.id).join(), ordered.entries.map(entry => entry.id).join(), 'Undo puts a removed piece back where it was')

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
const nameInput = h => find(h, node => node.type === 'input' && node.props['aria-label'] === 'Setlist name')
const openButtons = h => nodes(h.tree).filter(node => node.type === 'button' && node.props['aria-label']?.startsWith('Open '))
const h = new Hooks()
const draft = api.createMusicSetlist([scores[0]], 'Draft concert')
draft.entries[0].cue = 'Legacy cue'
let reads = 0
let rejectRead = true
h.props = { setlist: draft, scores, onCancel() {}, onSave: next => { api.saveMusicSetlist(next) }, onRead: async () => { reads++; if (rejectRead) throw Error('Score could not be opened') } }
h.render()
nameInput(h).props.onChange({ target: { value: 'Updated concert' } })
h.render()
failWrites = true
openButtons(h)[0].props.onClick()
await tick(h)
assert.equal(reads, 0, 'Open awaits saving; a failed save cannot falsely start a score')
assert.equal(nameInput(h).props.value, 'Updated concert')
assert.equal(find(h, node => node.props?.role === 'alert').props.children, 'Storage full')
failWrites = false
openButtons(h)[0].props.onClick()
await tick(h)
assert.equal(reads, 1)
assert.equal(find(h, node => node.props?.role === 'alert').props.children, 'Score could not be opened')
assert.equal(api.loadMusicSetlists()[0].name, 'Updated concert', 'Successful save survives a later reader failure')
assert.equal(api.loadMusicSetlists()[0].entries[0].cue, 'Legacy cue', 'Simplified editing preserves prior stored data')
rejectRead = false
openButtons(h)[0].props.onClick()
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

// A missing score: no Open button, and Replace goes through the library picker, never a drop-down.
const missing = new Hooks()
let deleted = 0
missing.props = { ...h.props, onSave: next => { api.saveMusicSetlist(next) }, setlist: normalized, scores, onDelete: async () => { deleted++ } }
missing.render()
assert.equal(openButtons(missing).length, 0, 'A missing score cannot falsely launch')
assert.ok(!nodes(missing.tree).some(node => node.type === 'select'), 'No native drop-down anywhere in the editor')
find(missing, node => node.type === 'button' && node.props.className === 'music-setlist-editor__replace').props.onClick()
missing.render()
const replacePicker = find(missing, node => node.type === 'Picker')
assert.equal(replacePicker.props.mode, 'single', 'Replacing a score picks exactly one from the library')
replacePicker.props.onPick([scores[1]])
missing.render()
assert.equal(openButtons(missing).length, 1, 'Choosing an available replacement repairs only that entry')
assert.equal(nodes(missing.tree).filter(node => node.type === 'button' && node.props.className === 'music-setlist-editor__replace').length, 1, 'The other missing entry stays repairable')
find(missing, node => node.type === 'button' && node.props.className === 'music-setlist-editor__delete').props.onClick()
missing.render()
assert.equal(deleted, 0, 'Delete first presents a confirmation')
const confirmation = find(missing, node => node.props?.['aria-label'] === 'Delete setlist confirmation')
assert.ok(nodes(confirmation).some(node => node.props?.children === 'Only this setlist will be deleted. Your scores and annotations stay in the music library.'))
find(missing, node => node.type === 'button' && node.props.children === 'Delete setlist').props.onClick()
await tick(missing)
assert.equal(deleted, 1, 'Confirmed deletion invokes only the collection callback')

// Drag/keyboard reorder, the library picker, and Undo drive the real editor callbacks.
const order = new Hooks()
order.props = { ...h.props, onSave: next => { api.saveMusicSetlist(next) }, setlist: api.createMusicSetlist([scores[0], scores[1], scores[0]], 'Order') }
order.render()
assert.equal(globalThis.__sortable.ids.length, 3, 'The editor hands its rows to the sortable list')
globalThis.__sortable.onMove(0, 2)
order.render()
find(order, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(order)
const savedOrder = () => letters(api.loadMusicSetlists().find(list => list.name === 'Order'))
assert.equal(savedOrder(), 'baa', 'A drag to the end is what gets saved')
find(order, node => node.type === 'button' && node.props.className === 'music-setlist-editor__add').props.onClick()
order.render()
const addPicker = find(order, node => node.type === 'Picker')
assert.equal(addPicker.props.mode, 'multiple')
assert.equal(addPicker.props.capacity, 97, 'The picker knows how many more pieces fit')
assert.deepEqual(addPicker.props.counts, { 'score-a': 2, 'score-b': 1 }, 'The picker marks music already in the list')
addPicker.props.onPick([scores[1], scores[0]])
order.render()
find(order, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(order)
assert.equal(savedOrder(), 'baaba', 'Picked music is added in the order it was tapped')
const removeButtons = () => nodes(order.tree).filter(node => node.type === 'button' && node.props['aria-label']?.startsWith('Remove '))
assert.equal(removeButtons().length, 5)
removeButtons()[1].props.onClick()
order.render()
assert.equal(removeButtons().length, 4)
find(order, node => node.type === 'button' && node.props.children === 'Undo').props.onClick()
order.render()
assert.equal(removeButtons().length, 5, 'Undo restores the removed piece')
find(order, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await tick(order)
assert.equal(savedOrder(), 'baaba', 'Undo restores it in its original position')
console.log('PASS: real setlist storage/order/occurrences/snapshot/replacement isolation, limits, quota/retry, corruption preservation, list-only deletion; drag/keyboard reorder, tap-order picker adds, Undo; actual editor async save/open/retry/draft/doubletap callbacks (isolated hooks; no DOM)')
