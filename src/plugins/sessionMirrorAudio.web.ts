import type { SessionMirrorAudioPlugin } from './sessionMirrorAudio'

export class SessionMirrorAudioWeb implements SessionMirrorAudioPlugin {
  async primeSpeakerPlayback(): Promise<void> {
    /* no-op on web */
  }
}
