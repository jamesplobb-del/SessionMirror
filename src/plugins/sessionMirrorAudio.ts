import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SessionMirrorAudioPlugin {
  primeSpeakerPlayback(): Promise<void>
  restoreRecordingSession(): Promise<void>
}

const SessionMirrorAudio = registerPlugin<SessionMirrorAudioPlugin>('SessionMirrorAudio', {
  web: () => import('./sessionMirrorAudio.web').then((module) => new module.SessionMirrorAudioWeb()),
})

/** Switch iOS to the loud, full-range stereo playback session before a take plays. */
export async function primeNativeSpeakerPlayback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await SessionMirrorAudio.primeSpeakerPlayback()
  } catch (error: unknown) {
    console.warn('Native speaker playback prime failed:', error)
  }
}

/** Restore the mic-capture session after playback so recording / monitoring works. */
export async function restoreNativeRecordingSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await SessionMirrorAudio.restoreRecordingSession()
  } catch (error: unknown) {
    console.warn('Native recording session restore failed:', error)
  }
}
