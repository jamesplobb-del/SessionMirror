import { Directory, Filesystem } from '@capacitor/filesystem'
import { getRecorderMimeType } from './mobileVideo'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'
import {
  drawTakeVideoFrame,
  outputDimensionsForTransform,
  type TakeVideoTransform,
} from './takeVideoTransform'

const EXPORT_CACHE_DIR = 'export-cache'

function needsPhotoExportTransform(transform: TakeVideoTransform): boolean {
  return Boolean(transform.unmirror || transform.recordingOrientation === 'landscape')
}

async function loadVideoElement(playbackUrl: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = false
    video.playsInline = true
    video.setAttribute('webkit-playsinline', 'true')
    video.preload = 'auto'
    video.src = playbackUrl

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }

    const onReady = () => {
      cleanup()
      resolve(video)
    }

    const onError = () => {
      cleanup()
      reject(new Error('Export video failed to load'))
    }

    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.load()
  })
}

function captureAudioTracks(video: HTMLVideoElement): MediaStreamTrack[] {
  const captureVideo = video as HTMLVideoElement & {
    captureStream?: () => MediaStream
    mozCaptureStream?: () => MediaStream
  }

  if (typeof captureVideo.captureStream === 'function') {
    try {
      return captureVideo.captureStream().getAudioTracks()
    } catch {
      /* fall through */
    }
  }

  if (typeof captureVideo.mozCaptureStream === 'function') {
    try {
      return captureVideo.mozCaptureStream().getAudioTracks()
    } catch {
      /* fall through */
    }
  }

  return []
}

async function transcodeForPhotosExport(
  playbackUrl: string,
  transform: TakeVideoTransform,
): Promise<Blob> {
  const video = await loadVideoElement(playbackUrl)
  const { width, height } = outputDimensionsForTransform(
    video.videoWidth,
    video.videoHeight,
    transform,
  )

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas unavailable for export')
  }

  const mimeType = getRecorderMimeType()
  const canvasStream = canvas.captureStream(30)
  const audioTracks = captureAudioTracks(video)
  const exportStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioTracks,
  ])

  const recorder = new MediaRecorder(exportStream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  })

  const chunks: BlobPart[] = []

  return new Promise((resolve, reject) => {
    let finished = false

    const finish = (blob: Blob) => {
      if (finished) return
      finished = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      resolve(blob)
    }

    const fail = (error: Error) => {
      if (finished) return
      finished = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.remove()
      reject(error)
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onerror = () => {
      fail(new Error('Export recorder failed'))
    }

    recorder.onstop = () => {
      finish(new Blob(chunks, { type: mimeType }))
    }

    const render = () => {
      if (finished) return

      if (video.ended || video.currentTime >= video.duration - 0.05) {
        drawTakeVideoFrame(ctx, video, transform)
        try {
          if (recorder.state === 'recording') {
            recorder.stop()
          }
        } catch {
          fail(new Error('Export recorder stop failed'))
        }
        return
      }

      drawTakeVideoFrame(ctx, video, transform)
      requestAnimationFrame(render)
    }

    video.addEventListener(
      'ended',
      () => {
        drawTakeVideoFrame(ctx, video, transform)
        try {
          if (recorder.state === 'recording') {
            recorder.stop()
          }
        } catch {
          fail(new Error('Export recorder stop failed'))
        }
      },
      { once: true },
    )

    try {
      recorder.start(250)
    } catch {
      fail(new Error('Export recorder start failed'))
      return
    }

    void video.play().then(() => {
      requestAnimationFrame(render)
    }).catch(() => {
      fail(new Error('Export playback failed'))
    })
  })
}

async function writeExportBlobToCache(blob: Blob, takeId: string): Promise<string> {
  const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
  const cachePath = `${EXPORT_CACHE_DIR}/${takeId}-photos.${extension}`

  await Filesystem.mkdir({
    path: EXPORT_CACHE_DIR,
    directory: Directory.Cache,
    recursive: true,
  })

  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  await Filesystem.writeFile({
    path: cachePath,
    directory: Directory.Cache,
    data: btoa(binary),
  })

  const { uri } = await Filesystem.getUri({
    path: cachePath,
    directory: Directory.Cache,
  })

  return uri
}

/** Returns a native file:// URI ready for Media.saveVideo. */
export async function prepareTakeVideoForPhotosExport(
  takeId: string,
  filePath: string,
  videoUrl: string,
  transform: TakeVideoTransform,
): Promise<string | null> {
  if (!needsPhotoExportTransform(transform)) {
    return null
  }

  const playbackUrl = await resolveNativeVideoPlaybackSrc(filePath, videoUrl)
  if (!playbackUrl) {
    throw new Error('Unable to resolve playback URL for export')
  }

  const blob = await transcodeForPhotosExport(playbackUrl, transform)
  return writeExportBlobToCache(blob, takeId)
}

export async function downloadTransformedTakeOnWeb(
  takeName: string,
  filePath: string,
  videoUrl: string,
  transform: TakeVideoTransform,
): Promise<void> {
  const playbackUrl = await resolveNativeVideoPlaybackSrc(filePath, videoUrl)
  if (!playbackUrl) {
    throw new Error('Unable to resolve playback URL for download')
  }

  const blob = needsPhotoExportTransform(transform)
    ? await transcodeForPhotosExport(playbackUrl, transform)
    : await fetch(playbackUrl).then((response) => response.blob())

  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = `${takeName.replace(/[^\w.-]+/g, '_') || 'take'}.mp4`
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export function takeNeedsPhotosExportTransform(take: {
  mirrorPlayback?: boolean
  recordingOrientation?: TakeVideoTransform['recordingOrientation']
  mediaType?: string
}): TakeVideoTransform | null {
  if (take.mediaType === 'audio') return null

  const transform: TakeVideoTransform = {
    unmirror: take.mirrorPlayback !== false,
    recordingOrientation: take.recordingOrientation ?? 'portrait',
  }

  return needsPhotoExportTransform(transform) ? transform : null
}
