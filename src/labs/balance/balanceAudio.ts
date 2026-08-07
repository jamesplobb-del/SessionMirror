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

export type { ClickTrackHandle, DroneHandle }
