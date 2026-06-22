import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { RECORDING_AUDIO_BITS_PER_SECOND } from './audioCapture'
import {
  buildTakeVideoExportTransform,
  drawTakeVideoFrame,
  needsOrientationCorrection,
  outputDimensionsForTransform,
  type RecordingOrientation,
} from './takeVideoTransform'
import { estimateVideoBitrate, getRecorderMimeType, applyBulletproofVideoElement } from './mobileVideo'
import { assignMediaPlaybackSrc } from './mediaPlayback'
import { persistUploadedVideo, resolveNativeVideoPlaybackSrc, type PersistedTakeVideo } from './takeStorage'
import type { Take } from '../types'

const EXPORT_CACHE_DIR = 'export-cache'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unable to read export blob'))
        return
      }
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read export blob'))
    reader.readAsDataURL(blob)
  })
}

async function writeExportBlobToCache(blob: Blob, take: Take): Promise<string> {
  const ext = take.videoMimeType.includes('webm') ? 'webm' : 'mp4'
  const cachePath = `${EXPORT_CACHE_DIR}/${take.id}-export.${ext}`

  await Filesystem.mkdir({
    path: EXPORT_CACHE_DIR,
    directory: Directory.Cache,
    recursive: true,
  })

  try {
    await Filesystem.deleteFile({
      path: cachePath,
      directory: Directory.Cache,
    })
  } catch {
    /* first export */
  }

  const base64 = await blobToBase64(blob)
  await Filesystem.writeFile({
    path: cachePath,
    directory: Directory.Cache,
    data: base64,
  })

  const { uri } = await Filesystem.getUri({
    path: cachePath,
    directory: Directory.Cache,
  })

  return uri
}

function loadVideoMetadata(
  url: string,
): Promise<{ video: HTMLVideoElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    applyBulletproofVideoElement(video)
    assignMediaPlaybackSrc(video, url)

    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
    }

    const onReady = () => {
      const width = video.videoWidth
      const height = video.videoHeight
      if (width <= 0 || height <= 0) {
        cleanup()
        reject(new Error('Export video has no dimensions'))
        return
      }
      resolve({ video, width, height })
    }

    video.addEventListener(
      'loadedmetadata',
      () => {
        onReady()
      },
      { once: true },
    )
    video.addEventListener(
      'error',
      () => {
        cleanup()
        reject(new Error('Export video failed to load'))
      },
      { once: true },
    )
    video.load()
  })
}

async function transcodeTakeVideoForExport(
  playbackUrl: string,
  recordingOrientation: RecordingOrientation | undefined,
  mimeType: string,
): Promise<Blob> {
  const transform = buildTakeVideoExportTransform(recordingOrientation)
  const { video, width: vw, height: vh } = await loadVideoMetadata(playbackUrl)
  const { width, height } = outputDimensionsForTransform(vw, vh, transform)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    throw new Error('Canvas unavailable for export')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let rafId = 0

    const finish = (blob: Blob) => {
      if (settled) return
      settled = true
      window.cancelAnimationFrame(rafId)
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      resolve(blob)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      window.cancelAnimationFrame(rafId)
      try {
        recorder.stop()
      } catch {
        /* ignore */
      }
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      reject(error)
    }

    const canvasStream = canvas.captureStream(30)
    const recorderMime =
      mimeType.includes('mp4') && MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : getRecorderMimeType()

    const exportBitrate = Math.min(
      Math.round(estimateVideoBitrate(width, height) * 1.35),
      18_000_000,
    )

    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(canvasStream, {
      mimeType: recorderMime,
      videoBitsPerSecond: exportBitrate,
      audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
    })

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onstop = () => {
      finish(new Blob(chunks, { type: recorderMime }))
    }

    recorder.onerror = () => {
      fail(new Error('Export recorder failed'))
    }

    const drawFrame = () => {
      if (settled) return
      drawTakeVideoFrame(ctx, video, transform)
      if (video.ended) {
        window.setTimeout(() => {
          try {
            if (recorder.state === 'recording') {
              recorder.stop()
            }
          } catch {
            fail(new Error('Export recorder failed to stop'))
          }
        }, 80)
        return
      }
      rafId = window.requestAnimationFrame(drawFrame)
    }

    video.addEventListener(
      'ended',
      () => {
        drawTakeVideoFrame(ctx, video, transform)
      },
      { once: true },
    )

    void (async () => {
      try {
        video.muted = false
        await video.play().catch((err) => {
          console.warn('Playback intercepted:', err)
          throw err
        })

        const captureStream = (
          video as HTMLVideoElement & { captureStream?: () => MediaStream }
        ).captureStream?.()
        captureStream?.getAudioTracks().forEach((track) => {
          canvasStream.addTrack(track)
        })

        recorder.start()
        drawFrame()
      } catch (err) {
        fail(err instanceof Error ? err : new Error('Export playback failed'))
      }
    })()
  })
}

/**
 * Returns a native file:// URI ready for Photos export.
 * Re-encodes landscape takes that were stored in a portrait-sized buffer.
 */
export async function prepareTakeVideoExportUri(take: Take): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    return null
  }

  const playbackUrl = await resolveNativeVideoPlaybackSrc(take.filePath, take.videoUrl)
  if (!playbackUrl) {
    return null
  }

  const { width, height } = await loadVideoMetadata(playbackUrl).then(
    ({ width, height, video }) => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      return { width, height }
    },
  )

  if (
    !needsOrientationCorrection(width, height, take.recordingOrientation)
  ) {
    return null
  }

  const blob = await transcodeTakeVideoForExport(
    playbackUrl,
    take.recordingOrientation,
    take.videoMimeType || 'video/mp4',
  )

  return writeExportBlobToCache(blob, take)
}

/** Web download — returns an object URL for an orientation-corrected export when needed. */
export async function prepareTakeVideoExportUrl(take: Take): Promise<string | null> {
  const url = take.videoUrl
  if (!url) return null

  const playbackUrl = url.startsWith('blob:') ? url : await resolveNativeVideoPlaybackSrc(take.filePath, url)
  if (!playbackUrl) return null

  const { width, height, video } = await loadVideoMetadata(playbackUrl)
  const needsFix = needsOrientationCorrection(width, height, take.recordingOrientation)
  video.pause()
  video.removeAttribute('src')
  video.load()
  video.remove()

  if (!needsFix) {
    return playbackUrl
  }

  const blob = await transcodeTakeVideoForExport(
    playbackUrl,
    take.recordingOrientation,
    take.videoMimeType || 'video/mp4',
  )

  return URL.createObjectURL(blob)
}

/** Re-encode a landscape take stored in a portrait buffer and overwrite the take file. */
export async function normalizeLandscapeTakeInPlace(
  take: Pick<Take, 'id' | 'filePath' | 'videoUrl' | 'videoMimeType' | 'recordingOrientation'>,
): Promise<PersistedTakeVideo | null> {
  if (!take.filePath || take.recordingOrientation !== 'landscape') {
    return null
  }

  const playbackUrl = await resolveNativeVideoPlaybackSrc(take.filePath, take.videoUrl)
  if (!playbackUrl) return null

  const { width, height, video } = await loadVideoMetadata(playbackUrl)
  video.pause()
  video.removeAttribute('src')
  video.load()
  video.remove()

  if (!needsOrientationCorrection(width, height, take.recordingOrientation)) {
    return null
  }

  const blob = await transcodeTakeVideoForExport(
    playbackUrl,
    take.recordingOrientation,
    take.videoMimeType || 'video/mp4',
  )

  return persistUploadedVideo(blob, take.id, take.videoMimeType || 'video/mp4')
}

/** Web / blob recordings — returns a corrected blob when needed. */
export async function normalizeLandscapeRecordingBlob(
  blob: Blob,
  mimeType: string,
  recordingOrientation: RecordingOrientation | undefined,
): Promise<Blob> {
  if (recordingOrientation !== 'landscape') {
    return blob
  }

  const playbackUrl = URL.createObjectURL(blob)
  try {
    const { width, height, video } = await loadVideoMetadata(playbackUrl)
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()

    if (!needsOrientationCorrection(width, height, recordingOrientation)) {
      return blob
    }

    return transcodeTakeVideoForExport(
      playbackUrl,
      recordingOrientation,
      mimeType,
    )
  } finally {
    URL.revokeObjectURL(playbackUrl)
  }
}
