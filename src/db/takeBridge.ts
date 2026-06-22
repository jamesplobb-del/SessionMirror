import type { Take } from '../types'
import { resolveTakePlaybackUrl } from '../utils/takeStorage'
import {
  primeThumbnailCacheIndex,
  resolveCachedTakeThumbnail,
} from '../utils/takeThumbnailCache'
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

async function hydrateVaultTakeRow(
  row: VaultTake,
  index: number,
  options: { resolveThumbnail?: boolean } = {},
): Promise<Take> {
  const { resolveThumbnail = true } = options
  let videoUrl = ''
  let cachedThumbnail: string | null = null

  try {
    videoUrl = await resolveTakePlaybackUrl(row.filePath, '')
  } catch {
    videoUrl = ''
  }

  if (resolveThumbnail && row.mediaType === 'video') {
    try {
      cachedThumbnail = await resolveCachedTakeThumbnail(
        row.id,
        row.recordingOrientation ?? 'portrait',
        {
          filePath: row.filePath,
          videoUrl,
          mediaType: row.mediaType,
          mirrorPreview: true,
        },
      )
    } catch {
      cachedThumbnail = null
    }
  }

  return vaultTakeToUiTake(row, index, videoUrl, cachedThumbnail ?? '')
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

export interface HydrateVaultTakesOptions {
  batchSize?: number
  priorityIds?: string[]
  onBatch?: (takes: Take[]) => void
}

/** Resolve playback URLs in small batches so boot does not block the main thread. */
export async function hydrateVaultTakeRowsProgressive(
  rows: VaultTake[],
  options: HydrateVaultTakesOptions = {},
): Promise<Take[]> {
  const { batchSize = 3, priorityIds = [], onBatch } = options
  await primeThumbnailCacheIndex()

  const chronological = [...rows].reverse()
  const indexed = chronological.map((row, index) => ({ row, index: index + 1 }))
  const prioritySet = new Set(priorityIds.filter(Boolean))

  const ordered = [
    ...indexed.filter((entry) => prioritySet.has(entry.row.id)),
    ...indexed.filter((entry) => !prioritySet.has(entry.row.id)),
  ]

  const hydratedById = new Map<string, Take>()

  for (let offset = 0; offset < ordered.length; offset += batchSize) {
    const batch = ordered.slice(offset, offset + batchSize)
    const batchTakes = await Promise.all(
      batch.map(({ row, index }) =>
        hydrateVaultTakeRow(row, index, { resolveThumbnail: false }),
      ),
    )

    for (let i = 0; i < batch.length; i += 1) {
      hydratedById.set(batch[i].row.id, batchTakes[i])
    }

    const partial = chronological
      .map((row, index) => hydratedById.get(row.id) ?? vaultTakeToUiTake(row, index + 1, '', ''))
      .reverse()

    onBatch?.(partial)
    await yieldToMainThread()
  }

  return chronological
    .map((row, index) => hydratedById.get(row.id) ?? vaultTakeToUiTake(row, index + 1, '', ''))
    .reverse()
}

export async function uiTakesFromVaultRows(rows: VaultTake[]): Promise<Take[]> {
  return hydrateVaultTakeRowsProgressive(rows)
}

export function findBestTakeId(rows: VaultTake[]): string | null {
  return rows.find((row) => row.isBestTake)?.id ?? null
}
