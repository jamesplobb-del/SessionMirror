import type { Project } from '../db'
import { safeRandomUUID } from './uuid'
import { blankDesk } from './practiceRoutines'
import { loadMusicSetup } from './musicLibrary'
import { normalizeDeskSnapshot, type DeskSnapshot } from './workspaceDesks'
import { moveItem } from './sortableOrder'

export const MUSIC_SETLISTS_KEY = 'besttake:music-setlists:v1'
export const MUSIC_SETLISTS_CHANGED = 'besttake:music-setlists-changed'
export const MAX_SETLIST_ENTRIES = 100
export const MAX_SETLIST_NAME = 80
export const MAX_SETLIST_CUE = 500
export interface MusicSetlistEntry {
  /** Identifies this occurrence, including repeated performances of one score. */
  id: string
  projectId: string
  scoreName: string
  cue: string
  desk: DeskSnapshot
}
export interface MusicSetlist {
  id: string
  name: string
  entries: MusicSetlistEntry[]
  createdAt: number
  updatedAt: number
}
export type Setlist = MusicSetlist
export type SetlistEntry = MusicSetlistEntry
type Score = Pick<Project, 'id' | 'name'>

function copyDesk(value: unknown): DeskSnapshot {
  const desk = normalizeDeskSnapshot(value) ?? blankDesk('audio')
  return { ...desk, mode: 'audio', showMusic: true, autoSoundRecording: false,
    metronome: { ...desk.metronome }, drone: { ...desk.drone } }
}
export function createSetlistEntry(score: Score): MusicSetlistEntry {
  if (!score.id) throw new Error('Choose a score from your music library.')
  return { id: safeRandomUUID(), projectId: score.id, scoreName: score.name.trim() || 'Music', cue: '', desk: copyDesk(loadMusicSetup(score.id)) }
}
export function createMusicSetlist(scores: readonly Score[] = [], name = 'Untitled setlist'): MusicSetlist {
  assertCapacity(scores.length)
  const now = Date.now()
  return { id: safeRandomUUID(), name, entries: scores.map(createSetlistEntry), createdAt: now, updatedAt: now }
}
export function cloneMusicSetlist(setlist: MusicSetlist): MusicSetlist {
  return { ...setlist, entries: setlist.entries.map(entry => ({ ...entry, desk: copyDesk(entry.desk) })) }
}
function assertCapacity(count: number): void {
  if (count > MAX_SETLIST_ENTRIES) throw new Error(`A setlist can hold up to ${MAX_SETLIST_ENTRIES} entries. Remove an entry before adding another.`)
}
function editEntries(setlist: MusicSetlist, entries: MusicSetlistEntry[]): MusicSetlist {
  return { ...setlist, entries, updatedAt: Date.now() }
}
export function appendSetlistScore(setlist: MusicSetlist, score: Score): MusicSetlist {
  assertCapacity(setlist.entries.length + 1)
  return editEntries(setlist, [...setlist.entries, createSetlistEntry(score)])
}
/** Adds several scores in the order given, e.g. the order they were tapped in the picker. */
export function appendSetlistScores(setlist: MusicSetlist, scores: readonly Score[]): MusicSetlist {
  assertCapacity(setlist.entries.length + scores.length)
  return editEntries(setlist, [...setlist.entries, ...scores.map(createSetlistEntry)])
}
export function reorderSetlistEntry(setlist: MusicSetlist, from: number, to: number): MusicSetlist {
  const next = moveItem(setlist.entries, from, to)
  return next === setlist.entries ? setlist : editEntries(setlist, next)
}
/** Puts a removed entry back where it was, for Undo. */
export function restoreSetlistEntry(setlist: MusicSetlist, entry: MusicSetlistEntry, index: number): MusicSetlist {
  assertCapacity(setlist.entries.length + 1)
  const entries = [...setlist.entries]
  entries.splice(Math.max(0, Math.min(entries.length, index)), 0, entry)
  return editEntries(setlist, entries)
}
export function duplicateSetlistEntry(setlist: MusicSetlist, entryId: string): MusicSetlist {
  assertCapacity(setlist.entries.length + 1)
  const index = setlist.entries.findIndex(entry => entry.id === entryId)
  if (index < 0) throw new Error('This setlist entry is unavailable.')
  const entries = [...setlist.entries]
  const original = entries[index]!
  entries.splice(index + 1, 0, { ...original, id: safeRandomUUID(), desk: copyDesk(original.desk) })
  return editEntries(setlist, entries)
}
export function moveSetlistEntry(setlist: MusicSetlist, entryId: string, direction: -1 | 1): MusicSetlist {
  const index = setlist.entries.findIndex(entry => entry.id === entryId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= setlist.entries.length) return setlist
  const entries = [...setlist.entries]
  ;[entries[index], entries[target]] = [entries[target]!, entries[index]!]
  return editEntries(setlist, entries)
}
export function removeSetlistEntry(setlist: MusicSetlist, entryId: string): MusicSetlist {
  return editEntries(setlist, setlist.entries.filter(entry => entry.id !== entryId))
}
export function replaceSetlistScore(setlist: MusicSetlist, entryId: string, score: Score): MusicSetlist {
  if (!setlist.entries.some(entry => entry.id === entryId)) throw new Error('This setlist entry is unavailable.')
  const replacement = createSetlistEntry(score)
  return editEntries(setlist, setlist.entries.map(entry => entry.id === entryId ? { ...replacement, id: entry.id, cue: entry.cue } : entry))
}

export function parseMusicSetlist(value: unknown): MusicSetlist | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.name !== 'string' || !Array.isArray(raw.entries)) return null
  const seen = new Set<string>()
  const entries: MusicSetlistEntry[] = []
  for (const value of raw.entries) {
    if (!value || typeof value !== 'object' || typeof value.projectId !== 'string' || !value.projectId) return null
    const id = typeof value.id === 'string' && value.id && !seen.has(value.id) ? value.id : safeRandomUUID()
    seen.add(id)
    entries.push({ id, projectId: value.projectId, scoreName: typeof value.scoreName === 'string' && value.scoreName.trim() ? value.scoreName : 'Music',
      cue: typeof value.cue === 'string' ? value.cue : '', desk: copyDesk(value.desk) })
  }
  // Keep over-limit saved data visible; writing requires reducing it explicitly.
  return { id: raw.id, name: raw.name.trim() || 'Untitled setlist', entries,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 }
}
function readSetlists(): MusicSetlist[] {
  const raw = JSON.parse(localStorage.getItem(MUSIC_SETLISTS_KEY) ?? '[]') as unknown
  if (!Array.isArray(raw)) throw new Error('Saved setlists could not be read. Your existing data has been kept.')
  const seen = new Set<string>()
  return raw.map(value => {
    const setlist = parseMusicSetlist(value)
    if (!setlist) throw new Error('A saved setlist could not be read. Your existing data has been kept.')
    if (seen.has(setlist.id)) setlist.id = safeRandomUUID()
    seen.add(setlist.id)
    return setlist
  })
}
export function loadMusicSetlists(): MusicSetlist[] {
  try { return readSetlists() } catch { return [] }
}
function writeSetlists(setlists: MusicSetlist[]): void {
  localStorage.setItem(MUSIC_SETLISTS_KEY, JSON.stringify(setlists))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MUSIC_SETLISTS_CHANGED))
}
export function saveMusicSetlist(setlist: MusicSetlist): MusicSetlist {
  if (!setlist.id) throw new Error('This setlist needs its own identity.')
  const name = setlist.name.trim()
  if (!name) throw new Error('Give this setlist a name.')
  if (name.length > MAX_SETLIST_NAME) throw new Error(`Keep the setlist name within ${MAX_SETLIST_NAME} characters.`)
  assertCapacity(setlist.entries.length)
  const ids = new Set<string>()
  for (const entry of setlist.entries) {
    if (!entry.id || ids.has(entry.id) || !entry.projectId) throw new Error('Each score occurrence needs its own identity.')
    if (entry.cue.length > MAX_SETLIST_CUE) throw new Error(`Keep each cue within ${MAX_SETLIST_CUE} characters.`)
    ids.add(entry.id)
  }
  const next = { ...cloneMusicSetlist(setlist), name, updatedAt: Date.now() }
  const existing = readSetlists()
  writeSetlists([next, ...existing.filter(item => item.id !== next.id)])
  return next
}
/** Only the collection is deleted. Scores, annotations and routines are untouched. */
export function deleteMusicSetlist(id: string): void {
  writeSetlists(readSetlists().filter(setlist => setlist.id !== id))
}
