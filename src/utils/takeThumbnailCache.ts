import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { RecordingOrientation } from './takeVideoTransform'

const THUMBNAIL_DIR = 'thumbnails'

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
  } catch {
    return null
  }

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Data,
  })

  if (Capacitor.isNativePlatform()) {
    return Capacitor.convertFileSrc(uri)
  }

  try {
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    })
    return `data:image/jpeg;base64,${data}`
  } catch {
    return null
  }
}

export async function persistTakeThumbnail(
  takeId: string,
  dataUrl: string,
  recordingOrientation: RecordingOrientation = 'portrait',
): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

  await Filesystem.mkdir({
    path: THUMBNAIL_DIR,
    directory: Directory.Data,
    recursive: true,
  })

  const path = thumbnailPath(takeId, recordingOrientation)
  await Filesystem.writeFile({
    path,
    directory: Directory.Data,
    data: base64,
  })

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Data,
  })

  return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(uri) : dataUrl
}

export async function resolveCachedTakeThumbnail(
  takeId: string,
  recordingOrientation: RecordingOrientation = 'portrait',
): Promise<string | null> {
  if (recordingOrientation === 'landscape') {
    const landscapeThumb = await readThumbnailUri(thumbnailPath(takeId, 'landscape'))
    if (landscapeThumb) return landscapeThumb
    // Ignore legacy portrait-path caches for landscape takes — they show wrong crops.
    return null
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
