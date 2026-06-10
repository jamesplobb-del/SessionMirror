import { Capacitor } from '@capacitor/core'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import { persistTakeThumbnail } from './takeThumbnailCache'
import {
  drawTakeVideoFrame,
  outputDimensionsForTransform,
  type TakeVideoTransform,
} from './takeVideoTransform'
import type { Take } from '../types'

const THUMBNAIL_SEEK_SECONDS = 0.1
const THUMBNAIL_LOAD_TIMEOUT_MS = 12_000

export interface ThumbnailCaptureOptions {
  filePath?: string
  /** Match in-app mirrored playback in vault cards. */
  mirrorPreview?: boolean
  recordingOrientation?: TakeVideoTransform['recordingOrientation']
}

export function generateThumbnailFromBlob(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  return captureThumbnailFromVideoUrl(url).finally(() => {
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

  const transform: TakeVideoTransform = {
    unmirror: options.mirrorPreview === true,
    recordingOrientation: options.recordingOrientation ?? 'portrait',
  }

  return captureThumbnailFromVideoUrl(resolvedUrl, transform)
}

function captureThumbnailFromVideoUrl(
  url: string,
  transform: TakeVideoTransform = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.disablePictureInPicture = true
    video.preload = 'auto'
    video.src = url

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
      cleanup()
      resolve(result)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const timeout = window.setTimeout(() => {
      fail(new Error('Thumbnail capture timed out'))
    }, THUMBNAIL_LOAD_TIMEOUT_MS)

    const captureFrame = () => {
      try {
        const { width, height } = outputDimensionsForTransform(
          video.videoWidth,
          video.videoHeight,
          transform,
        )

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(width, 1)
        canvas.height = Math.max(height, 1)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fail(new Error('Canvas context unavailable'))
          return
        }

        drawTakeVideoFrame(ctx, video, transform)
        finish(canvas.toDataURL('image/jpeg', 0.85))
      } catch (err) {
        fail(err instanceof Error ? err : new Error('Thumbnail capture failed'))
      }
    }

    video.addEventListener('error', () => {
      window.clearTimeout(timeout)
      fail(new Error('Thumbnail video failed to load'))
    })

    video.addEventListener('loadedmetadata', () => {
      const seekTarget = Math.min(
        THUMBNAIL_SEEK_SECONDS,
        Math.max(0, (video.duration || THUMBNAIL_SEEK_SECONDS) - 0.01),
      )
      video.currentTime = seekTarget
    })

    video.addEventListener(
      'seeked',
      () => {
        window.clearTimeout(timeout)
        captureFrame()
      },
      { once: true },
    )

    video.load()
  })
}

export async function captureAndPersistTakeThumbnail(
  take: Pick<
    Take,
    'id' | 'videoUrl' | 'filePath' | 'mirrorPlayback' | 'recordingOrientation' | 'mediaType'
  >,
): Promise<string | null> {
  if (take.mediaType === 'audio') return null

  try {
    const dataUrl = await generateThumbnailFromUrl(take.videoUrl, {
      filePath: take.filePath,
      mirrorPreview: take.mirrorPlayback !== false,
      recordingOrientation: take.recordingOrientation,
    })
    return persistTakeThumbnail(take.id, dataUrl)
  } catch {
    return null
  }
}
