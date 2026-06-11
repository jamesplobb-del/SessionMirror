import { Capacitor, registerPlugin } from '@capacitor/core'

export interface SessionMirrorAudioPlugin {
  primeSpeakerPlayback(): Promise<void>
}

const SessionMirrorAudio = registerPlugin<SessionMirrorAudioPlugin>('SessionMirrorAudio', {
  web: () => import('./sessionMirrorAudio.web').then((module) => new module.SessionMirrorAudioWeb()),
})

/** Re-assert loudspeaker routing on iOS before take playback. */
export async function primeNativeSpeakerPlayback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await SessionMirrorAudio.primeSpeakerPlayback()
  } catch (error: unknown) {
    console.warn('Native speaker playback prime failed:', error)
  }
}
