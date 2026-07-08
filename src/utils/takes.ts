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
    mirrorPlayback: false,
  }
}

/** True when a take can be shown in PiP / review (URL and/or on-disk path). */
export function takeHasPlaybackMedia(
  take: Pick<Take, 'videoUrl' | 'filePath'> | null | undefined,
): boolean {
  return Boolean(take?.videoUrl || take?.filePath)
}

/**
 * Merge vault hydration with in-memory takes — keeps local-only recordings and
 * preserves playback URLs when hydration rows are still metadata-only.
 */
export function mergeHydratedTakes(local: Take[], hydrated: Take[]): Take[] {
  const hydratedById = new Map(hydrated.map((take) => [take.id, take]))
  const localOnly = local.filter((take) => !hydratedById.has(take.id))

  const merged = hydrated.map((remote) => {
    const prior = local.find((take) => take.id === remote.id)
    if (!prior) return remote

    return {
      ...remote,
      videoUrl: remote.videoUrl || prior.videoUrl,
      thumbnailUrl: remote.thumbnailUrl || prior.thumbnailUrl,
      mirrorPlayback: prior.mirrorPlayback !== undefined ? prior.mirrorPlayback : remote.mirrorPlayback,
    }
  })

  return localOnly.length > 0 ? [...merged, ...localOnly] : merged
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
