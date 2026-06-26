import type { LibraryItem } from '../types/library'
import { resolveLibraryPlaybackUrl } from './libraryStorage'

export type HydratedLibraryItem = LibraryItem & { playbackUrl: string }

export async function hydrateLibraryItem(item: LibraryItem): Promise<HydratedLibraryItem> {
  let playbackUrl = ''
  try {
    playbackUrl = await resolveLibraryPlaybackUrl(item.filePath, '')
  } catch {
    playbackUrl = ''
  }
  return { ...item, playbackUrl }
}

export async function hydrateLibraryItems(items: LibraryItem[]): Promise<HydratedLibraryItem[]> {
  return Promise.all(items.map((item) => hydrateLibraryItem(item)))
}

export function defaultLibraryItemName(item: LibraryItem, index: number): string {
  if (item.name.trim()) return item.name.trim()
  return `Reference ${index}`
}
