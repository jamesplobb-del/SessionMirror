import type { AudioSessionPlugin } from './audioSession'

export class AudioSessionWeb implements AudioSessionPlugin {
  async routeToSpeaker(): Promise<void> {
    /* no-op on web */
  }
}
