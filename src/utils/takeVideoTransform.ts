export type { RecordingOrientation } from './physicalOrientation'
export { readRecordingOrientation } from './physicalOrientation'

import type { RecordingOrientation } from './physicalOrientation'

export interface TakeVideoTransform {
  /** Horizontal flip so Photos matches true (non-selfie) perspective. */
  unmirror?: boolean
  /** Device orientation while the take was recorded. */
  recordingOrientation?: RecordingOrientation
}

export function outputDimensionsForTransform(
  videoWidth: number,
  videoHeight: number,
  transform: TakeVideoTransform,
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) {
    return { width: 720, height: 1280 }
  }

  const landscapeRecording = transform.recordingOrientation === 'landscape'
  const portraitBuffer = videoHeight >= videoWidth

  if (landscapeRecording && portraitBuffer) {
    return { width: videoHeight, height: videoWidth }
  }

  return { width: videoWidth, height: videoHeight }
}

/** True when the encoded buffer needs rotation for landscape playback/export. */
export function needsOrientationCorrection(
  videoWidth: number,
  videoHeight: number,
  recordingOrientation?: RecordingOrientation,
): boolean {
  return recordingOrientation === 'landscape' && videoHeight >= videoWidth
}

export function buildTakeVideoTransform(
  recordingOrientation: RecordingOrientation | undefined,
  mirrorPreview: boolean,
): TakeVideoTransform {
  return {
    recordingOrientation: recordingOrientation ?? 'portrait',
    /** Match legacy thumbnail mirror + true-perspective Photos export when flipped. */
    unmirror: mirrorPreview,
  }
}

export function buildTakeVideoExportTransform(
  recordingOrientation: RecordingOrientation | undefined,
): TakeVideoTransform {
  return {
    recordingOrientation: recordingOrientation ?? 'portrait',
    unmirror: true,
  }
}

/**
 * Draw one decoded frame into the export/thumbnail canvas.
 *
 * `maxDimension` caps the long edge. The video export path passes nothing and
 * keeps full resolution; thumbnails pass a cap, because a thumbnail rendered at
 * the source's full 1080p (or 4K) costs a big canvas and a big encode for an
 * image that is never displayed larger than a take box.
 */
export function drawTakeVideoFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  video: HTMLVideoElement,
  transform: TakeVideoTransform,
  maxDimension?: number,
): void {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw <= 0 || vh <= 0) return

  const full = outputDimensionsForTransform(vw, vh, transform)
  const scale =
    maxDimension && maxDimension > 0
      ? Math.min(1, maxDimension / Math.max(full.width, full.height))
      : 1
  const width = Math.max(1, Math.round(full.width * scale))
  const height = Math.max(1, Math.round(full.height * scale))

  const canvas = ctx.canvas
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  // Downscale via the canvas transform rather than by rewriting the rotate and
  // mirror maths below — that way the capped path and the full-size export path
  // stay the same code, and only the scale differs.
  if (scale !== 1) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.scale(scale, scale)
  }

  const landscapeRecording = transform.recordingOrientation === 'landscape'
  const portraitBuffer = vh >= vw

  if (landscapeRecording && portraitBuffer) {
    ctx.translate(full.width, 0)
    ctx.rotate(Math.PI / 2)
    if (transform.unmirror) {
      ctx.translate(-vh, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, vh, vw)
    } else {
      ctx.drawImage(video, 0, 0, vh, vw)
    }
  } else if (transform.unmirror) {
    ctx.translate(full.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, full.width, full.height)
  } else {
    ctx.drawImage(video, 0, 0, full.width, full.height)
  }

  ctx.restore()
}
