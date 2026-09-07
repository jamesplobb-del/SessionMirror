import { Capacitor } from '@capacitor/core'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import { persistTakeThumbnail } from './takeThumbnailCache'
import { nativeDataFileExists } from './filesystemInit'
import { isAudioTake } from './mediaType'
import {
  buildTakeVideoTransform,
  drawTakeVideoFrame,
  type RecordingOrientation,
  type TakeVideoTransform,
} from './takeVideoTransform'
import { assignMediaPlaybackSrc } from './mediaPlayback'
import { applyBulletproofVideoElement } from './mobileVideo'
import type { Take } from '../types'

const THUMBNAIL_SEEK_SECONDS = 0.1
const THUMBNAIL_LOAD_TIMEOUT_MS = 5_000
/**
 * Long-edge cap for a stored thumbnail. Take boxes and vault cards never draw
 * one larger than a few hundred CSS px, so even at 3x this is oversampled —
 * while the previous behaviour (draw at the source's own resolution) meant a
 * full 1080p canvas and a full 1080p JPEG encode per take, on the main thread,
 * right after a recording finished.
 */
const THUMBNAIL_MAX_DIMENSION = 900
const THUMBNAIL_JPEG_QUALITY = 0.82
const THUMBNAIL_CONCURRENCY = 2
const HEAL_CONCURRENCY = 2

let activeHealJobs = 0
const healSlotWaiters: Array<() => void> = []

async function acquireHealSlot(): Promise<void> {
  if (activeHealJobs < HEAL_CONCURRENCY) {
    activeHealJobs += 1
    return
  }

  await new Promise<void>((resolve) => {
    healSlotWaiters.push(() => {
      activeHealJobs += 1
      resolve()
    })
  })
}

function releaseHealSlot(): void {
  activeHealJobs = Math.max(0, activeHealJobs - 1)
  const next = healSlotWaiters.shift()
  if (next) next()
}

export interface ThumbnailCaptureOptions {
  filePath?: string
  /** Pre-resolved playback URL — skips an extra Filesystem.getUri round-trip when known. */
  videoUrl?: string
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

/**
 * Self-heal a missing on-disk thumbnail by extracting a frame from the take video,
 * persisting it under thumbnails/, and returning a WebView-safe playback URL.
 */
export async function regenerateTakeThumbnailFromVideo(
  takeId: string,
  filePath: string,
  options: ThumbnailCaptureOptions & { recordingOrientation?: RecordingOrientation } = {},
): Promise<string | null> {
  if (!takeId || !filePath) return null

  if (Capacitor.isNativePlatform()) {
    const videoExists = await nativeDataFileExists(filePath)
    if (!videoExists) return null
  }

  await acquireHealSlot()

  try {
    const recordingOrientation = options.recordingOrientation ?? 'portrait'
    const mirrorPreview = options.mirrorPreview !== false
    const resolvedVideoUrl =
      options.videoUrl ||
      (await resolveNativeVideoPlaybackSrc(filePath, options.videoUrl ?? '')) ||
      ''

    if (!resolvedVideoUrl) return null

    for (const mirror of mirrorPreview ? [true, false] : [false]) {
      try {
        const dataUrl = await generateThumbnailFromUrl(resolvedVideoUrl, {
          filePath,
          mirrorPreview: mirror,
          recordingOrientation,
        })
        const persisted = await persistTakeThumbnail(takeId, dataUrl, recordingOrientation)
        return persisted
      } catch (err) {
      }
    }

    return null
  } finally {
    releaseHealSlot()
  }
}

function configureThumbnailVideoElement(video: HTMLVideoElement): void {
  video.muted = true
  video.crossOrigin = 'anonymous'
  applyBulletproofVideoElement(video)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Thumbnail encode produced no data URL'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Thumbnail encode failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Encode the captured frame without blocking the main thread.
 *
 * `toDataURL()` is synchronous: it rasterises and base64-encodes the whole
 * canvas inline, which stalled the UI for the length of a full-resolution JPEG
 * encode at exactly the moment a take finished recording. OffscreenCanvas hands
 * the encode to the browser off-thread; `toBlob()` is the async fallback, and a
 * synchronous `toDataURL()` remains as the last resort so a browser without
 * either still produces a thumbnail.
 */
async function renderThumbnailDataUrl(
  video: HTMLVideoElement,
  transform: TakeVideoTransform,
): Promise<string> {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(1, 1)
      const offscreenCtx = offscreen.getContext('2d')
      if (offscreenCtx) {
        drawTakeVideoFrame(offscreenCtx, video, transform, THUMBNAIL_MAX_DIMENSION)
        const blob = await offscreen.convertToBlob({
          type: 'image/jpeg',
          quality: THUMBNAIL_JPEG_QUALITY,
        })
        return await blobToDataUrl(blob)
      }
    } catch {
      // Fall through to the DOM canvas path below.
    }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context unavailable')
  drawTakeVideoFrame(ctx, video, transform, THUMBNAIL_MAX_DIMENSION)

  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_JPEG_QUALITY)
    })
    if (blob) return await blobToDataUrl(blob)
  }

  return canvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY)
}

function captureThumbnailFromVideoUrl(
  url: string,
  options: ThumbnailCaptureOptions = {},
): Promise<string> {
  const mirrorPreview = options.mirrorPreview === true
  const transform = buildTakeVideoTransform(options.recordingOrientation, mirrorPreview)

  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    configureThumbnailVideoElement(video)

    let settled = false
    let seekPending = false
    /* The encode is async now, so `settled` is not set until it finishes. Without
       this, a second seek/ready event landing mid-encode would start a redundant
       second encode — harmless, since the later finish() is a no-op, but it is
       exactly the main-thread work this change exists to avoid. */
    let capturing = false

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
      if (settled || capturing) return

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0) {
        return
      }

      capturing = true
      void (async () => {
        try {
          const dataUrl = await renderThumbnailDataUrl(video, transform)
          finish(dataUrl)
        } catch (err) {
          fail(err instanceof Error ? err : new Error('Thumbnail capture failed'))
        } finally {
          capturing = false
        }
      })()
    }

    const seekTargetForVideo = (): number =>
      Math.min(
        THUMBNAIL_SEEK_SECONDS,
        Math.max(0, (video.duration || THUMBNAIL_SEEK_SECONDS) - 0.01),
      )

    const requestSeekAndCapture = () => {
      if (settled || seekPending) return

      const seekTarget = seekTargetForVideo()

      if (Math.abs(video.currentTime - seekTarget) < 0.02) {
        captureFrame()
        return
      }

      seekPending = true

      const onSeeked = () => {
        seekPending = false
        captureFrame()
      }

      video.addEventListener('seeked', onSeeked, { once: true })

      try {
        video.currentTime = seekTarget
      } catch {
        seekPending = false
      }
    }

    video.addEventListener('error', () => {
      fail(new Error('Thumbnail video failed to load'))
    })

    video.addEventListener(
      'loadeddata',
      () => {
        if (settled) return

        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

        const seekTarget = seekTargetForVideo()
        if (Math.abs(video.currentTime - seekTarget) < 0.02) {
          captureFrame()
          return
        }

        requestSeekAndCapture()
      },
      { once: true },
    )

    assignMediaPlaybackSrc(video, url)
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

  return regenerateTakeThumbnailFromVideo(take.id, take.filePath, {
    videoUrl: take.videoUrl,
    mirrorPreview: take.mirrorPlayback === true,
    recordingOrientation: take.recordingOrientation ?? 'portrait',
  })
}

export async function hydrateTakeThumbnailsInBackground(
  takes: Take[],
  applyThumbnails: (updates: Map<string, string>) => void,
): Promise<void> {
  const targets = takes.filter((take) => !isAudioTake(take) && !take.thumbnailUrl)
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
      flushPending()
    }
  }

  const workerCount = Math.min(THUMBNAIL_CONCURRENCY, targets.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  flushPending()
}
