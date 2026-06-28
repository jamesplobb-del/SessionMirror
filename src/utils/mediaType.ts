import type { MediaType, Take } from '../types'

export function getTakeMediaType(take: Take): MediaType {
  return take.mediaType ?? 'video'
}

export function isAudioTake(take: Take): boolean {
  return getTakeMediaType(take) === 'audio'
}

export function isAudioMedia(mimeType: string, mediaType?: MediaType): boolean {
  return mediaType === 'audio' || mimeType.startsWith('audio/')
}

export function inferMediaTypeFromMime(mimeType: string): MediaType {
  return mimeType.startsWith('audio/') ? 'audio' : 'video'
}

/** Placeholder thumbnail for audio takes (light elevated surface). */
export const AUDIO_TAKE_THUMBNAIL =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F7A600"/>
          <stop offset="100%" stop-color="#1598FF"/>
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="#F7F8FA"/>
      <rect x="0.5" y="0.5" width="319" height="179" fill="none" stroke="#E4E7EE"/>
      <rect x="148" y="58" width="24" height="40" rx="12" fill="none" stroke="url(#g)" stroke-width="2"/>
      <path d="M138 102a22 22 0 0 0 44 0" fill="none" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
      <line x1="160" y1="102" x2="160" y2="118" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
      <line x1="148" y1="118" x2="172" y2="118" stroke="url(#g)" stroke-width="2" stroke-linecap="round"/>
    </svg>`,
  )
