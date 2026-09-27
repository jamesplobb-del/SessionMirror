const DEVELOPER_NOTE_KEY = 'besttake:developer-note-seen:v1'

export function hasSeenDeveloperNote(): boolean {
  try { return localStorage.getItem(DEVELOPER_NOTE_KEY) === '1' }
  catch { return false }
}

export function markDeveloperNoteSeen(): void {
  try { localStorage.setItem(DEVELOPER_NOTE_KEY, '1') }
  catch { /* The note can still be dismissed when storage is unavailable. */ }
}
