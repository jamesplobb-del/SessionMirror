export type RecordingOrientation = 'portrait' | 'landscape'

export interface TakeVideoTransform {
  /** Horizontal flip so Photos matches true (non-selfie) perspective. */
  unmirror?: boolean
  /** Device orientation while the take was recorded. */
  recordingOrientation?: RecordingOrientation
}

export function readRecordingOrientation(): RecordingOrientation {
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
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

/** Draw one decoded frame into the export/thumbnail canvas. */
export function drawTakeVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  transform: TakeVideoTransform,
): void {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (vw <= 0 || vh <= 0) return

  const { width, height } = outputDimensionsForTransform(vw, vh, transform)
  const canvas = ctx.canvas
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  const landscapeRecording = transform.recordingOrientation === 'landscape'
  const portraitBuffer = vh >= vw

  if (landscapeRecording && portraitBuffer) {
    ctx.translate(width, 0)
    ctx.rotate(Math.PI / 2)
    if (transform.unmirror) {
      ctx.translate(-vh, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, vh, vw)
    } else {
      ctx.drawImage(video, 0, 0, vh, vw)
    }
  } else if (transform.unmirror) {
    ctx.translate(width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, width, height)
  } else {
    ctx.drawImage(video, 0, 0, width, height)
  }

  ctx.restore()
}
