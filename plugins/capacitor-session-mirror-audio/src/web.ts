import type { SessionMirrorAudioPlugin } from './definitions'

export class SessionMirrorAudioWeb implements SessionMirrorAudioPlugin {
  async prepareForTakePlayback(): Promise<void> {}

  async prepareForMicCapture(): Promise<void> {}
}
