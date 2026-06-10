import { Media } from '@capacitor-community/media'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import {
  downloadTransformedTakeOnWeb,
  prepareTakeVideoForPhotosExport,
  takeNeedsPhotosExportTransform,
} from './exportTakeVideo'
import { getTakeMediaType } from './mediaType'
import type { Take } from '../types'

const EXPORT_CACHE_DIR = 'export-cache'

export type SaveTakeResult =
  | { ok: true }
  | { ok: false; reason: 'missing_file' | 'permission_denied' | 'save_failed' | 'unsupported' }

function classifySaveError(err: unknown): SaveTakeResult {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null
        ? JSON.stringify(err)
        : String(err)

  if (
    message.includes('accessDenied') ||
    message.toLowerCase().includes('not allowed') ||
    message.toLowerCase().includes('permission')
  ) {
    return { ok: false, reason: 'permission_denied' }
  }

  return { ok: false, reason: 'save_failed' }
}

/** Copy take from app data to cache — Photos export needs a plain file:// URI. */
async function copyTakeToExportCache(relativeFilePath: string): Promise<string> {
  const fileName = relativeFilePath.split('/').pop() ?? `take-${Date.now()}.mp4`
  const cachePath = `${EXPORT_CACHE_DIR}/${fileName}`

  await Filesystem.mkdir({
    path: EXPORT_CACHE_DIR,
    directory: Directory.Cache,
    recursive: true,
  })

  const { data } = await Filesystem.readFile({
    path: relativeFilePath,
    directory: Directory.Data,
  })

  await Filesystem.writeFile({
    path: cachePath,
    directory: Directory.Cache,
    data,
  })

  const { uri } = await Filesystem.getUri({
    path: cachePath,
    directory: Directory.Cache,
  })

  return uri
}

/** Native file:// URI for Media.saveVideo — never pass capacitor:// playback URLs. */
async function resolveNativeFileUri(take: Take): Promise<string | null> {
  if (take.filePath) {
    try {
      await Filesystem.stat({
        path: take.filePath,
        directory: Directory.Data,
      })

      const { uri } = await Filesystem.getUri({
        path: take.filePath,
        directory: Directory.Data,
      })

      if (uri.startsWith('file://')) {
        return uri
      }

      return copyTakeToExportCache(take.filePath)
    } catch {
      return null
    }
  }

  if (take.videoUrl?.startsWith('file://')) {
    return take.videoUrl
  }

  return null
}

function downloadTakeOnWeb(take: Take, url: string): SaveTakeResult {
  const transform = takeNeedsPhotosExportTransform(take)
  if (transform) {
    void downloadTransformedTakeOnWeb(take.name, take.filePath, take.videoUrl, transform).catch(
      () => {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${take.name.replace(/[^\w.-]+/g, '_') || 'take'}.mp4`
        anchor.click()
      },
    )
    return { ok: true }
  }

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${take.name.replace(/[^\w.-]+/g, '_') || 'take'}.mp4`
  anchor.click()
  return { ok: true }
}

export function describeSaveTakeResult(result: SaveTakeResult): string | null {
  if (result.ok) return 'Saved to Photos.'

  switch (result.reason) {
    case 'permission_denied':
      return 'Photos access is required. Open Settings → BestTake → Photos and allow Add Photos Only.'
    case 'missing_file':
      return 'This take could not be found on your device.'
    case 'unsupported':
      return 'Only video takes can be saved to Photos.'
    default:
      return 'Could not save video. Please try again.'
  }
}

export interface BulkSaveTakesResult {
  saved: number
  failed: number
  skipped: number
}

/** Saves multiple video takes to Photos / downloads on web. */
export async function shareTakeVideos(takes: Take[]): Promise<BulkSaveTakesResult> {
  let saved = 0
  let failed = 0
  let skipped = 0

  for (const take of takes) {
    if (getTakeMediaType(take) !== 'video') {
      skipped += 1
      continue
    }

    const result = await shareTakeVideo(take)
    if (result.ok) {
      saved += 1
    } else if (result.reason === 'unsupported') {
      skipped += 1
    } else {
      failed += 1
    }
  }

  return { saved, failed, skipped }
}

export function describeBulkSaveResult(result: BulkSaveTakesResult): string | null {
  if (result.saved === 0 && result.failed === 0 && result.skipped === 0) {
    return null
  }

  const parts: string[] = []
  if (result.saved > 0) {
    parts.push(
      `Saved ${result.saved} video${result.saved === 1 ? '' : 's'} to Photos.`,
    )
  }
  if (result.skipped > 0) {
    parts.push(`Skipped ${result.skipped} audio take${result.skipped === 1 ? '' : 's'}.`)
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} could not be saved.`)
  }

  return parts.join(' ')
}

/** Saves a video take to the device photo library (native) or downloads it (web). */
export async function shareTakeVideo(take: Take): Promise<SaveTakeResult> {
  if (getTakeMediaType(take) !== 'video') {
    return { ok: false, reason: 'unsupported' }
  }

  if (!Capacitor.isNativePlatform()) {
    const url = take.videoUrl || null
    if (!url) return { ok: false, reason: 'missing_file' }
    return downloadTakeOnWeb(take, url)
  }

  const path = await resolveNativeFileUri(take)
  if (!path) {
    return { ok: false, reason: 'missing_file' }
  }

  const transform = takeNeedsPhotosExportTransform(take)

  try {
    if (transform) {
      const preparedPath = await prepareTakeVideoForPhotosExport(
        take.id,
        take.filePath,
        take.videoUrl,
        transform,
      )
      if (preparedPath) {
        await Media.saveVideo({ path: preparedPath })
        return { ok: true }
      }
    }

    await Media.saveVideo({ path })
    return { ok: true }
  } catch (firstError) {
    if (take.filePath) {
      try {
        const cacheUri = await copyTakeToExportCache(take.filePath)
        await Media.saveVideo({ path: cacheUri })
        return { ok: true }
      } catch {
        /* fall through to classified error */
      }
    }

    return classifySaveError(firstError)
  }
}
