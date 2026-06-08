const THUMBNAIL_SEEK_SECONDS = 0.1

export function generateThumbnailFromBlob(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  return captureThumbnailFromVideoUrl(url).finally(() => {
    URL.revokeObjectURL(url)
  })
}

export function generateThumbnailFromUrl(videoUrl: string): Promise<string> {
  return captureThumbnailFromVideoUrl(videoUrl)
}

function captureThumbnailFromVideoUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = url

    const cleanup = () => {
      video.src = ''
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
