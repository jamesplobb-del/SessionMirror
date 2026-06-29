import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import BestTakeAudioPlugin from './audioSessionRoute'
import { getTakeMediaType } from './mediaType'
import { prepareTakeVideoExportUri, prepareTakeVideoExportUrl } from './prepareTakeVideoExport'
import type { Take } from '../types'

const EXPORT_CACHE_DIR = 'export-cache'
const FALLBACK_NATIVE_EXPORT_AUDIO_GAIN = 2.75
const MAX_NATIVE_EXPORT_AUDIO_GAIN = 4.5

export type SaveTakeResult =
  | { ok: true }
  | { ok: false; reason: 'missing_file' | 'permission_denied' | 'save_failed' | 'unsupported' }

export type ShareTakeResult =
  | { ok: true }
  | { ok: false; reason: 'missing_file' | 'share_failed' }

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
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${take.name.replace(/[^\w.-]+/g, '_') || 'take'}.mp4`
  anchor.click()
  return { ok: true }
}

function resolveNativeExportAudioGain(take: Take): number {
  const suggestedGainDb = take.playbackGainMetadata?.suggestedGainDb
  if (typeof suggestedGainDb === 'number' && Number.isFinite(suggestedGainDb) && suggestedGainDb > 0) {
    return Math.min(MAX_NATIVE_EXPORT_AUDIO_GAIN, Math.max(1, 10 ** (suggestedGainDb / 20)))
  }
  return FALLBACK_NATIVE_EXPORT_AUDIO_GAIN
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
    const exportUrl = await prepareTakeVideoExportUrl(take)
    if (!exportUrl) return { ok: false, reason: 'missing_file' }
    const result = downloadTakeOnWeb(take, exportUrl)
    if (exportUrl.startsWith('blob:')) {
      window.setTimeout(() => URL.revokeObjectURL(exportUrl), 60_000)
    }
    return result
  }

  let path = await resolveNativeFileUri(take)
  if (!path) {
    return { ok: false, reason: 'missing_file' }
  }

  try {
    const orientedPath = await prepareTakeVideoExportUri(take)
    if (orientedPath) {
      path = orientedPath
    }
  } catch {
    /* fall back to the raw take file */
  }

  try {
    const audioGain = resolveNativeExportAudioGain(take)
    if (Capacitor.getPlatform() === 'ios') {
      await BestTakeAudioPlugin.saveVideoToPhotos({ path, audioGain })
    } else {
      const { Media } = await import('@capacitor-community/media')
      await Media.saveVideo({ path })
    }
    return { ok: true }
  } catch (firstError) {
    if (take.filePath) {
      try {
        const cacheUri = await copyTakeToExportCache(take.filePath)
        const audioGain = resolveNativeExportAudioGain(take)
        if (Capacitor.getPlatform() === 'ios') {
          await BestTakeAudioPlugin.saveVideoToPhotos({ path: cacheUri, audioGain })
        } else {
          const { Media } = await import('@capacitor-community/media')
          await Media.saveVideo({ path: cacheUri })
        }
        return { ok: true }
      } catch {
        /* fall through to classified error */
      }
    }

    return classifySaveError(firstError)
  }
}

/** Opens the native system share sheet for an existing take file. */
export async function shareTakeToSystem(take: Take): Promise<ShareTakeResult> {
  let url: string | null = null

  if (Capacitor.isNativePlatform()) {
    url = await resolveNativeFileUri(take)
    if (url) {
      try {
        const orientedUrl = await prepareTakeVideoExportUri(take)
        if (orientedUrl) url = orientedUrl
      } catch {
        /* Share the raw take if orientation export is unavailable. */
      }
    }
  } else {
    url = await prepareTakeVideoExportUrl(take)
  }

  if (!url) {
    return { ok: false, reason: 'missing_file' }
  }

  try {
    if (Capacitor.getPlatform() === 'ios') {
      await BestTakeAudioPlugin.shareMediaFile({
        path: url,
        title: take.name || 'SessionMirror Take',
        audioGain: resolveNativeExportAudioGain(take),
      })
    } else {
      await Share.share({
        title: take.name || 'SessionMirror Take',
        text: take.name || 'SessionMirror Take',
        url,
        dialogTitle: 'Share Take',
      })
    }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel|dismiss|abort/i.test(message)) {
      return { ok: true }
    }
    return { ok: false, reason: 'share_failed' }
  } finally {
    if (!Capacitor.isNativePlatform() && url.startsWith('blob:')) {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  }
}
