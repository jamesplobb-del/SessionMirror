/**
 * Routes take playback through Web Audio so iOS uses the main speaker
 * instead of the quiet earpiece (PlayAndRecord + muted element output).
 */

import {
  createAudioEnhancerChain,
  disposeAudioEnhancerChain,
  updateAudioEnhancerChain,
  type AudioEnhancerNodes,
  type AudioEnhancerSettings,
} from './audioEnhancer'
import {
  primePlaybackAudioContextSync,
  resumePlaybackAudioContext,
} from './playbackAudioContext'

export interface TakeSpeakerNodes {
  source: MediaElementAudioSourceNode
  gain: GainNode
  enhancer?: AudioEnhancerNodes
}

const speakerNodesByElement = new WeakMap<HTMLMediaElement, TakeSpeakerNodes>()
/** Tracks routed elements so enhancer state can be applied without WeakMap iteration. */
const routedSpeakerElements = new Set<HTMLMediaElement>()

let enhancerEnabled = false
let enhancerSettings: AudioEnhancerSettings | null = null

function resumePlaybackBus(): void {
  resumePlaybackAudioContext()
}

export function setTakePlaybackEnhancerState(
  enabled: boolean,
  settings?: AudioEnhancerSettings,
): void {
  enhancerEnabled = enabled
  enhancerSettings = settings ?? null

  for (const el of routedSpeakerElements) {
    const nodes = speakerNodesByElement.get(el)
    if (!nodes) {
      routedSpeakerElements.delete(el)
      continue
    }

    if (!enhancerEnabled || !enhancerSettings) {
      disconnectEnhancer(nodes)
      continue
    }
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
  }

  resumePlaybackBus()
}

function disconnectEnhancer(nodes: TakeSpeakerNodes): void {
  if (!nodes.enhancer) {
    try {
      nodes.gain.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.gain.connect(nodes.source.context.destination)
    } catch {
      /* already connected */
    }
    return
  }

  const enhancer = nodes.enhancer
  nodes.enhancer = undefined

  try {
    nodes.gain.disconnect()
    disposeAudioEnhancerChain(enhancer)
  } catch {
    /* already rewired */
  }

  try {
    nodes.gain.connect(nodes.source.context.destination)
  } catch {
    /* already connected */
  }
}

function ensureEnhancerForElement(_el: HTMLMediaElement, nodes: TakeSpeakerNodes): void {
  if (!enhancerEnabled || !enhancerSettings || nodes.enhancer) return

  const ctx = nodes.source.context as AudioContext
  const chain = createAudioEnhancerChain(ctx, enhancerSettings)

  try {
    nodes.gain.disconnect()
  } catch {
    /* ignore */
  }

  nodes.gain.connect(chain.input)
  chain.output.connect(ctx.destination)
  nodes.enhancer = chain
}

/** Reconnect source→gain after pitch analysis teardown left the bus open. */
function repairSpeakerBus(el: HTMLMediaElement, nodes: TakeSpeakerNodes): void {
  try {
    nodes.source.connect(nodes.gain)
  } catch {
    /* already connected */
  }

  if (enhancerEnabled && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
    return
  }

  disconnectEnhancer(nodes)
}

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
    try {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      nodes = { source, gain }
      speakerNodesByElement.set(el, nodes)
      routedSpeakerElements.add(el)
      el.muted = true
    } catch {
      // Element may already be wired (e.g. pitch graph) — bail without muting.
      resumePlaybackBus()
      return
    }
  } else {
    repairSpeakerBus(el, nodes)
  }

  nodes.gain.gain.value = muted ? 0 : volume

  if (enhancerEnabled && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
  } else {
    disconnectEnhancer(nodes)
  }

  resumePlaybackBus()
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
