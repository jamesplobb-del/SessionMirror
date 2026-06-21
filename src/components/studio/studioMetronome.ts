/** Studio count-in and optional recording metronome clicks. */

let countCtx: AudioContext | null = null
let masterGain: GainNode | null = null

const TICK_HZ = 880
const ACCENT_HZ = 1320
const TICK_PEAK = 0.48
const ACCENT_PEAK = 0.58
const TICK_DURATION_SEC = 0.07

async function ensureMetronomeAudio(): Promise<AudioContext | null> {
  try {
    if (!countCtx || countCtx.state === 'closed') {
      countCtx = new AudioContext()
      masterGain = countCtx.createGain()
      masterGain.gain.value = 1
      masterGain.connect(countCtx.destination)
    }
    if (countCtx.state === 'suspended') {
      await countCtx.resume()
    }
    return countCtx
  } catch {
    return null
  }
}

export async function playMetronomeClick(accent = false): Promise<void> {
  const ctx = await ensureMetronomeAudio()
  if (!ctx || !masterGain) return

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
  countCtx?.close().catch(() => {})
  countCtx = null
  masterGain = null
}
