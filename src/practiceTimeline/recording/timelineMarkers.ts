import type { PracticeTimelineMarker } from '../types'

const MARKERS_KEY = 'besttake:take-timeline-markers'
const PENDING_KEY = 'besttake:pending-timeline-markers'

type MarkerMap = Record<string, PracticeTimelineMarker[]>

function readMap(key: string): MarkerMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    return JSON.parse(raw) as MarkerMap
  } catch {
    return {}
  }
}

function writeMap(key: string, map: MarkerMap): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify(map))
}

export function saveTakeMarkers(takeId: string, markers: PracticeTimelineMarker[]): void {
  const map = readMap(MARKERS_KEY)
  map[takeId] = markers
  writeMap(MARKERS_KEY, map)
}

export function loadTakeMarkers(takeId: string): PracticeTimelineMarker[] {
  return readMap(MARKERS_KEY)[takeId] ?? []
}

export function stashPendingMarkers(markers: PracticeTimelineMarker[]): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(markers))
}

export function consumePendingMarkers(): PracticeTimelineMarker[] {
  if (typeof sessionStorage === 'undefined') return []
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as PracticeTimelineMarker[]
  } catch {
    return []
  }
}
