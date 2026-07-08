import { getAudioOutputLatencyMs } from '../../utils/nativeCameraTest'

/**
 * WKWebView HTMLMediaElement audio reaches the speaker later than Web Audio
 * scheduled clicks, even after play() resolves and currentTime advances.
 * Empirically ~100–130ms on iPhone; tune here if needed.
 */
export const WEBKIT_MEDIA_RENDER_OVERHEAD_MS = 165

/** Delay the metronome's first click so it lands when reference audio is audible. */
export async function getMetronomeDelayAfterReferenceSec(): Promise<number> {
  const outputMs = await getAudioOutputLatencyMs()
  return (WEBKIT_MEDIA_RENDER_OVERHEAD_MS + outputMs) / 1000
}

/**
 * How far ahead of the click-grid timeline a chased media element's currentTime
 * should sit so its AUDIBLE output aligns with the AUDIBLE clicks. Hardware
 * output latency cancels (click and media share the same output route), leaving
 * only the WKWebView media pipeline overhead.
 */
export function getReferenceChaseLeadSec(): number {
  return WEBKIT_MEDIA_RENDER_OVERHEAD_MS / 1000
}
