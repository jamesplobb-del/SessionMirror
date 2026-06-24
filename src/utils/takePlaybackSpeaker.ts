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
  armPlaybackGraphKeepAlive,
  disarmPlaybackGraphKeepAlive,
} from './playbackGraphKeepAlive'
import {
  primePlaybackAudioContextSync,
  resumePlaybackAudioContext,
} from './playbackAudioContext'
import { subscribePlaybackOutputProfile } from './audioOutputProfile'
import { effectiveSpeakerGain } from './playbackVolume'

export interface TakeSpeakerPassthrough {
  input: GainNode
  output: GainNode
}

export interface TakeSpeakerNodes {
  source: MediaElementAudioSourceNode
  gain: GainNode
  enhancer?: AudioEnhancerNodes
  passthrough?: TakeSpeakerPassthrough
  keepAliveAnalyser?: AnalyserNode
}

export function isTakePlaybackEnhancerEnabled(): boolean {
  return enhancerEnabled
}

const speakerNodesByElement = new WeakMap<HTMLMediaElement, TakeSpeakerNodes>()
const routedSpeakerElements = new Set<HTMLMediaElement>()

let enhancerEnabled = false
let enhancerSettings: AudioEnhancerSettings | null = null

function resumePlaybackBus(): void {
  void resumePlaybackAudioContext()
}

/**
 * Output flows through the Web Audio graph, so the element must stay UNMUTED.
 * iOS WKWebView throttles/stops decoding muted media elements after ~1s, which
 * starves the MediaElementSource and cuts audio out. createMediaElementSource
 * reroutes the element's output into the graph, so an unmuted element does not
 * double-play — the GainNode (and optional enhancer) control what we hear.
 */
function applyGraphOutputElementState(el: HTMLMediaElement): void {
  el.muted = false
  if (el.volume <= 0) {
    el.volume = 1
  }
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

    applyGraphOutputElementState(el)

    if (!enhancerEnabled || !enhancerSettings) {
      disconnectEnhancer(nodes)
      ensurePassthroughChain(nodes)
      nodes.gain.gain.value = effectiveSpeakerGain(1, false, true)
      armPlaybackGraphKeepAlive(el, nodes)
      continue
    }
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
    nodes.gain.gain.value = effectiveSpeakerGain(1, false, true)
    armPlaybackGraphKeepAlive(el, nodes)
  }

  resumePlaybackBus()
}

function disconnectPassthrough(nodes: TakeSpeakerNodes): void {
  if (!nodes.passthrough) return

  const passthrough = nodes.passthrough
  nodes.passthrough = undefined

  try {
    nodes.gain.disconnect()
  } catch {
    /* already disconnected */
  }

  try {
    passthrough.input.disconnect()
    passthrough.output.disconnect()
  } catch {
    /* already disconnected */
  }
}

function ensurePassthroughChain(nodes: TakeSpeakerNodes): void {
  const ctx = nodes.source.context as AudioContext

  if (nodes.passthrough) {
    try {
      nodes.gain.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.gain.connect(nodes.passthrough.input)
    } catch {
      /* already connected */
    }
    try {
      nodes.passthrough.output.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.passthrough.output.connect(ctx.destination)
    } catch {
      /* already connected */
    }
    return
  }

  const bridge = ctx.createGain()
  const output = ctx.createGain()
  bridge.gain.value = 1
  output.gain.value = 1
  bridge.connect(output)
  output.connect(ctx.destination)

  try {
    nodes.gain.disconnect()
  } catch {
    /* ignore */
  }

  nodes.gain.connect(bridge)
  nodes.passthrough = { input: bridge, output }
}

function disconnectEnhancer(nodes: TakeSpeakerNodes): void {
  if (!nodes.enhancer) {
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
}

function ensureEnhancerForElement(_el: HTMLMediaElement, nodes: TakeSpeakerNodes): void {
  if (!enhancerEnabled || !enhancerSettings || nodes.enhancer) return

  disconnectPassthrough(nodes)

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
  ensurePassthroughChain(nodes)
}

export function getTakePlaybackSpeakerNodes(
  el: HTMLMediaElement,
): TakeSpeakerNodes | undefined {
  return speakerNodesByElement.get(el)
}

export function registerTakePlaybackSpeakerRoute(
  el: HTMLMediaElement,
  source: MediaElementAudioSourceNode,
  gain: GainNode,
): void {
  const existing = speakerNodesByElement.get(el)
  if (existing) {
    if (existing.source === source && existing.gain === gain) {
      repairSpeakerBus(el, existing)
      applyGraphOutputElementState(el)
      existing.gain.gain.value = effectiveSpeakerGain(1, false, true)
      armPlaybackGraphKeepAlive(el, existing)
    }
    return
  }

  const nodes: TakeSpeakerNodes = { source, gain }
  speakerNodesByElement.set(el, nodes)
  routedSpeakerElements.add(el)
  applyGraphOutputElementState(el)
  repairSpeakerBus(el, nodes)
  gain.gain.value = effectiveSpeakerGain(1, false, true)
  armPlaybackGraphKeepAlive(el, nodes)
}

export function hasTakePlaybackSpeakerRoute(el: HTMLMediaElement): boolean {
  return speakerNodesByElement.has(el)
}

export interface RouteTakePlaybackOptions {
  /** @deprecated Retained for call-site compatibility — all playback now uses the Web Audio bus. */
  allowNativeDirect?: boolean
}

/**
 * Wire a media element into the shared Web Audio speaker bus. A single output
 * path (bus + optional enhancer) is used for every take so that volume and
 * routing stay consistent whether the enhancer is on or off. The element is
 * never muted (see applyGraphOutputElementState).
 */
export function routeTakePlaybackToSpeaker(
  el: HTMLMediaElement,
  volume = 1,
  muted = false,
  _options: RouteTakePlaybackOptions = {},
): void {
  const existingNodes = speakerNodesByElement.get(el)
  const ctx = primePlaybackAudioContextSync()

  let nodes = existingNodes
  if (!nodes) {
    try {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      source.connect(gain)
      nodes = { source, gain }
      speakerNodesByElement.set(el, nodes)
      routedSpeakerElements.add(el)
    } catch {
      nodes = speakerNodesByElement.get(el)
      if (!nodes) {
        // Element could not be captured by Web Audio — play it natively, unmuted,
        // and rely on AVAudioSession (.speaker) for loud, uninterrupted output.
        resumePlaybackBus()
        disarmPlaybackGraphKeepAlive(el)
        el.muted = muted
        el.volume = muted ? 0 : 1
        return
      }
      repairSpeakerBus(el, nodes)
    }
  } else {
    repairSpeakerBus(el, nodes)
  }

  applyGraphOutputElementState(el)
  nodes.gain.gain.value = effectiveSpeakerGain(volume, muted, true)

  if (enhancerEnabled && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
  } else {
    disconnectEnhancer(nodes)
    ensurePassthroughChain(nodes)
  }

  armPlaybackGraphKeepAlive(el, nodes)
  resumePlaybackBus()
}

export function updateTakePlaybackSpeakerGain(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  const nodes = speakerNodesByElement.get(el)
  if (nodes) {
    nodes.gain.gain.value = effectiveSpeakerGain(volume, muted, true)
  }
}

function refreshAllSpeakerGains(): void {
  for (const el of routedSpeakerElements) {
    const nodes = speakerNodesByElement.get(el)
    if (!nodes) continue
    nodes.gain.gain.value = effectiveSpeakerGain(1, false, true)
  }
}

subscribePlaybackOutputProfile(() => {
  refreshAllSpeakerGains()
})
