import type { Take } from '../types'
import { resolveTakePlaybackUrl } from '../utils/takeStorage'
import { resolveCachedTakeThumbnail } from '../utils/takeThumbnailCache'
import { agentDebugLog } from '../utils/agentDebugLog'
import { getTakesByProject } from './vaultRepository'
import type { VaultTake } from './types'

function defaultTakeName(vaultTake: VaultTake, index: number): string {
  if (vaultTake.name.trim()) return vaultTake.name
  return vaultTake.mediaType === 'audio' ? `Audio ${index}` : `Take ${index}`
}

export async function loadUiTakesForProject(projectId: string): Promise<Take[]> {
  const rows = await getTakesByProject(projectId)
  return uiTakesFromVaultRows(rows)
}

export function vaultTakeToUiTake(
  vaultTake: VaultTake,
  index: number,
  videoUrl: string,
  thumbnailUrl = '',
): Take {
  return {
    id: vaultTake.id,
    name: defaultTakeName(vaultTake, index),
    videoUrl,
    filePath: vaultTake.filePath,
    videoMimeType: vaultTake.mimeType,
    thumbnailUrl,
    timestamp: vaultTake.createdAt,
    rating: vaultTake.rating,
    notes: vaultTake.notes,
    mediaType: vaultTake.mediaType,
    mirrorPlayback: vaultTake.mediaType === 'video',
    recordingOrientation: vaultTake.recordingOrientation ?? 'portrait',
  }
}

/** Metadata-only — no filesystem / URL work (fast cold start). */
export function uiTakesFromVaultRowsFast(rows: VaultTake[]): Take[] {
  const chronological = [...rows].reverse()
  return chronological
    .map((row, index) => vaultTakeToUiTake(row, index + 1, '', ''))
    .reverse()
}

export async function uiTakesFromVaultRows(rows: VaultTake[]): Promise<Take[]> {
  const chronological = [...rows].reverse()

  const takes = await Promise.all(
    chronological.map(async (row, index) => {
      const videoUrl = await resolveTakePlaybackUrl(row.filePath, '')
      const cachedThumbnail = await resolveCachedTakeThumbnail(
        row.id,
        row.recordingOrientation ?? 'portrait',
      )
      return vaultTakeToUiTake(row, index + 1, videoUrl, cachedThumbnail ?? '')
    }),
  )

  // #region agent log
  agentDebugLog(
    'takeBridge.ts:uiTakesFromVaultRows',
    'takes loaded from vault',
    {
      rowCount: rows.length,
      cacheHits: takes.filter((t) => t.thumbnailUrl.length > 0).length,
      cacheMisses: takes.filter((t) => t.thumbnailUrl.length === 0 && t.mediaType === 'video')
        .length,
      landscapeCount: takes.filter((t) => t.recordingOrientation === 'landscape').length,
    },
    'H-V3',
  )
  // #endregion

  return takes.reverse()
}

export function findBestTakeId(rows: VaultTake[]): string | null {
  return rows.find((row) => row.isBestTake)?.id ?? null
}
