import { Capacitor } from '@capacitor/core'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import { persistTakeThumbnail } from './takeThumbnailCache'
import { nativeDataFileExists } from './filesystemInit'
import { isAudioTake } from './mediaType'
import {
  buildTakeVideoTransform,
  drawTakeVideoFrame,
  type RecordingOrientation,
} from './takeVideoTransform'
import { assignMediaPlaybackSrc } from './mediaPlayback'
import { applyBulletproofVideoElement } from './mobileVideo'
import type { Take } from '../types'

const THUMBNAIL_SEEK_SECONDS = 0.1
const THUMBNAIL_LOAD_TIMEOUT_MS = 5_000
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
      if (settled) return

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0) {
        return
      }

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
