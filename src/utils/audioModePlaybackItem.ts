import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from './takeStorage'
import type { AudioModePlaybackItem } from '../context/AudioModePlaybackContext'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'

export function buildAudioModePlaybackItem({
  tone,
  take,
  libraryPlayback,
  resolvedMediaUrl,
}: {
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
  resolvedMediaUrl?: string | null
}): AudioModePlaybackItem | null {
  const mediaUrl = resolvedMediaUrl ?? libraryPlayback?.playbackUrl ?? take?.videoUrl ?? ''
  const filePath = libraryPlayback?.filePath ?? take?.filePath ?? ''
  if (!mediaUrl && !filePath) return null

  return {
    id: libraryPlayback ? `library:${libraryPlayback.id}` : `take:${take?.id ?? tone}`,
    takeId: take?.id,
    name: libraryPlayback?.name ?? take?.name ?? (tone === 'best' ? 'Best Take' : 'Current Take'),
    filePath,
    mediaUrl,
    mimeType:
      libraryPlayback?.mimeType ??
      take?.videoMimeType ??
      (take?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME),
  }
}
