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
  zoom?: { min?: number; max?: number }
}

type ZoomCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => ZoomCapableCapabilities
}

/** Keep front camera at 1× after iOS background resume (WebKit track zoom can stick). */
export async function resetFrontCameraZoom(stream: MediaStream): Promise<void> {
  const track = stream.getVideoTracks()[0] as ZoomCapableTrack | undefined
  if (!track || track.readyState !== 'live') return

  try {
    const capabilities = track.getCapabilities?.() as ZoomCapableCapabilities | undefined
    if (capabilities?.zoom) {
      const minZoom = capabilities.zoom.min ?? 1
      await track.applyConstraints({
        advanced: [{ zoom: minZoom } as MediaTrackConstraintSet],
      })
    }
  } catch {
    /* zoom constraint unsupported or rejected */
  }

  try {
    await track.applyConstraints(getPortraitVideoCaptureConstraints())
  } catch {
    /* keep current FOV if portrait constraints are rejected */
  }
}
