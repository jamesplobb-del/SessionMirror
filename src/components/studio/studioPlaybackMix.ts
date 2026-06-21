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
let contextWatchAttached = false

function attachContextWatch(ctx: AudioContext): void {
  if (contextWatchAttached) return
  contextWatchAttached = true
  ctx.addEventListener('statechange', () => {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  })
}

function getMixContext(): AudioContext {
  if (!mixContext || mixContext.state === 'closed') {
    mixContext = primePlaybackAudioContextSync()
    contextWatchAttached = false
  }
  attachContextWatch(mixContext)
  return mixContext
}

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
      return
    }
  }

  nodes.gain.gain.value = muted ? 0 : volume
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

export function suspendMixContext(): void {
  if (!mixContext || mixContext.state !== 'running') return
  void mixContext.suspend().catch(() => {})
}

export function keepMixContextAlive(): void {
  resumeMixContext()
}

export function closeMixContext(): void {
  mixContext = null
  contextWatchAttached = false
}
