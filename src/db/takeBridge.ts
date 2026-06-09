import type { Take } from '../types'
import { resolveTakePlaybackUrl } from '../utils/takeStorage'
import { getTakesByProject } from './vaultRepository'
import type { VaultTake } from './types'

function defaultTakeName(vaultTake: VaultTake, index: number): string {
  if (vaultTake.name.trim()) return vaultTake.name
  return vaultTake.mediaType === 'audio' ? `Audio ${index}` : `Take ${index}`
}

export async function loadUiTakesForProject(projectId: string): Promise<Take[]> {
  const rows = await getTakesByProject(projectId)
  const chronological = [...rows].reverse()

  const takes = await Promise.all(
    chronological.map(async (row, index) => {
      const videoUrl = await resolveTakePlaybackUrl(row.filePath, '')
      return vaultTakeToUiTake(row, index + 1, videoUrl)
    }),
  )

  return takes.reverse()
}

export function vaultTakeToUiTake(
  vaultTake: VaultTake,
  index: number,
  videoUrl: string,
): Take {
  return {
    id: vaultTake.id,
    name: defaultTakeName(vaultTake, index),
    videoUrl,
    filePath: vaultTake.filePath,
    videoMimeType: vaultTake.mimeType,
    thumbnailUrl: '',
    timestamp: vaultTake.createdAt,
    rating: vaultTake.rating,
    notes: vaultTake.notes,
    mediaType: vaultTake.mediaType,
    mirrorPlayback: vaultTake.mediaType === 'video',
  }
}

export function findBestTakeId(rows: VaultTake[]): string | null {
  return rows.find((row) => row.isBestTake)?.id ?? null
}
