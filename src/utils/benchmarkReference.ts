import type { Take } from '../types'
import type {
  BenchmarkBinding,
  LibraryPlaybackReference,
} from '../types/library'
import type { HydratedLibraryItem } from './libraryBridge'

export function libraryItemToPlaybackRef(
  item: HydratedLibraryItem,
): LibraryPlaybackReference {
  return {
    id: item.id,
    name: item.name,
    playbackUrl: item.playbackUrl,
    filePath: item.filePath,
    mimeType: item.mimeType,
    duration: item.duration,
  }
}

export interface ResolvedBenchmarkPlayback {
  take: Take | null
  libraryPlayback: LibraryPlaybackReference | null
}

/** Thin resolver — library items are never fabricated as Take rows. */
export function resolveBenchmarkPlayback(
  binding: BenchmarkBinding | null,
  benchmarkId: string | null,
  takes: Take[],
  libraryItems: HydratedLibraryItem[],
): ResolvedBenchmarkPlayback {
  if (binding?.source === 'library') {
    const item = libraryItems.find((entry) => entry.id === binding.refId)
    if (item && (item.playbackUrl || item.filePath)) {
      return {
        take: null,
        libraryPlayback: libraryItemToPlaybackRef(item),
      }
    }
  }

  const take = benchmarkId ? takes.find((entry) => entry.id === benchmarkId) ?? null : null
  return { take, libraryPlayback: null }
}

export function hasBenchmarkReference(
  youtubeUrl: string | null,
  resolved: ResolvedBenchmarkPlayback,
): boolean {
  if (youtubeUrl) return true
  if (resolved.libraryPlayback) return true
  return Boolean(resolved.take?.videoUrl || resolved.take?.filePath)
}
