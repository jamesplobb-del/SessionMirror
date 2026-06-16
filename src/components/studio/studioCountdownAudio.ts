/** Isolated countdown clicks — equal loudness, context always resumed before each tick. */

let countCtx: AudioContext | null = null
let masterGain: GainNode | null = null

const TICK_HZ = 880
const TICK_PEAK = 0.52
const TICK_DURATION_SEC = 0.08

async function ensureCountdownAudio(): Promise<AudioContext | null> {
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

/** Play one count-in tick at consistent volume. */
export async function playCountdownTick(): Promise<void> {
  const ctx = await ensureCountdownAudio()
  if (!ctx || !masterGain) return

  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const envelope = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = TICK_HZ
  envelope.gain.setValueAtTime(TICK_PEAK, t)
  envelope.gain.exponentialRampToValueAtTime(0.001, t + TICK_DURATION_SEC)

  osc.connect(envelope)
  envelope.connect(masterGain)
  osc.start(t)
  osc.stop(t + TICK_DURATION_SEC + 0.01)
}

export function closeCountdownAudio(): void {
  countCtx?.close().catch(() => {})
  countCtx = null
  masterGain = null
}
