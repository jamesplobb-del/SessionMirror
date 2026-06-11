import { resumePitchGraphsForMedia } from '../hooks/useLivePitchTracker'
import { agentDebugLog } from './agentDebugLog'
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

function primeMediaElements(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  for (const element of media) {
    if (!element) continue
    element.muted = false
    element.defaultMuted = false
    element.volume = 1
    element.setAttribute('playsinline', 'true')
    element.setAttribute('webkit-playsinline', 'true')
    // #region agent log
    agentDebugLog(
      'takePlaybackAudio.ts:primeMediaElements',
      'primed media for playback',
      {
        srcKind: element.src.startsWith('blob:')
          ? 'blob'
          : element.src.includes('capacitor')
            ? 'capacitor'
            : 'other',
        muted: element.muted,
        volume: element.volume,
        tag: element.getAttribute('data-debug-playback-tag') ?? 'unknown',
      },
      'H-B',
    )
    // #endregion
  }
}

/** Prepare playback — await before calling .play() so mic is released first. */
export async function primeTakePlaybackAudio(
  ...media: Array<HTMLMediaElement | null | undefined>
): Promise<void> {
  await suspendMicInput?.()
  primePlaybackAudioContextSync()
  primeMediaElements(...media)
  resumePitchGraphsForMedia(...media)
}

/** Sync helper — prefer await primeTakePlaybackAudio() before play. */
export function primeTakePlaybackAudioSync(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void primeTakePlaybackAudio(...media)
}

/** Restore mic capture after take playback finishes. */
export async function releaseTakePlaybackAudio(): Promise<void> {
  await resumeMicInput?.()
}
