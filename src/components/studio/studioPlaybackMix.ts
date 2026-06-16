/**
 * Routes multiple <video> elements through one shared AudioContext so
 * iOS Safari can output every track simultaneously (native .play() alone
 * only audibly plays the last element).
 */

import { primePlaybackAudioContextSync } from '../../utils/playbackAudioContext'

interface MixNodes {
  source: MediaElementAudioSourceNode
  gain: GainNode
}

const mixNodesByElement = new WeakMap<HTMLVideoElement, MixNodes>()

let mixContext: AudioContext | null = null

function getMixContext(): AudioContext {
  if (!mixContext || mixContext.state === 'closed') {
    mixContext = primePlaybackAudioContextSync()
  }
  return mixContext
}

/** Wire a video element into the shared mix bus (once per element lifetime). */
export function connectVideoToMix(
  el: HTMLVideoElement,
  volume: number,
  muted: boolean,
): void {
  const ctx = getMixContext()

  let nodes = mixNodesByElement.get(el)
  if (!nodes) {
    try {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      nodes = { source, gain }
      mixNodesByElement.set(el, nodes)
    } catch {
      // Element may already be wired by another audio graph — skip silently.
      return
    }
  }

  nodes.gain.gain.value = muted ? 0 : volume
  // Prevent double-routing on browsers that still honor element output
  el.muted = true
}

export function updateMixGain(el: HTMLVideoElement, volume: number, muted: boolean): void {
  const nodes = mixNodesByElement.get(el)
  if (nodes) {
    nodes.gain.gain.value = muted ? 0 : volume
  }
}

export function resumeMixContext(): void {
  const ctx = getMixContext()
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
}

export function closeMixContext(): void {
  mixContext?.close().catch(() => {})
  mixContext = null
}
