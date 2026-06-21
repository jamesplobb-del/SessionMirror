import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AudioSessionPlugin {
  activatePlayback(): Promise<void>
  activateRecording(): Promise<void>
  routeOutputToSpeaker(): Promise<void>
}

const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession', {
  web: () => ({
    activatePlayback: async () => {},
    activateRecording: async () => {},
    routeOutputToSpeaker: async () => {},
  }),
})

export async function activateNativePlaybackSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.activatePlayback()
  } catch (error) {
    console.warn('Native playback audio session failed:', error)
  }
}

export async function activateNativeRecordingSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.activateRecording()
  } catch (error) {
    console.warn('Native recording audio session failed:', error)
  }
}

/** Main speaker without changing category — safe while mic is live (overdub / metronome). */
export async function routeNativeOutputToSpeaker(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.routeOutputToSpeaker()
  } catch (error) {
    console.warn('Native speaker routing failed:', error)
  }
}
