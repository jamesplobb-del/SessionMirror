import type { Mp3VaultTrack } from './types'

/** Bundled starter tracks — add MP3 files under public/assets/starter-pack/. */
export const STARTER_PACK_MANIFEST: ReadonlyArray<{ id: string; title: string; fileName: string }> =
  [
    { id: 'warmup-groove', title: 'Warmup Groove', fileName: 'warmup-groove.mp3' },
    { id: 'slow-blues', title: 'Slow Blues Backing', fileName: 'slow-blues.mp3' },
    { id: 'funk-loop', title: 'Funk Loop', fileName: 'funk-loop.mp3' },
  ]

export function buildStarterPackTracks(): Mp3VaultTrack[] {
  return STARTER_PACK_MANIFEST.map((entry) => ({
    id: `starter-${entry.id}`,
    title: entry.title,
    playbackUrl: `/assets/starter-pack/${entry.fileName}`,
    filePath: '',
    source: 'starter',
  }))
}
