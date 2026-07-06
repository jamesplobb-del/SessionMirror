import type { PracticeTimeline, PracticeTimelineExport, TimelineSection } from '../types'
import { createEmptyTimeline, createTimelineId } from '../sectionDefaults'
import { normalizeTimeline } from '../timelineNormalize'

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

export function exportTimeline(timeline: PracticeTimeline): string {
  const payload: PracticeTimelineExport = { version: 1, timeline }
  return JSON.stringify(payload, null, 2)
}

export function importTimeline(json: string): PracticeTimeline {
  const parsed = JSON.parse(json) as PracticeTimelineExport | PracticeTimeline
  const timeline =
    'version' in parsed && parsed.version === 1 ? parsed.timeline : (parsed as PracticeTimeline)
  const now = Date.now()
  return saveTimeline(normalizeTimeline({
    ...timeline,
    id: createTimelineId(),
    createdAt: now,
    updatedAt: now,
    sections: timeline.sections.map((section: TimelineSection) => ({
      ...section,
      id: `${section.id}-imported-${now}`,
    })),
  }))
}

export async function shareTimelineExport(timeline: PracticeTimeline): Promise<void> {
  const json = exportTimeline(timeline)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      const file = new File([json], `${timeline.name.replace(/\s+/g, '-')}.besttake-timeline.json`, {
        type: 'application/json',
      })
      await navigator.share({ title: timeline.name, files: [file] })
      return
    }
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${timeline.name.replace(/\s+/g, '-')}.besttake-timeline.json`
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
