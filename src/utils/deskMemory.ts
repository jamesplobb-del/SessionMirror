import type { RecordingMode } from '../types'
import type { AudioPracticeTab } from '../types/audioPractice'

/**
 * The last record surface the player left the app on. Read once at boot so
 * day two opens where day one ended — Camera, or Audio with the tool tab that
 * was open — instead of on a menu.
 *
 * `practice` (the metronome's Program view) is never restored: it is reached
 * from a tempo, not landed on, so it falls back to the metronome tab. Games
 * fall back to Record.
 */
export interface LastSurface {
  mode: RecordingMode
  tab: AudioPracticeTab
}

const STORAGE_KEY = 'sessionmirror:last-surface'

/** Games are never the first thing a sitting opens on; they wait behind Home. */
const RESTORABLE_TABS: ReadonlySet<AudioPracticeTab> = new Set(['audio', 'tuner', 'metronome'])

function parseTab(value: unknown): AudioPracticeTab {
  if (value === 'practice') return 'metronome'
  return typeof value === 'string' && RESTORABLE_TABS.has(value as AudioPracticeTab)
    ? (value as AudioPracticeTab)
    : 'audio'
}

export function loadLastSurface(): LastSurface {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { mode: 'video', tab: 'audio' }
    const parsed = JSON.parse(raw) as Partial<LastSurface>
    return {
      mode: parsed.mode === 'audio' ? 'audio' : 'video',
      tab: parseTab(parsed.tab),
    }
  } catch {
    return { mode: 'video', tab: 'audio' }
  }
}

export function saveLastSurface(surface: LastSurface): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: surface.mode, tab: parseTab(surface.tab) }),
    )
  } catch {
    /* private mode / quota */
  }
}
