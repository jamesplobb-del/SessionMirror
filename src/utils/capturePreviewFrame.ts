import { drawCoverFrameOnCanvas } from './nativeCameraFrameBridge'

/** Grab the current WebKit camera frame as a mirrored JPEG data URL. */
export function capturePreviewFrame(video: HTMLVideoElement | null): string | null {
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null

  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

/** Paint the live WebKit video frame onto the preview canvas synchronously (handoff). */
export function paintPreviewVideoOnCanvas(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): boolean {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return false

  try {
    drawCoverFrameOnCanvas(canvas, video, video.videoWidth, video.videoHeight)
    return true
  } catch {
    return false
  }
}

export function drawPreviewFrameOnCanvas(
  canvas: HTMLCanvasElement,
  dataUrl: string,
  sourceWidth = 0,
  sourceHeight = 0,
): void {
  const image = new Image()
  image.onload = () => {
    const w = sourceWidth > 0 ? sourceWidth : image.naturalWidth
    const h = sourceHeight > 0 ? sourceHeight : image.naturalHeight
    drawCoverFrameOnCanvas(canvas, image, w, h)
  }
  image.src = dataUrl
}
