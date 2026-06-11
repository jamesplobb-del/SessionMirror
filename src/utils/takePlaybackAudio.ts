import { resumePitchGraphsForMedia, setMediaPlaybackVolume } from '../hooks/useLivePitchTracker'
import {
  primeNativeSpeakerPlayback,
  restoreNativeRecordingSession,
} from '../plugins/sessionMirrorAudio'
import { primePlaybackAudioContextSync } from './playbackAudioContext'

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

/** Prepare HTML media elements for audible speaker playback using standard Web APIs. */
export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeNativeSpeakerPlayback()
  void suspendMicInput?.()
  primePlaybackAudioContextSync()

  for (const element of media) {
    if (!element) continue
    setMediaPlaybackVolume(element, element.volume > 0 ? element.volume : 1)
    element.defaultMuted = false
    element.setAttribute('playsinline', 'true')
    element.setAttribute('webkit-playsinline', 'true')
  }

  resumePitchGraphsForMedia(...media)
}

/** Async wrapper — prefer primeTakePlaybackAudioSync inside gesture handlers. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  primeTakePlaybackAudioSync(...media)
}

/** Restore mic capture and the recording audio session after take playback finishes. */
export async function releaseTakePlaybackAudio(): Promise<void> {
  await restoreNativeRecordingSession()
  await resumeMicInput?.()
}
