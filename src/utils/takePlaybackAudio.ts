import { Capacitor } from '@capacitor/core'
import { SessionMirrorAudio } from 'capacitor-session-mirror-audio'
import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { resumePlaybackAudioContext } from './playbackAudioContext'

type MicHandler = () => void | Promise<void>

let suspendMicInput: MicHandler | null = null
let resumeMicInput: MicHandler | null = null

export function registerTakePlaybackMicHandlers(handlers: {
  suspendMic: MicHandler
  resumeMic: MicHandler
}): void {
  suspendMicInput = handlers.suspendMic
  resumeMicInput = handlers.resumeMic
}

export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  await suspendMicInput?.()

  if (Capacitor.isNativePlatform()) {
    try {
      await SessionMirrorAudio.prepareForTakePlayback()
    } catch {
      /* native session may already be in playback mode */
    }
  }

  resumePlaybackAudioContext()

  for (const element of media) {
    if (!element) continue
    element.muted = false
    element.defaultMuted = false
    element.volume = 1
  }

  resumePitchGraphsForMedia(...media)
}

export async function releaseTakePlaybackAudio(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SessionMirrorAudio.prepareForMicCapture()
    } catch {
      /* best effort */
    }
  }

  await resumeMicInput?.()
}
