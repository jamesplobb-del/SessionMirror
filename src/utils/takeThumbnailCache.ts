import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { RecordingOrientation } from './takeVideoTransform'
import { THUMBNAIL_DIR, initAppFilesystem, isFilesystemMissingError } from './filesystemInit'

function thumbnailPath(takeId: string, orientation: RecordingOrientation = 'portrait'): string {
  if (orientation === 'landscape') {
    return `${THUMBNAIL_DIR}/${takeId}-landscape-v2.jpg`
  }
  return `${THUMBNAIL_DIR}/${takeId}.jpg`
}

async function readThumbnailUri(path: string): Promise<string | null> {
  try {
    await Filesystem.stat({
      path,
      directory: Directory.Data,
    })
  } catch (err) {
    if (isFilesystemMissingError(err)) {
      return null
    }
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
      return null
    }
    return null
  }
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
): Promise<string | null> {
  if (recordingOrientation === 'landscape') {
    const landscapeThumb = await readThumbnailUri(thumbnailPath(takeId, 'landscape'))
    if (landscapeThumb) return landscapeThumb
    return readThumbnailUri(thumbnailPath(takeId, 'portrait'))
  }

  return readThumbnailUri(thumbnailPath(takeId, 'portrait'))
}

export async function deleteCachedTakeThumbnail(takeId: string): Promise<void> {
  for (const path of [thumbnailPath(takeId, 'portrait'), thumbnailPath(takeId, 'landscape')]) {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      })
    } catch {
      /* already removed */
    }
  }
}
