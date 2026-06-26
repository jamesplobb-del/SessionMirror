/** Music / instrument recording — profile-aware mic constraints. */

export const RECORDING_AUDIO_BITS_PER_SECOND = 320_000

export type CaptureProfile = 'natural' | 'loudCameraLike'

let activeCaptureProfile: CaptureProfile = 'natural'

export function setActiveCaptureProfile(profile: CaptureProfile): void {
  activeCaptureProfile = profile
}

export function getActiveCaptureProfile(): CaptureProfile {
  return activeCaptureProfile
}

export function parseCaptureProfile(_value: unknown): CaptureProfile {
  return 'natural'
}

/** Natural — prior BestTake behavior (AGC off, stereo ideal). */
export function getNaturalCaptureAudioConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
  }
}

/**
 * Loud Camera-like — closer to iPhone Camera app levels:
 * AGC on, VoIP processing off, mono preferred to avoid a silent stereo channel.
 */
export function getLoudCameraLikeCaptureAudioConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1, max: 2 },
    sampleRate: { ideal: 48000 },
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: true },
  }
}

export function getCaptureAudioConstraints(
  profile: CaptureProfile = activeCaptureProfile,
): MediaTrackConstraints {
  return profile === 'loudCameraLike'
    ? getLoudCameraLikeCaptureAudioConstraints()
    : getNaturalCaptureAudioConstraints()
}

/** @deprecated Use getCaptureAudioConstraints */
export function getMusicRecordingAudioConstraints(): MediaTrackConstraints {
  return getCaptureAudioConstraints()
}

async function tuneNaturalCaptureAudioTrack(track: MediaStreamTrack): Promise<void> {
  const attempts: MediaTrackConstraints[] = [
    {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
    },
    {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
    },
  ]

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints)
      const settings = track.getSettings()
      if (settings.echoCancellation === false || settings.noiseSuppression === false) {
        return
      }
    } catch {
      /* try next constraint shape */
    }
  }
}

async function tuneLoudCameraLikeCaptureAudioTrack(track: MediaStreamTrack): Promise<void> {
  const attempts: MediaTrackConstraints[] = [
    {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    },
    {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
    },
    {
      autoGainControl: true,
      channelCount: 1,
    },
  ]

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints)
      const settings = track.getSettings()
      if (settings.autoGainControl === true) {
        return
      }
    } catch {
      /* try next constraint shape */
    }
  }
}

export async function tuneCaptureAudioTrack(
  track: MediaStreamTrack,
  profile: CaptureProfile = activeCaptureProfile,
): Promise<void> {
  if (profile === 'loudCameraLike') {
    await tuneLoudCameraLikeCaptureAudioTrack(track)
    return
  }
  await tuneNaturalCaptureAudioTrack(track)
}

export async function tuneCaptureStream(
  stream: MediaStream,
  profile: CaptureProfile = activeCaptureProfile,
): Promise<void> {
  await Promise.all(
    stream.getAudioTracks().map((track) => tuneCaptureAudioTrack(track, profile)),
  )
}

/** @deprecated Use tuneCaptureStream */
export async function tuneMusicRecordingStream(stream: MediaStream): Promise<void> {
  await tuneCaptureStream(stream, getActiveCaptureProfile())
}

/** Reduce speaker bleed from reference playback into the mic while recording. */
export async function tunePlaybackIsolationAudioTrack(track: MediaStreamTrack): Promise<void> {
  const attempts: MediaTrackConstraints[] = [
    {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    },
    {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: false },
    },
  ]

  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints)
      const settings = track.getSettings()
      if (settings.echoCancellation === true || settings.noiseSuppression === true) {
        return
      }
    } catch {
      /* try next constraint shape */
    }
  }
}

export async function tunePlaybackIsolationStream(stream: MediaStream): Promise<void> {
  await Promise.all(
    stream.getAudioTracks().map((track) => tunePlaybackIsolationAudioTrack(track)),
  )
}
