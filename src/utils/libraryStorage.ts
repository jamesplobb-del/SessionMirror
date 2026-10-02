import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import {
  initAppFilesystem,
  LIBRARY_DIR,
  nativeDataFileExists,
} from './filesystemInit'
import {
  applyStrictPlaybackSrc,
  deleteTakeFile,
  normalizeBlobMime,
  NATIVE_AUDIO_MIME,
} from './takeStorage'

// Browser previews keep the audio for this session, just like imported scores.
// The repository still needs a nonempty file identity when saving its row.
const browserAudio = new Map<string, string>()
// An import already produced a verified playback URL. Reuse it for the next
// repository hydration once, then return to checking the native file on reads.
const postImportPlaybackUrl = new Map<string, string>()

export interface PersistedLibraryAudio {
  filePath: string
  playbackUrl: string
}

function extensionForAudioMime(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('audio/mp4') || mimeType.includes('m4a')) return 'm4a'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('aac')) return 'aac'
  if (mimeType.includes('aiff')) return 'aiff'
  if (mimeType.includes('flac')) return 'flac'
  if (mimeType.includes('caf')) return 'caf'
  return 'mp3'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read blob as base64'))
        return
      }
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

async function ensureLibraryDirectory(): Promise<void> {
  await initAppFilesystem()
}

/** Probe duration in whole seconds; returns 0 when metadata is unavailable. */
export async function probeAudioDurationSeconds(source: Blob | string): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    const cleanup = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      audio.load()
    }
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0
      cleanup()
      resolve(Math.max(0, duration))
    }
    audio.onerror = () => {
      cleanup()
      resolve(0)
    }
    audio.src = url
  })
}

export function normalizeLibraryAudioMime(mimeType: string): string {
  if (!mimeType || mimeType === 'application/octet-stream') return 'audio/mpeg'
  if (mimeType.includes('audio/mp4')) return NATIVE_AUDIO_MIME
  return mimeType
}

/** Persist imported audio under library/ — never under takes/. */
export async function persistLibraryAudio(
  blob: Blob,
  itemId: string,
  mimeType: string,
): Promise<PersistedLibraryAudio> {
  const writeMime = normalizeLibraryAudioMime(normalizeBlobMime(mimeType))
  const normalized =
    blob.type === writeMime ? blob : new Blob([blob], { type: writeMime })

  if (!Capacitor.isNativePlatform()) {
    const filePath = `${LIBRARY_DIR}/${encodeURIComponent(itemId)}.${extensionForAudioMime(writeMime)}`
    const previous = browserAudio.get(filePath)
    if (previous) URL.revokeObjectURL(previous)
    const playbackUrl = URL.createObjectURL(normalized)
    browserAudio.set(filePath, playbackUrl)
    return { filePath, playbackUrl }
  }

  await ensureLibraryDirectory()

  const ext = extensionForAudioMime(writeMime)
  const filePath = `${LIBRARY_DIR}/${itemId}.${ext}`

  postImportPlaybackUrl.delete(filePath)
  await deleteTakeFile(filePath)

  const base64 = await blobToBase64(normalized)
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
  postImportPlaybackUrl.set(filePath, playbackUrl)
  return { filePath, playbackUrl }
}

export async function resolveLibraryPlaybackUrl(
  filePath: string,
  fallbackUrl: string,
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return browserAudio.get(filePath) ?? fallbackUrl
  }

  if (fallbackUrl && !fallbackUrl.startsWith('file://')) {
    return applyStrictPlaybackSrc(fallbackUrl)
  }

  if (!filePath) return fallbackUrl

  const importedPlaybackUrl = postImportPlaybackUrl.get(filePath)
  if (importedPlaybackUrl) {
    postImportPlaybackUrl.delete(filePath)
    return applyStrictPlaybackSrc(importedPlaybackUrl)
  }

  try {
    const exists = await nativeDataFileExists(filePath)
    if (!exists) return fallbackUrl

    const { uri } = await Filesystem.getUri({
      path: filePath,
      directory: Directory.Data,
    })
    return applyStrictPlaybackSrc(uri)
  } catch {
    return fallbackUrl
  }
}

export async function deleteLibraryFile(filePath: string): Promise<void> {
  postImportPlaybackUrl.delete(filePath)
  if (!Capacitor.isNativePlatform()) {
    const url = browserAudio.get(filePath)
    if (url) URL.revokeObjectURL(url)
    browserAudio.delete(filePath)
    return
  }
  await deleteTakeFile(filePath)
}
