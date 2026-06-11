export interface SessionMirrorAudioPlugin {
  /** Switch AVAudioSession to playback on the loudspeaker (mic should be suspended). */
  prepareForTakePlayback(): Promise<void>
  /** Restore AVAudioSession for microphone capture after playback ends. */
  prepareForMicCapture(): Promise<void>
}
