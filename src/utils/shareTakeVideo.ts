import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Take } from '../types'

/** Native file URI suitable for Share.share({ url }). */
async function resolveTakeShareUrl(take: Take): Promise<string | null> {
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

/** Opens the native share sheet so the user can save to Camera Roll or share elsewhere. */
export async function shareTakeVideo(take: Take): Promise<void> {
  const url = await resolveTakeShareUrl(take)
  if (!url) return

  try {
    await Share.share({
      title: take.name,
      url,
      dialogTitle: `Export ${take.name}`,
    })
  } catch {
    /* User dismissed the share sheet */
  }
}
