/** The last practice context the player deliberately opened from Home or Music. */
export type LastPracticeDestination =
  | { kind: 'routine'; routineId: string }
  | { kind: 'music'; projectId: string }

const STORAGE_KEY = 'sessionmirror:last-practice-destination'

export function loadLastPracticeDestination(): LastPracticeDestination | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    if (item.kind === 'routine' && typeof item.routineId === 'string' && item.routineId) {
      return { kind: 'routine', routineId: item.routineId }
    }
    if (item.kind === 'music' && typeof item.projectId === 'string' && item.projectId) {
      return { kind: 'music', projectId: item.projectId }
    }
  } catch { /* Storage may be unavailable or contain an older value. */ }
  return null
}

export function saveLastPracticeDestination(value: LastPracticeDestination): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) }
  catch { /* Keep the in-memory destination for this session. */ }
}
