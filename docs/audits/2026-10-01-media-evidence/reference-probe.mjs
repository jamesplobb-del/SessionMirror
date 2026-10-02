import { savePracticePassage, loadPracticePassage } from '/Users/jameslobb/Documents/SessionMirror/src/utils/practicePassages.ts'
import { trimmedTakeMetadata } from '/Users/jameslobb/Documents/SessionMirror/src/utils/trimTakeMetadata.ts'
const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
const saved = savePracticePassage('project-a', 'youtube:abcdefghijk', { startSeconds: 10, endSeconds: 40, positionSeconds: 10, loop: true })
const restored = loadPracticePassage('project-a', 'youtube:abcdefghijk')
const duration = 25
const loopWouldRun = restored.loop && restored.endSeconds <= duration
console.log(JSON.stringify({ saved, restored, playerDuration: duration, loopWouldRun }, null, 2))
const updates = trimmedTakeMetadata({ id: 'take-a', duration: 30, pitchSeries: [], timelineOffsetMs: 0 }, 15, 10)
console.log(JSON.stringify({ trimmedTakeDuration: updates.duration, loopBoundaryUpdates: Object.hasOwn(updates, 'loopStartSeconds') || Object.hasOwn(updates, 'loopEndSeconds') }, null, 2))
