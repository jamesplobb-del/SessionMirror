import type { RecordingOrientation } from './takeVideoTransform'

/** Soft portrait request — height/aspect only to avoid iOS front-camera crop. */
export function getPortraitVideoCaptureConstraints(): MediaTrackConstraints {
  return {
    facingMode: 'user',
    frameRate: { ideal: 30, max: 60 },
    height: { ideal: 1920 },
    aspectRatio: { ideal: 9 / 16 },
  }
}

/** Landscape 16:9 capture. */
export function getLandscapeVideoCaptureConstraints(): MediaTrackConstraints {
  return {
    facingMode: 'user',
    frameRate: { ideal: 30, max: 60 },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
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

export async function tuneVideoRecordingTrack(
  track: MediaStreamTrack,
  orientation: RecordingOrientation,
): Promise<void> {
  if (track.kind !== 'video') return

  const attempts: MediaTrackConstraints[] = [
    getVideoCaptureConstraintsForOrientation(orientation),
    { frameRate: { ideal: 30, max: 60 } },
  ]

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints)
    } catch {
      /* keep best effort from prior attempt */
    }
  }
}

export async function tuneVideoRecordingStream(
  stream: MediaStream,
  orientation: RecordingOrientation,
): Promise<void> {
  const track = stream.getVideoTracks()[0]
  if (!track) return
  await tuneVideoRecordingTrack(track, orientation)
}
