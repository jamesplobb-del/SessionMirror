import type { RecordingOrientation } from './takeVideoTransform'

/**
 * Full field-of-view front camera — no width/height/aspect locks (those crop/zoom on iOS).
 */
export function getPortraitVideoCaptureConstraints(): MediaTrackConstraints {
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
