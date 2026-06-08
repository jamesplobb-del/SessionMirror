import { Capacitor } from '@capacitor/core'
import { sanitizeNativeVideoSrc, toCapacitorPlaybackSrc } from './takeStorage'

const THUMBNAIL_SEEK_SECONDS = 0.1

export function generateThumbnailFromBlob(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  return captureThumbnailFromVideoUrl(url).finally(() => {
    URL.revokeObjectURL(url)
  })
}

export async function generateThumbnailFromUrl(videoUrl: string): Promise<string> {
  const url = Capacitor.isNativePlatform()
    ? (sanitizeNativeVideoSrc(await toCapacitorPlaybackSrc(videoUrl)) ?? '')
    : videoUrl

  if (!url) {
    throw new Error('Unable to resolve native video URL for thumbnail')
  }

  return captureThumbnailFromVideoUrl(url)
}

function captureThumbnailFromVideoUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.disablePictureInPicture = true
    video.preload = 'metadata'

    if (url.startsWith('file://')) {
      reject(new Error('Refusing raw file:// URL for thumbnail capture'))
      return
    }

    video.src = url

    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 180
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          cleanup()
          reject(new Error('Canvas context unavailable'))
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        cleanup()
        resolve(dataUrl)
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    video.addEventListener('error', () => {
      cleanup()
      reject(new Error('Thumbnail video failed to load'))
    })

    video.addEventListener('loadedmetadata', () => {
      const seekTarget = Math.min(
        THUMBNAIL_SEEK_SECONDS,
        Math.max(0, (video.duration || THUMBNAIL_SEEK_SECONDS) - 0.01),
      )
      video.currentTime = seekTarget
    })

    video.addEventListener('seeked', captureFrame, { once: true })
    video.load()
  })
}
