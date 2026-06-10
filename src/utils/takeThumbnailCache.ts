import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

const THUMBNAIL_DIR = 'thumbnails'

function thumbnailPath(takeId: string): string {
  return `${THUMBNAIL_DIR}/${takeId}.jpg`
}

export async function persistTakeThumbnail(
  takeId: string,
  dataUrl: string,
): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl

  await Filesystem.mkdir({
    path: THUMBNAIL_DIR,
    directory: Directory.Data,
    recursive: true,
  })

  const path = thumbnailPath(takeId)
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

export async function resolveCachedTakeThumbnail(takeId: string): Promise<string | null> {
  const path = thumbnailPath(takeId)

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

export async function deleteCachedTakeThumbnail(takeId: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: thumbnailPath(takeId),
      directory: Directory.Data,
    })
  } catch {
    /* already removed */
  }
}
