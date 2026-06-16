/**
 * Routes take playback through Web Audio so iOS uses the main speaker
 * instead of the quiet earpiece (PlayAndRecord + muted element output).
 */

import { primePlaybackAudioContextSync } from './playbackAudioContext'

export interface TakeSpeakerNodes {
  source: MediaElementAudioSourceNode
  gain: GainNode
}

const speakerNodesByElement = new WeakMap<HTMLMediaElement, TakeSpeakerNodes>()

export function getTakePlaybackSpeakerNodes(
  el: HTMLMediaElement,
): TakeSpeakerNodes | undefined {
  return speakerNodesByElement.get(el)
}

export function hasTakePlaybackSpeakerRoute(el: HTMLMediaElement): boolean {
  return speakerNodesByElement.has(el)
}

/** Wire a media element into the shared speaker bus (once per element lifetime). */
export function routeTakePlaybackToSpeaker(
  el: HTMLMediaElement,
  volume = 1,
  muted = false,
): void {
  const ctx = primePlaybackAudioContextSync()

  let nodes = speakerNodesByElement.get(el)
  if (!nodes) {
    const source = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    source.connect(gain)
    gain.connect(ctx.destination)
    nodes = { source, gain }
    speakerNodesByElement.set(el, nodes)
    el.muted = true
  }

  nodes.gain.gain.value = muted ? 0 : volume

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
}

export function updateTakePlaybackSpeakerGain(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  const nodes = speakerNodesByElement.get(el)
  if (nodes) {
    nodes.gain.gain.value = muted ? 0 : volume
  }
}
