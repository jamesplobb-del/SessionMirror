import { getTakePlaybackSpeakerNodes, isTakePlaybackEnhancerEnabled } from './takePlaybackSpeaker'
import { isSharedPlaybackContext } from './playbackAudioContext'

export function debugPlaybackLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'fba730',
    },
    body: JSON.stringify({
      sessionId: 'fba730',
      location,
      message,
      data,
      timestamp: Date.now(),
      hypothesisId,
    }),
  }).catch(() => {})
  // #endregion
}

export function debugPlaybackSnapshot(
  location: string,
  media: HTMLMediaElement,
  label: string,
  hypothesisId: string,
): void {
  const nodes = getTakePlaybackSpeakerNodes(media)
  const ctx = nodes?.source.context as AudioContext | undefined
  debugPlaybackLog(
    location,
    label,
    {
      enhancerEnabled: isTakePlaybackEnhancerEnabled(),
      hasSpeakerRoute: Boolean(nodes),
      hasEnhancerChain: Boolean(nodes?.enhancer),
      hasPassthrough: Boolean(nodes?.passthrough),
      busGain: nodes?.gain.gain.value ?? null,
      elMuted: media.muted,
      elVolume: media.volume,
      elPaused: media.paused,
      elCurrentTime: media.currentTime,
      elReadyState: media.readyState,
      ctxState: ctx?.state ?? null,
      ctxIsShared: ctx ? isSharedPlaybackContext(ctx) : null,
    },
    hypothesisId,
  )
}
