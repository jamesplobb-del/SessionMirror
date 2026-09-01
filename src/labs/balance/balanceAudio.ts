import {
  startClickTrack,
  startDrone,
  type ClickTrackHandle,
  type DroneHandle,
} from '../staffJumper/staffJumperAudio'

export interface BalanceCountInHandle {
  done: Promise<void>
  stop(): void
}

export async function startBalanceCountIn(): Promise<BalanceCountInHandle> {
  const click = await startClickTrack({
    bpm: 72,
    soundId: 'classic',
    audible: false,
    countInBars: 1,
    meter: 'simple',
  })
  let timer: number | null = null
  const done = new Promise<void>((resolve) => {
    const poll = () => {
      if (click.countInRemainingSec() <= 0) {
        click.stop()
        timer = null
        resolve()
        return
      }
      timer = window.setTimeout(poll, 40)
    }
    poll()
  })
  return {
    done,
    stop() {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      click.stop()
    },
  }
}

export function startBalanceTone(concertMidi: number, volume: number): Promise<DroneHandle> {
  const rounded = Math.round(concertMidi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return startDrone(pitchClass, octave, volume)
}

/**
 * The sound of getting it right.
 *
 * The game had no reward sound at all: a completed hold was marked only by a
 * haptic, which a player with the phone on a stand never feels. This is a
 * short rising major third into a fifth — a bugle-call shape, in tune with
 * itself, deliberately unlike the sustained drone so it never reads as another
 * reference pitch to match.
 *
 * Built on its own short-lived AudioContext rather than the drone plumbing:
 * it must be able to fire while the tracker is mid-teardown, and it must not
 * be something the caller has to remember to stop.
 */
export async function playBalanceReward(strong = false): Promise<void> {
  if (typeof window === 'undefined') return
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return

  try {
    const context = new AudioContextClass()
    if (context.state === 'suspended') await context.resume()

    const now = context.currentTime
    // C-E-G, plus the octave when the run finished rather than one note.
    const steps = strong ? [0, 4, 7, 12] : [0, 4, 7]
    const master = context.createGain()
    master.gain.value = 0.19
    master.connect(context.destination)

    steps.forEach((semitones, index) => {
      const at = now + index * 0.085
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.value = 523.25 * 2 ** (semitones / 12)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(1, at + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(at)
      oscillator.stop(at + 0.45)
    })

    const total = 0.085 * steps.length + 0.5
    window.setTimeout(() => void context.close().catch(() => {}), total * 1000 + 120)
  } catch {
    /* A missing or blocked audio context must never interrupt a run. */
  }
}

export type { ClickTrackHandle, DroneHandle }
