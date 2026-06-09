import type { MediaType, SortMode, Take } from '../types'

export function createTake(
  id: string,
  index: number,
  videoUrl: string,
  filePath: string,
  videoMimeType: string,
  mediaType: MediaType = 'video',
): Take {
  return {
    id,
    name: mediaType === 'audio' ? `Audio ${index}` : `Take ${index}`,
    videoUrl,
    filePath,
    videoMimeType,
    thumbnailUrl: '',
    timestamp: Date.now(),
    rating: 0,
    notes: '',
    mediaType,
    mirrorPlayback: mediaType === 'video',
  }
}

export function sortTakes(takes: Take[], mode: SortMode): Take[] {
  const sorted = [...takes]
  if (mode === 'newest') {
    return sorted.sort((a, b) => b.timestamp - a.timestamp)
  }
  return sorted.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating
    return b.timestamp - a.timestamp
  })
}
