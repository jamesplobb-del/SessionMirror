/**
 * Routes multiple <video> elements through the shared take speaker bus so
 * iOS outputs every track simultaneously on the main speaker.
 */

import { routeTakePlaybackToSpeaker, updateTakePlaybackSpeakerGain } from '../../utils/takePlaybackSpeaker'
import { primePlaybackAudioContextSync } from '../../utils/playbackAudioContext'

/** Wire a video element into the shared mix bus (once per element lifetime). */
export function connectVideoToMix(
  el: HTMLVideoElement,
  volume: number,
  muted: boolean,
): void {
  primePlaybackAudioContextSync()
  routeTakePlaybackToSpeaker(el, volume, muted)
}

export function updateMixGain(el: HTMLVideoElement, volume: number, muted: boolean): void {
  updateTakePlaybackSpeakerGain(el, volume, muted)
}

export function resumeMixContext(): void {
  primePlaybackAudioContextSync()
}

/** Suspend shared playback context before MediaRecorder on iOS. */
export function suspendMixContext(): void {
  const ctx = primePlaybackAudioContextSync()
  if (ctx.state !== 'running') return
  void ctx.suspend().catch(() => {})
}

export function keepMixContextAlive(): void {
  resumeMixContext()
}

export function closeMixContext(): void {
  /* Shared app AudioContext — only clear local bookkeeping if added later. */
}
