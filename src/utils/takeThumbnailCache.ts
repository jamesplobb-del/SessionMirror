import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { MediaType } from '../types'
import type { RecordingOrientation } from './takeVideoTransform'
import { THUMBNAIL_DIR, initAppFilesystem, isFilesystemMissingError } from './filesystemInit'

/** Paths confirmed absent this session — avoids repeat lookups. */
const missingThumbnailPaths = new Set<string>()

/** Filenames in thumbnails/ from a single readdir (avoids N native stat misses). */
let thumbnailIndexPromise: Promise<Set<string>> | null = null

export interface ThumbnailHealSource {
  filePath: string
  videoUrl?: string
  mediaType?: MediaType
  mirrorPreview?: boolean
}

function thumbnailFileName(
  takeId: string,
  orientation: RecordingOrientation = 'portrait',
): string {
  if (orientation === 'landscape') {
    return `${takeId}-landscape-v2.jpg`
  }
  return `${takeId}.jpg`
}

function thumbnailPath(takeId: string, orientation: RecordingOrientation = 'portrait'): string {
  return `${THUMBNAIL_DIR}/${thumbnailFileName(takeId, orientation)}`
}

function fileNameFromPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash >= 0 ? path.slice(slash + 1) : path
}

async function loadThumbnailIndex(): Promise<Set<string>> {
  await initAppFilesystem()

  try {
    const { files } = await Filesystem.readdir({
      path: THUMBNAIL_DIR,
      directory: Directory.Data,
    })

    const names = new Set<string>()
    for (const entry of files) {
      const name = typeof entry === 'string' ? entry : entry.name
      if (name) names.add(name)
    }
    return names
  } catch {
    return new Set()
  }
}

async function getThumbnailIndex(): Promise<Set<string>> {
  if (!thumbnailIndexPromise) {
    thumbnailIndexPromise = loadThumbnailIndex()
  }
  return thumbnailIndexPromise
}

/** Warm the thumbnail filename index before batch vault hydration. */
export async function primeThumbnailCacheIndex(): Promise<void> {
  await getThumbnailIndex()
}

export function invalidateThumbnailCacheIndex(): void {
  thumbnailIndexPromise = null
  missingThumbnailPaths.clear()
}

async function readCachedThumbnailUri(path: string): Promise<string | null> {
  if (missingThumbnailPaths.has(path)) {
    return null
  }

  const index = await getThumbnailIndex()
  const fileName = fileNameFromPath(path)

  if (!index.has(fileName)) {
    missingThumbnailPaths.add(path)
    return null
  }

  try {
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Data,
    })

    if (Capacitor.isNativePlatform()) {
      return Capacitor.convertFileSrc(uri)
    }

    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    })
    return `data:image/jpeg;base64,${data}`
  } catch (err) {
    if (isFilesystemMissingError(err)) {
      missingThumbnailPaths.add(path)
      index.delete(fileName)
    }
    return null
  }
}

async function healMissingThumbnail(
  takeId: string,
  recordingOrientation: RecordingOrientation,
  healSource?: ThumbnailHealSource,
): Promise<string | null> {
  if (!healSource?.filePath || healSource.mediaType === 'audio') {
    return null
  }

  const { regenerateTakeThumbnailFromVideo } = await import('./generateThumbnail')

  return regenerateTakeThumbnailFromVideo(takeId, healSource.filePath, {
    videoUrl: healSource.videoUrl,
    mirrorPreview: healSource.mirrorPreview,
    recordingOrientation,
  })
}

export async function persistTakeThumbnail(
  takeId: string,
  dataUrl: string,
  recordingOrientation: RecordingOrientation = 'portrait',
): Promise<string> {
  await initAppFilesystem()

  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const path = thumbnailPath(takeId, recordingOrientation)

  try {
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: base64,
    })
  } catch {
    return dataUrl
  }

  const index = await getThumbnailIndex()
  index.add(thumbnailFileName(takeId, recordingOrientation))
  missingThumbnailPaths.delete(path)

  try {
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Data,
    })
    return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(uri) : dataUrl
  } catch {
    return dataUrl
  }
}

export async function resolveCachedTakeThumbnail(
  takeId: string,
  recordingOrientation: RecordingOrientation = 'portrait',
  healSource?: ThumbnailHealSource,
): Promise<string | null> {
  if (recordingOrientation === 'landscape') {
    const landscapeThumb = await readCachedThumbnailUri(thumbnailPath(takeId, 'landscape'))
    if (landscapeThumb) return landscapeThumb

    const portraitThumb = await readCachedThumbnailUri(thumbnailPath(takeId, 'portrait'))
    if (portraitThumb) return portraitThumb

    return healMissingThumbnail(takeId, 'landscape', healSource)
  }

  const portraitThumb = await readCachedThumbnailUri(thumbnailPath(takeId, 'portrait'))
  if (portraitThumb) return portraitThumb

  return healMissingThumbnail(takeId, 'portrait', healSource)
}

export async function deleteCachedTakeThumbnail(takeId: string): Promise<void> {
  for (const orientation of ['portrait', 'landscape'] as const) {
    const path = thumbnailPath(takeId, orientation)
    missingThumbnailPaths.add(path)

    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      })
    } catch {
      /* already removed */
    }
  }

  invalidateThumbnailCacheIndex()
}
