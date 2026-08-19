import type { PracticeTimeline } from '../types'
import { createEmptyTimeline, createTimelineId } from '../sectionDefaults'
import { normalizeTimeline } from '../timelineNormalize'
import { parseRoutineFile } from './routineFile'

const STORAGE_KEY = 'besttake:practice-timelines'
const ACTIVE_KEY = 'besttake:practice-timeline-active'

function readAll(): PracticeTimeline[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PracticeTimeline[]
    return Array.isArray(parsed) ? parsed.map(normalizeTimeline) : []
  } catch {
    return []
  }
}

function writeAll(timelines: PracticeTimeline[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timelines))
}

export function loadTimelines(): PracticeTimeline[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadActiveTimelineId(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveTimelineId(id: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ACTIVE_KEY, id)
}

export function getTimelineById(id: string): PracticeTimeline | undefined {
  return readAll().find((timeline) => timeline.id === id)
}

export function saveTimeline(timeline: PracticeTimeline): PracticeTimeline {
  const next = normalizeTimeline({ ...timeline, updatedAt: Date.now() })
  const all = readAll()
  const index = all.findIndex((item) => item.id === next.id)
  if (index >= 0) all[index] = next
  else all.push(next)
  writeAll(all)
  saveActiveTimelineId(next.id)
  return next
}

export function deleteTimeline(id: string): void {
  writeAll(readAll().filter((timeline) => timeline.id !== id))
  if (loadActiveTimelineId() === id) localStorage.removeItem(ACTIVE_KEY)
}

export function duplicateTimeline(id: string): PracticeTimeline | undefined {
  const source = getTimelineById(id)
  if (!source) return undefined
  const now = Date.now()
  return saveTimeline({
    ...source,
    id: createTimelineId(),
    name: `${source.name} Copy`,
    favorite: false,
    createdAt: now,
    updatedAt: now,
    sections: source.sections.map((section) => ({
      ...section,
      id: `${section.id}-copy-${now}`,
    })),
  })
}

export function toggleTimelineFavorite(id: string): PracticeTimeline | undefined {
  const timeline = getTimelineById(id)
  if (!timeline) return undefined
  return saveTimeline({ ...timeline, favorite: !timeline.favorite })
}

export function loadOrCreateActiveTimeline(): PracticeTimeline {
  const activeId = loadActiveTimelineId()
  if (activeId) {
    const existing = getTimelineById(activeId)
    if (existing) return existing
  }
  return saveTimeline(createEmptyTimeline())
}

export type RoutineImportResult =
  | { ok: true; routine: PracticeTimeline; warnings: string[] }
  | { ok: false; error: string }

/** Keeps a shared routine from hiding behind an identically named existing one. */
function uniqueRoutineName(name: string): string {
  const existing = new Set(readAll().map((timeline) => timeline.name))
  if (!existing.has(name)) return name
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${name} (${suffix})`
    if (!existing.has(candidate)) return candidate
  }
  return `${name} (${Date.now()})`
}

/**
 * The one entry point for routines arriving from outside this device, whether
 * picked from Files or tapped in Messages. Validation lives in parseRoutineFile;
 * this adds the naming and persistence around it, and makes the imported
 * routine active so it is ready to play.
 */
export function importRoutineFromText(text: string): RoutineImportResult {
  const parsed = parseRoutineFile(text)
  if (!parsed.ok) return parsed
  const routine = saveTimeline({
    ...parsed.routine,
    name: uniqueRoutineName(parsed.routine.name),
  })
  return { ok: true, routine, warnings: parsed.warnings }
}
