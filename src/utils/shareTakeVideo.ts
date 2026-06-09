import { Media } from '@capacitor-community/media'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { Take } from '../types'

/** Native file URI for saving a take to the photo library. */
async function resolveTakeSavePath(take: Take): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    if (take.filePath) {
      const { uri } = await Filesystem.getUri({
        path: take.filePath,
        directory: Directory.Data,
      })
      return uri
    }

    if (take.videoUrl && !take.videoUrl.startsWith('blob:')) {
      return take.videoUrl
    }

    return null
  }

  return take.videoUrl || null
}

function downloadTakeOnWeb(take: Take, url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${take.name.replace(/[^\w.-]+/g, '_') || 'take'}.mp4`
  anchor.click()
}

/** Saves the take video to the device photo library (native) or downloads it (web). */
export async function shareTakeVideo(take: Take): Promise<void> {
  const path = await resolveTakeSavePath(take)
  if (!path) return

  if (Capacitor.isNativePlatform()) {
    try {
      await Media.saveVideo({ path })
    } catch {
      /* Permission denied or save failed */
    }
    return
  }

  downloadTakeOnWeb(take, path)
}
