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

/** Prepare HTML media elements for audible speaker playback using standard Web APIs. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  await suspendMicInput?.()

  resumePlaybackAudioContext()

  for (const element of media) {
    if (!element) continue
    element.muted = false
    element.defaultMuted = false
    element.volume = 1
  }

  resumePitchGraphsForMedia(...media)
}

/** Restore mic capture after take playback finishes. */
export async function releaseTakePlaybackAudio(): Promise<void> {
  await resumeMicInput?.()
}
