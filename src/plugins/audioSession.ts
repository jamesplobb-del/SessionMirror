import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AudioSessionPlugin {
  routeToSpeaker(): Promise<void>
}

const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession', {
  web: () => import('./audioSessionWeb').then((module) => new module.AudioSessionWeb()),
})

/** Force iOS output to the built-in loudspeaker(s) instead of the quiet earpiece. */
export async function routeNativeOutputToSpeaker(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSession.routeToSpeaker()
  } catch (error: unknown) {
    console.warn('Native speaker routing failed:', error)
  }
}
