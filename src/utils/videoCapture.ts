import type { RecordingOrientation } from './takeVideoTransform'
import { isTabletViewport } from './deviceFormFactor'

/**
 * Full field-of-view front camera — no width/height/aspect locks (those crop/zoom on iPhone).
 */
export function getPortraitVideoCaptureConstraints(): MediaTrackConstraints {
  if (typeof window !== 'undefined' && isTabletViewport()) {
    return {
      facingMode: 'user',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    }
  }

  return {
    facingMode: 'user',
  }
}

/** Landscape-only soft 720p — applied at record start, not on live preview acquire. */
export function getLandscapeVideoCaptureConstraints(): MediaTrackConstraints {
  return {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    aspectRatio: { ideal: 16 / 9 },
  }
}

export function getVideoCaptureConstraintsForOrientation(
  orientation: RecordingOrientation = 'portrait',
): MediaTrackConstraints {
  return orientation === 'landscape'
    ? getLandscapeVideoCaptureConstraints()
    : getPortraitVideoCaptureConstraints()
}

/** Soft resolution boost for iPad preview/record when the initial track is low-res. */
export async function maybeBoostTabletPreviewResolution(
  stream: MediaStream,
): Promise<void> {
  if (!isTabletViewport()) return

  const track = stream.getVideoTracks()[0]
  if (!track) return

  const { width = 0 } = track.getSettings()
  if (width >= 1280) return

  try {
    await track.applyConstraints({
      facingMode: 'user',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    })
  } catch {
    /* keep full field of view if ideals are rejected */
  }
}

/** Only re-tune for landscape recording — never touch portrait (avoids iOS zoom/crop). */
export async function tuneVideoRecordingStream(
  stream: MediaStream,
  orientation: RecordingOrientation,
): Promise<void> {
  if (orientation !== 'landscape') return

  const track = stream.getVideoTracks()[0]
  if (!track) return

  try {
    await track.applyConstraints(getLandscapeVideoCaptureConstraints())
  } catch {
    /* keep full field of view if landscape constraints fail */
  }
}

type ZoomCapableCapabilities = MediaTrackCapabilities & {
  zoom?: { min?: number; max?: number; step?: number }
}

type ZoomCapableSettings = MediaTrackSettings & {
  zoom?: number
}

type ZoomCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => ZoomCapableCapabilities
  getSettings?: () => ZoomCapableSettings
}

export interface CameraZoomRange {
  min: number
  max: number
  step: number
  current: number
  source: 'track' | 'css'
}

const CSS_PREVIEW_ZOOM_MIN = 1
const CSS_PREVIEW_ZOOM_MAX = 3
const CSS_PREVIEW_ZOOM_STEP = 0.04

let cssPreviewZoom = 1

function clampCssPreviewZoom(zoom: number): number {
  return Math.max(CSS_PREVIEW_ZOOM_MIN, Math.min(CSS_PREVIEW_ZOOM_MAX, zoom))
}

function syncCssPreviewZoomToVideos(): void {
  if (typeof document === 'undefined') return
  const value = String(cssPreviewZoom)
  for (const element of document.querySelectorAll('video.camera-preview--mirror')) {
    if (element instanceof HTMLElement) {
      element.style.setProperty('--camera-preview-zoom', value)
    }
  }
}

export function getCssPreviewZoom(): number {
  return cssPreviewZoom
}

export function setCssPreviewZoom(zoom: number): number {
  cssPreviewZoom = clampCssPreviewZoom(zoom)
  syncCssPreviewZoomToVideos()
  return cssPreviewZoom
}

export function resetCssPreviewZoom(): void {
  cssPreviewZoom = 1
  syncCssPreviewZoomToVideos()
}

function getZoomTrack(stream: MediaStream | null | undefined): ZoomCapableTrack | null {
  const track = stream?.getVideoTracks()[0] as ZoomCapableTrack | undefined
  if (!track || track.readyState !== 'live') return null
  return track
}

export function getFrontCameraZoomRange(
  stream: MediaStream | null | undefined,
): CameraZoomRange | null {
  const track = getZoomTrack(stream)
  if (!track) return null

  try {
    const capabilities = track.getCapabilities?.() as ZoomCapableCapabilities | undefined
    const zoom = capabilities?.zoom
    if (zoom) {
      const min = zoom.min ?? 1
      const max = zoom.max ?? min
      if (max > min) {
        const settings = track.getSettings?.() as ZoomCapableSettings | undefined
        return {
          min,
          max,
          step: zoom.step ?? 0.05,
          current: settings?.zoom ?? min,
          source: 'track',
        }
      }
    }
  } catch {
    /* fall through to CSS preview zoom */
  }

  return {
    min: CSS_PREVIEW_ZOOM_MIN,
    max: CSS_PREVIEW_ZOOM_MAX,
    step: CSS_PREVIEW_ZOOM_STEP,
    current: cssPreviewZoom,
    source: 'css',
  }
}

export async function setFrontCameraZoom(
  stream: MediaStream | null | undefined,
  zoom: number,
): Promise<CameraZoomRange | null> {
  const range = getFrontCameraZoomRange(stream)
  if (!range) return null

  const stepped =
    range.step > 0
      ? Math.round((zoom - range.min) / range.step) * range.step + range.min
      : zoom
  const nextZoom = Math.max(range.min, Math.min(range.max, stepped))

  if (range.source === 'css') {
    return {
      ...range,
      current: setCssPreviewZoom(nextZoom),
    }
  }

  const track = getZoomTrack(stream)
  if (!track) return null

  try {
    try {
      await track.applyConstraints({ zoom: nextZoom } as MediaTrackConstraints)
    } catch {
      await track.applyConstraints({
        advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
      })
    }
    resetCssPreviewZoom()
    const settings = track.getSettings?.() as ZoomCapableSettings | undefined
    return {
      ...range,
      current: settings?.zoom ?? nextZoom,
    }
  } catch {
    return {
      ...range,
      current: setCssPreviewZoom(nextZoom),
    }
  }
}

/** Apply zoom via track constraints when supported, otherwise CSS preview scale. */
export async function applyCameraZoom(
  stream: MediaStream | null | undefined,
  zoom: number,
): Promise<CameraZoomRange | null> {
  return setFrontCameraZoom(stream, zoom)
}

/** Reset CSS preview zoom when the live stream is torn down or replaced. */
export function resetCameraPreviewZoom(): void {
  resetCssPreviewZoom()
}

/** Clear pinch/CSS zoom and reset optical zoom after sleep or lock-screen resume. */
export async function normalizeVideoPreviewAfterWake(
  stream: MediaStream,
): Promise<void> {
  resetCssPreviewZoom()

  const track = stream.getVideoTracks()[0] as ZoomCapableTrack | undefined
  if (!track || track.readyState !== 'live') return

  try {
    const capabilities = track.getCapabilities?.() as ZoomCapableCapabilities | undefined
    const zoom = capabilities?.zoom
    if (!zoom) return

    const min = zoom.min ?? 1
    try {
      await track.applyConstraints({ zoom: min } as MediaTrackConstraints)
    } catch {
      await track.applyConstraints({
        advanced: [{ zoom: min } as MediaTrackConstraintSet],
      })
    }
  } catch {
    /* never re-apply facingMode/resolution here — iOS can crop on wake */
  }
}
