/** Studio count-in and optional recording metronome clicks. */

import { routeNativeOutputToSpeaker } from '../../plugins/audioSession'
import { getPlaybackAudioContext } from '../../utils/playbackAudioContext'

const TICK_HZ = 880
const ACCENT_HZ = 1320
const TICK_PEAK = 0.48
const ACCENT_PEAK = 0.58
const TICK_DURATION_SEC = 0.07

let masterGain: GainNode | null = null

/** Call synchronously inside a user gesture before count-in. */
export function primeStudioMetronomeAudioSync(): void {
  void getPlaybackAudioContext().then((ctx) => {
    if (!masterGain || masterGain.context !== ctx) {
      masterGain = ctx.createGain()
      masterGain.gain.value = 1
      masterGain.connect(ctx.destination)
    }
  })
}

async function ensureMetronomeAudio(): Promise<AudioContext | null> {
  await routeNativeOutputToSpeaker()
  const ctx = await getPlaybackAudioContext()
  if (!masterGain || masterGain.context !== ctx) {
    masterGain = ctx.createGain()
    masterGain.gain.value = 1
    masterGain.connect(ctx.destination)
  }
  return ctx
}

export async function playMetronomeClick(accent = false): Promise<void> {
  const ctx = await ensureMetronomeAudio()
  if (!ctx || !masterGain) return
  if (ctx.state !== 'running') {
    await ctx.resume().catch(() => {})
  }
  if (ctx.state !== 'running') return

  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const envelope = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = accent ? ACCENT_HZ : TICK_HZ
  const peak = accent ? ACCENT_PEAK : TICK_PEAK
  envelope.gain.setValueAtTime(peak, t)
  envelope.gain.exponentialRampToValueAtTime(0.001, t + TICK_DURATION_SEC)

  osc.connect(envelope)
  envelope.connect(masterGain)
  osc.start(t)
  osc.stop(t + TICK_DURATION_SEC + 0.01)
}

export function beatIntervalMs(bpm: number): number {
  return Math.round(60000 / Math.max(40, Math.min(240, bpm)))
}

export function closeStudioMetronomeAudio(): void {
  try {
    masterGain?.disconnect()
  } catch {
    /* ignore */
  }
  masterGain = null
}
