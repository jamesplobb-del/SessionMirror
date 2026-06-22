import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { initAppFilesystem } from '../filesystemInit'
import { resolveMediaPlaybackSrc } from '../mediaPlayback'
import { buildStarterPackTracks } from './starterPack'
import type { Mp3VaultTrack } from './types'

const BACKING_TRACKS_DIR = 'backing-tracks'
const VAULT_STORAGE_KEY = 'sessionmirror:mp3-vault'

interface StoredImportedTrack {
  id: string
  title: string
  filePath: string
  playbackUrl: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read blob'))
        return
      }
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

function loadImportedIndex(): StoredImportedTrack[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredImportedTrack[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveImportedIndex(tracks: StoredImportedTrack[]): void {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(tracks))
  } catch {
    /* quota / private mode */
  }
}

async function ensureBackingTracksDirectory(): Promise<void> {
  await initAppFilesystem()
  try {
    await Filesystem.mkdir({
      path: BACKING_TRACKS_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    /* already exists */
  }
}

function importedToVaultTrack(entry: StoredImportedTrack): Mp3VaultTrack {
  return {
    id: entry.id,
    title: entry.title,
    playbackUrl: resolveMediaPlaybackSrc(entry.playbackUrl),
    filePath: entry.filePath,
    source: 'imported',
  }
}

/** Starter pack + persisted imports. */
export function listMp3VaultTracks(): Mp3VaultTrack[] {
  const starter = buildStarterPackTracks()
  const imported = loadImportedIndex().map(importedToVaultTrack)
  return [...starter, ...imported]
}

export async function persistImportedMp3(file: File): Promise<Mp3VaultTrack> {
  const id = crypto.randomUUID()
  const title = file.name.replace(/\.[^.]+$/, '') || 'Imported Track'
  const mimeType = file.type || 'audio/mpeg'

  if (!Capacitor.isNativePlatform()) {
    const playbackUrl = URL.createObjectURL(file)
    const entry: StoredImportedTrack = {
      id,
      title,
      filePath: '',
      playbackUrl,
    }
    const next = [...loadImportedIndex(), entry]
    saveImportedIndex(next)
    return importedToVaultTrack(entry)
  }

  await ensureBackingTracksDirectory()

  const ext = mimeType.includes('mpeg') || file.name.endsWith('.mp3') ? 'mp3' : 'm4a'
  const filePath = `${BACKING_TRACKS_DIR}/${id}.${ext}`
  const base64 = await blobToBase64(file)

  await Filesystem.writeFile({
    path: filePath,
    data: base64,
    directory: Directory.Data,
  })

  const { uri } = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Data,
  })

  const playbackUrl = Capacitor.convertFileSrc(uri)
  const entry: StoredImportedTrack = {
    id,
    title,
    filePath,
    playbackUrl,
  }
  const next = [...loadImportedIndex(), entry]
  saveImportedIndex(next)
  return importedToVaultTrack(entry)
}

export async function filterAvailableStarterTracks(
  tracks: Mp3VaultTrack[],
): Promise<Mp3VaultTrack[]> {
  const results: Mp3VaultTrack[] = []

  for (const track of tracks) {
    if (track.source === 'imported') {
      results.push(track)
      continue
    }

    try {
      const response = await fetch(track.playbackUrl, { method: 'HEAD' })
      if (response.ok) {
        results.push(track)
      }
    } catch {
      /* starter asset missing — skip */
    }
  }

  return results
}
