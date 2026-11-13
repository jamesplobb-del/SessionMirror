import { loadLastPracticeDestination } from './lastPracticeDestination'
import { loadMusicSetlists, type MusicSetlist } from './musicSetlists'

export type RecentMusic = { projectId: string; setlist?: { id: string; entryId: string } }
const STORAGE_KEY = 'besttake:recent-music:v1'

function loadRecentMusic(): RecentMusic | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (typeof value?.projectId === 'string' && value.projectId) {
      const { projectId, setlist } = value
      return typeof setlist?.id === 'string' && typeof setlist?.entryId === 'string'
        ? { projectId, setlist: { id: setlist.id, entryId: setlist.entryId } }
        : { projectId }
    }
  } catch { /* Ignore unreadable shortcut history. */ }
  const previous = loadLastPracticeDestination()
  return previous?.kind === 'music' ? { projectId: previous.projectId } : null
}

export function rememberRecentMusic(value: RecentMusic): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) }
  catch { /* Opening a score still works when history cannot be saved. */ }
}

export function resolveRecentMusic(canRead: (projectId: string) => boolean): {
  projectId: string
  setlist?: { list: MusicSetlist; entryId: string }
} | null {
  const recent = loadRecentMusic()
  if (!recent) return null
  if (recent.setlist) {
    const list = loadMusicSetlists().find(item => item.id === recent.setlist?.id)
    if (list) {
      const entry = list.entries.find(item => item.id === recent.setlist?.entryId && canRead(item.projectId))
        ?? list.entries.find(item => canRead(item.projectId))
      if (entry) return { projectId: entry.projectId, setlist: { list, entryId: entry.id } }
    }
  }
  return canRead(recent.projectId) ? { projectId: recent.projectId } : null
}
