import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AudioSessionPlugin {
  activatePlayback(): Promise<void>
  activateRecording(): Promise<void>
}

const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession', {
  web: () => ({
    activatePlayback: async () => {},
    activateRecording: async () => {},
  }),
})

/** Switch iOS AVAudioSession to playback (main speaker) before take playback. */
export async function activateNativePlaybackSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.activatePlayback()
  } catch (error) {
    console.warn('Native playback audio session failed:', error)
  }
}

/** Restore play-and-record session after take playback for mic capture. */
export async function activateNativeRecordingSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.activateRecording()
  } catch (error) {
    console.warn('Native recording audio session failed:', error)
  }
}
