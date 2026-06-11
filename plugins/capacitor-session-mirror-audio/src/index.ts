import { registerPlugin } from '@capacitor/core'
import type { SessionMirrorAudioPlugin } from './definitions'

const SessionMirrorAudio = registerPlugin<SessionMirrorAudioPlugin>('SessionMirrorAudio', {
  web: () => import('./web.js').then((module) => new module.SessionMirrorAudioWeb()),
})

export * from './definitions'
export { SessionMirrorAudio }
