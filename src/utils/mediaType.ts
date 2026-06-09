import type { MediaType, Take } from '../types'

export function getTakeMediaType(take: Take): MediaType {
  return take.mediaType ?? 'video'
}

export function isAudioTake(take: Take): boolean {
  return getTakeMediaType(take) === 'audio'
}

export function inferMediaTypeFromMime(mimeType: string): MediaType {
  return mimeType.startsWith('audio/') ? 'audio' : 'video'
}

/** Placeholder thumbnail for audio takes (mic on dark background). */
export const AUDIO_TAKE_THUMBNAIL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <rect width="320" height="180" fill="#1c1917"/>
      <circle cx="160" cy="90" r="28" fill="none" stroke="#a8a29e" stroke-width="2"/>
      <rect x="152" y="62" width="16" height="32" rx="8" fill="#a8a29e"/>
      <path d="M148 98 Q160 112 172 98" fill="none" stroke="#a8a29e" stroke-width="2"/>
      <line x1="160" y1="112" x2="160" y2="124" stroke="#a8a29e" stroke-width="2"/>
      <line x1="148" y1="124" x2="172" y2="124" stroke="#a8a29e" stroke-width="2"/>
    </svg>`,
  )
