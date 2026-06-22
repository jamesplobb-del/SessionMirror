/**
 * Routes take playback through Web Audio so iOS uses the main speaker
 * instead of the quiet earpiece (PlayAndRecord + muted element output).
 */

import { Capacitor } from '@capacitor/core'
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

/** iOS Web Audio element routing is quieter than native — boost on device. */
const NATIVE_SPEAKER_GAIN = 4

function effectiveSpeakerGain(volume: number, muted: boolean): number {
  if (muted) return 0
  const gain = Capacitor.isNativePlatform() ? volume * NATIVE_SPEAKER_GAIN : volume
  return Math.min(gain, 4)
}

function resumePlaybackBus(): void {
  void resumePlaybackAudioContext()
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

/** Reconnect source→gain and gain→destination after graph teardown. */
function ensureGainReachableDestination(nodes: TakeSpeakerNodes): void {
  const ctx = nodes.source.context as AudioContext

  if (nodes.enhancer) {
    try {
      nodes.gain.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.gain.connect(nodes.enhancer.input)
    } catch {
      /* already connected */
    }
    try {
      nodes.enhancer.output.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.enhancer.output.connect(ctx.destination)
    } catch {
      /* already connected */
    }
    return
  }

  try {
    nodes.gain.disconnect()
  } catch {
    /* already disconnected */
  }
  try {
    nodes.gain.connect(ctx.destination)
  } catch {
    /* already connected */
  }
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
  ensureGainReachableDestination(nodes)
}

export function getTakePlaybackSpeakerNodes(
  el: HTMLMediaElement,
): TakeSpeakerNodes | undefined {
  return speakerNodesByElement.get(el)
}

/**
 * Register an existing element→gain route (e.g. from pitch analysis) as the
 * shared speaker bus so enhancer state and repair logic apply consistently.
 */
export function registerTakePlaybackSpeakerRoute(
  el: HTMLMediaElement,
  source: MediaElementAudioSourceNode,
  gain: GainNode,
): void {
  const existing = speakerNodesByElement.get(el)
  if (existing) {
    if (existing.source === source && existing.gain === gain) {
      repairSpeakerBus(el, existing)
      el.muted = true
    }
    return
  }

  speakerNodesByElement.set(el, { source, gain })
  routedSpeakerElements.add(el)
  el.muted = true
  repairSpeakerBus(el, { source, gain })
}

export function hasTakePlaybackSpeakerRoute(el: HTMLMediaElement): boolean {
  return speakerNodesByElement.has(el)
}

export interface RouteTakePlaybackOptions {
  /**
   * Allow plain single-track playback to skip Web Audio and rely on the native
   * speaker route. Web Audio routing of a muted element is starved by iOS after
   * ~1s when nothing actively pulls from the graph, which cuts audio out.
   */
  allowNativeDirect?: boolean
}

/** Wire a media element into the shared speaker bus (once per element lifetime). */
export function routeTakePlaybackToSpeaker(
  el: HTMLMediaElement,
  volume = 1,
  muted = false,
  options: RouteTakePlaybackOptions = {},
): void {
  const existingNodes = speakerNodesByElement.get(el)

  // Native-direct path: no enhancer and the element was never wired into Web
  // Audio. Play the element itself, unmuted, and let the native AVAudioSession
  // (forced to .speaker in AppDelegate) drive the loud main speaker. This avoids
  // the iOS render-starvation cutout and the quieter Web Audio element route.
  if (options.allowNativeDirect && !existingNodes && !enhancerEnabled) {
    el.muted = muted
    el.volume = muted ? 0 : 1
    return
  }

  const ctx = primePlaybackAudioContextSync()

  let nodes = existingNodes
  if (!nodes) {
    try {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)
      nodes = { source, gain }
      speakerNodesByElement.set(el, nodes)
      routedSpeakerElements.add(el)
    } catch {
      // Element may already be wired (e.g. pitch graph registered the bus).
      nodes = speakerNodesByElement.get(el)
      if (!nodes) {
        resumePlaybackBus()
        // No Web Audio route — fall back to native output (quiet earpiece beats silence).
        el.muted = muted
        el.volume = muted ? 0 : volume
        return
      }
      repairSpeakerBus(el, nodes)
    }
  } else {
    repairSpeakerBus(el, nodes)
  }

  el.muted = true
  nodes.gain.gain.value = effectiveSpeakerGain(volume, muted)

  if (enhancerEnabled && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
  } else {
    disconnectEnhancer(nodes)
    ensureGainReachableDestination(nodes)
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
    nodes.gain.gain.value = effectiveSpeakerGain(volume, muted)
  }
}
