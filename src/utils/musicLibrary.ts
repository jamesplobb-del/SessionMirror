import type { DeskSnapshot } from './workspaceDesks'
import { normalizeDeskSnapshot } from './workspaceDesks'
import { loadExerciseLibrary } from './routineLibrary'

const ORDER_KEY = 'besttake:music-order:v1'
const ORGANIZATION_KEY = 'besttake:music-folders:v1'
const setupKey = (id: string) => `besttake:music-setup:v1:${id}`
const scoreSettingsKey = (id: string) => `besttake:music-score-settings:v1:${id}`

export interface MusicScoreSettings {
  referenceQuery: string
  referenceVideoId: string | null
  programId: string | null
}

/** Null means this score has no explicit library setup yet. */
export function loadMusicScoreSettings(projectId: string): MusicScoreSettings | null {
  try {
    const raw = localStorage.getItem(scoreSettingsKey(projectId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<MusicScoreSettings>
    return {
      referenceQuery: typeof value.referenceQuery === 'string' ? value.referenceQuery.trim().slice(0, 80) : '',
      referenceVideoId: typeof value.referenceVideoId === 'string' && /^[\w-]{11}$/.test(value.referenceVideoId) ? value.referenceVideoId : null,
      programId: typeof value.programId === 'string' && value.programId ? value.programId : null,
    }
  } catch { return null }
}

export function saveMusicScoreSettings(projectId: string, settings: MusicScoreSettings): void {
  localStorage.setItem(scoreSettingsKey(projectId), JSON.stringify(settings))
}

export function clearMusicScoreSettings(projectId: string): void {
  localStorage.removeItem(scoreSettingsKey(projectId))
  localStorage.removeItem(setupKey(projectId))
}

export interface MusicFolder { id: string; name: string }
export interface MusicOrganization { folders: MusicFolder[]; placements: Record<string, string> }

export function loadMusicOrganization(): MusicOrganization {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ORGANIZATION_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object') return { folders: [], placements: {} }
    const value = raw as Record<string, unknown>
    const seen = new Set<string>()
    const folders = (Array.isArray(value.folders) ? value.folders : []).filter((folder): folder is MusicFolder => {
      if (!folder || typeof folder !== 'object') return false
      const item = folder as Record<string, unknown>
      if (typeof item.id !== 'string' || !item.id || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim()) return false
      seen.add(item.id)
      return true
    }).map(folder => ({ id: folder.id, name: folder.name.trim().slice(0, 60) }))
    const placements: Record<string, string> = {}
    if (value.placements && typeof value.placements === 'object') {
      for (const [scoreId, folderId] of Object.entries(value.placements)) {
        if (typeof folderId === 'string' && seen.has(folderId)) placements[scoreId] = folderId
      }
    }
    return { folders, placements }
  } catch { return { folders: [], placements: {} } }
}

export function saveMusicOrganization(organization: MusicOrganization): void {
  localStorage.setItem(ORGANIZATION_KEY, JSON.stringify(organization))
}

export function loadMusicOrder(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : []
  } catch { return [] }
}

export function saveMusicOrder(ids: string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify([...new Set(ids)]))
}

/** Newly imported scores follow the saved order until the musician moves them. */
export function orderMusic<T extends { id: string }>(items: T[], order: string[]): T[] {
  const positions = new Map(order.map((id, index) => [id, index]))
  return [...items].sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length))
}

export function loadMusicSetup(projectId: string): DeskSnapshot | null {
  try {
    const raw = localStorage.getItem(setupKey(projectId))
    const saved = raw ? normalizeDeskSnapshot(JSON.parse(raw)) : null
    if (saved) return saved
  } catch { /* A routine's saved setup remains a fallback. */ }
  return loadExerciseLibrary().find(item => item.step.projectId === projectId)?.step.desk ?? null
}

export function saveMusicSetup(projectId: string, desk: DeskSnapshot): void {
  localStorage.setItem(setupKey(projectId), JSON.stringify({ ...desk, mode: 'audio', showMusic: true }))
}
