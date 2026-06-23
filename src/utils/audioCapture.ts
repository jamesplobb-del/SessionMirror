/** Music / instrument recording — disable voice-call processing (matches Camera app intent). */

export const RECORDING_AUDIO_BITS_PER_SECOND = 320_000

export function getMusicRecordingAudioConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
  }
}

/** Force-disable VoIP-style processing when the browser allows it. */
export async function tuneMusicRecordingAudioTrack(track: MediaStreamTrack): Promise<void> {
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

export async function tuneMusicRecordingStream(stream: MediaStream): Promise<void> {
  await Promise.all(
    stream.getAudioTracks().map((track) => tuneMusicRecordingAudioTrack(track)),
  )
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
