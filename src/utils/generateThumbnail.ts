import { Capacitor } from '@capacitor/core'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import { persistTakeThumbnail } from './takeThumbnailCache'
import { isAudioTake } from './mediaType'
import type { Take } from '../types'

const THUMBNAIL_SEEK_SECONDS = 0.1
const THUMBNAIL_LOAD_TIMEOUT_MS = 5_000
const THUMBNAIL_CONCURRENCY = 4

export interface ThumbnailCaptureOptions {
  filePath?: string
  /** Match in-app mirrored playback in vault cards. */
  mirrorPreview?: boolean
}

export function generateThumbnailFromBlob(blob: Blob, mirrorPreview = false): Promise<string> {
  const url = URL.createObjectURL(blob)
  return captureThumbnailFromVideoUrl(url, mirrorPreview).finally(() => {
    URL.revokeObjectURL(url)
  })
}

export async function generateThumbnailFromUrl(
  videoUrl: string,
  options: ThumbnailCaptureOptions = {},
): Promise<string> {
  const resolvedUrl = await resolveNativeVideoPlaybackSrc(
    options.filePath ?? '',
    videoUrl,
  )

  if (!resolvedUrl) {
    throw new Error('Unable to resolve native video URL for thumbnail')
  }

  if (Capacitor.isNativePlatform() && resolvedUrl.startsWith('file://')) {
    throw new Error('Refusing raw file:// URL for thumbnail capture')
  }

  return captureThumbnailFromVideoUrl(resolvedUrl, options.mirrorPreview === true)
}

function captureThumbnailFromVideoUrl(
  url: string,
  mirrorPreview = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.disablePictureInPicture = true
    video.preload = 'auto'
    video.src = url.includes('#t=') ? url : `${url}#t=0.1`

    let settled = false

    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }

    const finish = (result: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      resolve(result)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      cleanup()
      reject(error)
    }

    const timeout = window.setTimeout(() => {
      fail(new Error('Thumbnail capture timed out'))
    }, THUMBNAIL_LOAD_TIMEOUT_MS)

    const captureFrame = () => {
      try {
        const width = Math.max(video.videoWidth || 320, 1)
        const height = Math.max(video.videoHeight || 180, 1)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fail(new Error('Canvas context unavailable'))
          return
        }

        if (mirrorPreview) {
          ctx.translate(width, 0)
          ctx.scale(-1, 1)
        }

        ctx.drawImage(video, 0, 0, width, height)
        finish(canvas.toDataURL('image/jpeg', 0.82))
      } catch (err) {
        fail(err instanceof Error ? err : new Error('Thumbnail capture failed'))
      }
    }

    const seekAndCapture = () => {
      if (settled) return

      const seekTarget = Math.min(
        THUMBNAIL_SEEK_SECONDS,
        Math.max(0, (video.duration || THUMBNAIL_SEEK_SECONDS) - 0.01),
      )

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        captureFrame()
      }

      video.addEventListener('seeked', onSeeked, { once: true })

      try {
        video.currentTime = seekTarget
      } catch {
        captureFrame()
      }
    }

    video.addEventListener('error', () => {
      fail(new Error('Thumbnail video failed to load'))
    })

    video.addEventListener('loadedmetadata', seekAndCapture, { once: true })
    video.addEventListener('loadeddata', seekAndCapture, { once: true })
    video.load()
  })
}

export async function captureAndPersistTakeThumbnail(
  take: Pick<
    Take,
    'id' | 'videoUrl' | 'filePath' | 'mirrorPlayback' | 'mediaType'
  >,
): Promise<string | null> {
  if (take.mediaType === 'audio') return null

  const mirrorPreview = take.mirrorPlayback !== false

  for (const mirror of mirrorPreview ? [true, false] : [false]) {
    try {
      const dataUrl = await generateThumbnailFromUrl(take.videoUrl, {
        filePath: take.filePath,
        mirrorPreview: mirror,
      })
      return persistTakeThumbnail(take.id, dataUrl)
    } catch {
      /* try without mirror or next take */
    }
  }

  return null
}

export async function hydrateTakeThumbnailsInBackground(
  takes: Take[],
  applyThumbnails: (updates: Map<string, string>) => void,
): Promise<void> {
  const targets = takes.filter((take) => !take.thumbnailUrl && !isAudioTake(take))
  if (targets.length === 0) return

  let cursor = 0
  const pending = new Map<string, string>()

  const flushPending = () => {
    if (pending.size === 0) return
    applyThumbnails(new Map(pending))
    pending.clear()
  }

  const worker = async () => {
    while (cursor < targets.length) {
      const take = targets[cursor]
      cursor += 1

      const thumbnailUrl = await captureAndPersistTakeThumbnail(take)
      if (!thumbnailUrl) continue

      pending.set(take.id, thumbnailUrl)
      if (pending.size >= 2) {
        flushPending()
      }
    }
  }

  const workerCount = Math.min(THUMBNAIL_CONCURRENCY, targets.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  flushPending()
}
