/**
 * iOS WKWebView starves muted MediaElementSource graphs unless something
 * actively reads from the audio graph (~1s cutout). Pull analyser data each frame.
 */

import type { TakeSpeakerNodes } from './takePlaybackSpeaker'

const activeMedia = new Set<HTMLMediaElement>()
const analysersByMedia = new WeakMap<HTMLMediaElement, AnalyserNode>()
const scratchByAnalyser = new WeakMap<AnalyserNode, Uint8Array>()
let rafId: number | null = null

function tick(): void {
  for (const media of activeMedia) {
    if (media.paused || media.ended) {
      activeMedia.delete(media)
      continue
    }

    const analyser = analysersByMedia.get(media)
    if (!analyser) {
      activeMedia.delete(media)
      continue
    }

    let scratch = scratchByAnalyser.get(analyser)
    if (!scratch || scratch.length !== analyser.frequencyBinCount) {
      scratch = new Uint8Array(analyser.frequencyBinCount)
      scratchByAnalyser.set(analyser, scratch)
    }
    analyser.getByteFrequencyData(scratch)
  }

  if (activeMedia.size > 0) {
    rafId = requestAnimationFrame(tick)
  } else {
    rafId = null
  }
}

function startLoop(): void {
  if (rafId !== null) return
  rafId = requestAnimationFrame(tick)
}

function ensureKeepAliveAnalyser(nodes: TakeSpeakerNodes): AnalyserNode {
  if (nodes.keepAliveAnalyser) {
    return nodes.keepAliveAnalyser
  }

  const ctx = nodes.source.context as AudioContext
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0

  try {
    nodes.gain.connect(analyser)
  } catch {
    /* parallel tap may already exist */
  }

  nodes.keepAliveAnalyser = analyser
  return analyser
}

export function armPlaybackGraphKeepAlive(
  media: HTMLMediaElement,
  nodes: TakeSpeakerNodes,
): void {
  const analyser = ensureKeepAliveAnalyser(nodes)
  analysersByMedia.set(media, analyser)
  activeMedia.add(media)
  startLoop()
}

export function disarmPlaybackGraphKeepAlive(media: HTMLMediaElement): void {
  activeMedia.delete(media)
}
