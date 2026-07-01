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
    if (!zoom) return null

    const min = zoom.min ?? 1
    const max = zoom.max ?? min
    if (max <= min) return null

    const settings = track.getSettings?.() as ZoomCapableSettings | undefined
    return {
      min,
      max,
      step: zoom.step ?? 0.05,
      current: settings?.zoom ?? min,
    }
  } catch {
    return null
  }
}

export async function setFrontCameraZoom(
  stream: MediaStream | null | undefined,
  zoom: number,
): Promise<CameraZoomRange | null> {
  const track = getZoomTrack(stream)
  if (!track) return null

  const range = getFrontCameraZoomRange(stream)
  if (!range) return null

  const stepped =
    range.step > 0
      ? Math.round((zoom - range.min) / range.step) * range.step + range.min
      : zoom
  const nextZoom = Math.max(range.min, Math.min(range.max, stepped))

  try {
    await track.applyConstraints({
      advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
    })
    return {
      ...range,
      current: nextZoom,
    }
  } catch {
    return null
  }
}

/** Keep front camera at 1× after iOS background resume (WebKit track zoom can stick). */
export async function resetFrontCameraZoom(stream: MediaStream): Promise<void> {
  const range = getFrontCameraZoomRange(stream)
  if (range) await setFrontCameraZoom(stream, range.min)

  try {
    const track = getZoomTrack(stream)
    if (!track) return
    await track.applyConstraints(getPortraitVideoCaptureConstraints())
  } catch {
    /* keep current FOV if portrait constraints are rejected */
  }
}

/**
 * iOS/WebKit can briefly re-apply a sticky zoom after foregrounding. Enforce the
 * same 1× track constraints across a few frames so the live preview settles at a
 * predictable field of view.
 */
export function enforceFrontCameraZoom(
  stream: MediaStream | null | undefined,
  delaysMs: number[] = [0, 90, 220, 520, 950],
): () => void {
  if (!stream) return () => {}

  const timers: number[] = []
  for (const delay of delaysMs) {
    const run = () => {
      void resetFrontCameraZoom(stream)
    }

    if (delay <= 0) {
      run()
    } else if (typeof window !== 'undefined') {
      timers.push(window.setTimeout(run, delay))
    }
  }

  return () => {
    for (const timer of timers) {
      window.clearTimeout(timer)
    }
  }
}
