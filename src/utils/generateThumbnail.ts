import { Capacitor } from '@capacitor/core'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import { persistTakeThumbnail } from './takeThumbnailCache'
import { isAudioTake } from './mediaType'
import {
  buildTakeVideoTransform,
  drawTakeVideoFrame,
  type RecordingOrientation,
} from './takeVideoTransform'
import { agentDebugLog } from './agentDebugLog'
import type { Take } from '../types'

const THUMBNAIL_SEEK_SECONDS = 0.1
const THUMBNAIL_LOAD_TIMEOUT_MS = 5_000
const THUMBNAIL_CONCURRENCY = 2

export interface ThumbnailCaptureOptions {
  filePath?: string
  /** Match in-app mirrored playback in take cards. */
  mirrorPreview?: boolean
  recordingOrientation?: RecordingOrientation
}

export function generateThumbnailFromBlob(
  blob: Blob,
  mirrorPreview = false,
  recordingOrientation?: RecordingOrientation,
): Promise<string> {
  const url = URL.createObjectURL(blob)
  return captureThumbnailFromVideoUrl(url, {
    mirrorPreview,
    recordingOrientation,
  }).finally(() => {
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

  return captureThumbnailFromVideoUrl(resolvedUrl, options)
}

function captureThumbnailFromVideoUrl(
  url: string,
  options: ThumbnailCaptureOptions = {},
): Promise<string> {
  const mirrorPreview = options.mirrorPreview === true
  const transform = buildTakeVideoTransform(options.recordingOrientation, mirrorPreview)

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
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          fail(new Error('Canvas context unavailable'))
          return
        }

        drawTakeVideoFrame(ctx, video, transform)
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
    'id' | 'videoUrl' | 'filePath' | 'mirrorPlayback' | 'mediaType' | 'recordingOrientation'
  >,
): Promise<string | null> {
  if (take.mediaType === 'audio') return null

  const mirrorPreview = take.mirrorPlayback !== false

  for (const mirror of mirrorPreview ? [true, false] : [false]) {
    try {
      const dataUrl = await generateThumbnailFromUrl(take.videoUrl, {
        filePath: take.filePath,
        mirrorPreview: mirror,
        recordingOrientation: take.recordingOrientation,
      })
      const persisted = await persistTakeThumbnail(
        take.id,
        dataUrl,
        take.recordingOrientation ?? 'portrait',
      )
      // #region agent log
      agentDebugLog(
        'generateThumbnail.ts:captureAndPersistTakeThumbnail',
        'thumbnail captured',
        {
          takeId: take.id,
          mirror,
          orientation: take.recordingOrientation ?? 'portrait',
          ok: true,
        },
        'H-V2',
      )
      // #endregion
      return persisted
    } catch (err) {
      // #region agent log
      agentDebugLog(
        'generateThumbnail.ts:captureAndPersistTakeThumbnail',
        'thumbnail capture failed',
        {
          takeId: take.id,
          mirror,
          orientation: take.recordingOrientation ?? 'portrait',
          error: err instanceof Error ? err.message : String(err),
        },
        'H-V2',
      )
      // #endregion
    }
  }

  return null
}

export async function hydrateTakeThumbnailsInBackground(
  takes: Take[],
  applyThumbnails: (updates: Map<string, string>) => void,
): Promise<void> {
  const targets = takes.filter((take) => !isAudioTake(take) && !take.thumbnailUrl)
  if (targets.length === 0) return

  const hydrateStarted = Date.now()
  // #region agent log
  agentDebugLog(
    'generateThumbnail.ts:hydrateTakeThumbnailsInBackground',
    'hydrate started',
    {
      targetCount: targets.length,
      missingUrl: targets.filter((t) => !t.thumbnailUrl).length,
      landscapeRecapture: targets.filter(
        (t) => t.thumbnailUrl && t.recordingOrientation === 'landscape',
      ).length,
      concurrency: Math.min(THUMBNAIL_CONCURRENCY, targets.length),
    },
    'H-V1',
  )
  // #endregion

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
      flushPending()
    }
  }

  const workerCount = Math.min(THUMBNAIL_CONCURRENCY, targets.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  flushPending()
  // #region agent log
  agentDebugLog(
    'generateThumbnail.ts:hydrateTakeThumbnailsInBackground',
    'hydrate finished',
    {
      targetCount: targets.length,
      elapsedMs: Date.now() - hydrateStarted,
    },
    'H-V6',
  )
  // #endregion
}
