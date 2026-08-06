/**
 * Staff Jumper's click track and drone.
 *
 * The click reuses the app's metronome voices (`scheduleMetronomeClick`) but
 * runs its own transport: the shared metronome in MetronomeContext carries the
 * player's own tempo, meter and accents, and a game must not overwrite those.
 *
 * The drone prefers the native engine the tuner tab uses, and falls back to
 * oscillators on web where that plugin is a silent stub.
 */
import { getPlaybackAudioContext } from '../../utils/playbackAudioContext'
import { scheduleMetronomeClick } from '../../utils/metronomeClickSounds'
import { metronomeSpeakerGain } from '../../utils/playbackVolume'
import {
  droneGetState,
  droneRestoreState,
  droneSetOctave,
  droneSetVolume,
  droneSoloNote,
  droneStart,
  droneStop,
  isDroneNativeAvailable,
  type DroneState,
} from '../../utils/droneEngine'
import { METERS, secondsPerPulse, type StaffJumperMeter } from './staffJumperRhythm'

/** How far ahead of the audio clock clicks are queued, and how often we top up. */
const SCHEDULE_AHEAD_SEC = 0.18
const SCHEDULE_INTERVAL_MS = 40

export interface ClickTrackHandle {
  /**
   * Audio-context time of pulse 0 — the first note of the run, i.e. the moment
   * the count-in finishes. Timing scores are measured against this clock.
   */
  readonly startTimeSec: number
  readonly countInPulses: number
  /** Pulses elapsed since pulse 0. Negative during the count-in. */
  pulsesElapsed(): number
  /** Seconds until the count-in finishes; 0 once the run is under way. */
  countInRemainingSec(): number
  /**
   * False when the audio context is suspended — its clock is frozen, so beat
   * positions read from it are meaningless and must not be scored.
   */
  isRunning(): boolean
  setBpm(bpm: number): void
  setMuted(muted: boolean): void
  stop(): void
}

export interface ClickTrackOptions {
  bpm: number
  soundId: string
  /** Silent transport when false — the pulse clock still runs for scoring. */
  audible: boolean
  /** Bars of count-in before pulse 0. */
  countInBars: number
  /** Decides how many pulses fall in a bar, so the downbeat lands right. */
  meter: StaffJumperMeter
}

export async function startClickTrack(options: ClickTrackOptions): Promise<ClickTrackHandle> {
  const ctx = await getPlaybackAudioContext()

  /**
   * Same output stage the shared metronome uses.
   *
   * Connecting the click voices straight to `ctx.destination` left them running
   * at unity while the app's own metronome pushes through a speaker bus of ~72
   * (×1.25 on device) — which is why this click was almost inaudible next to it.
   */
  const master = ctx.createGain()
  master.gain.value = metronomeSpeakerGain(false)
  master.connect(ctx.destination)

  const meter = METERS[options.meter]
  let bpm = options.bpm
  let muted = !options.audible
  let spp = secondsPerPulse(bpm)

  const countInPulses = options.countInBars * meter.pulsesPerBar
  // A little headroom so the very first click is never scheduled in the past.
  const countInStart = ctx.currentTime + 0.12
  const startTimeSec = countInStart + countInPulses * spp

  /** Next pulse index to queue, counted from the top of the count-in. */
  let nextPulse = 0
  let timer: number | null = null

  const timeOfPulse = (pulseFromCountInStart: number) =>
    countInStart + pulseFromCountInStart * spp

  const pump = () => {
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SEC
    while (timeOfPulse(nextPulse) < horizon) {
      const when = timeOfPulse(nextPulse)
      const pulseInBar = nextPulse % meter.pulsesPerBar
      // Count-in clicks stay audible even when the click track is muted for the
      // run itself, so the player always gets the tempo before the first note.
      const inCountIn = nextPulse < countInPulses
      scheduleMetronomeClick(
        ctx,
        when,
        pulseInBar === 0 ? 'downbeat' : 'macro',
        master,
        muted && !inCountIn,
        options.soundId,
      )
      nextPulse += 1
    }
  }

  pump()
  timer = window.setInterval(pump, SCHEDULE_INTERVAL_MS)

  return {
    startTimeSec,
    countInPulses,
    pulsesElapsed: () => (ctx.currentTime - startTimeSec) / spp,
    countInRemainingSec: () => Math.max(0, startTimeSec - ctx.currentTime),
    isRunning: () => ctx.state === 'running',
    setBpm: (nextBpm: number) => {
      bpm = nextBpm
      spp = secondsPerPulse(bpm)
    },
    setMuted: (nextMuted: boolean) => {
      muted = nextMuted
    },
    stop: () => {
      if (timer != null) window.clearInterval(timer)
      timer = null
      try {
        master.disconnect()
      } catch {
        /* already torn down with the context */
      }
    },
  }
}

export interface DroneHandle {
  stop(): Promise<void>
}

/**
 * Level for the web-fallback drone.
 *
 * A sustained tone cannot ride the metronome's clipping speaker bus the way a
 * percussive click can, so it gets its own headroom-safe level instead.
 */
const WEB_DRONE_PEAK = 0.34

/** Web fallback: a soft two-oscillator drone in the shared playback context. */
async function startWebDrone(pitchClass: number, octave: number): Promise<DroneHandle> {
  const ctx = await getPlaybackAudioContext()
  const midi = (octave + 1) * 12 + pitchClass
  const hz = 440 * Math.pow(2, (midi - 69) / 12)

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.exponentialRampToValueAtTime(WEB_DRONE_PEAK, ctx.currentTime + 0.6)
  master.connect(ctx.destination)

  // Root plus a quiet octave above — enough body to tune against without
  // masking the player's own sound in the microphone.
  const voices = [
    { hz, gain: 1, type: 'sine' as OscillatorType },
    { hz: hz * 2, gain: 0.28, type: 'sine' as OscillatorType },
  ].map(({ hz: voiceHz, gain, type }) => {
    const osc = ctx.createOscillator()
    const voiceGain = ctx.createGain()
    osc.type = type
    osc.frequency.value = voiceHz
    voiceGain.gain.value = gain
    osc.connect(voiceGain)
    voiceGain.connect(master)
    osc.start()
    return { osc, voiceGain }
  })

  return {
    async stop() {
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
      window.setTimeout(() => {
        for (const { osc, voiceGain } of voices) {
          try {
            osc.stop()
            osc.disconnect()
            voiceGain.disconnect()
          } catch {
            /* graph may already be torn down */
          }
        }
        try {
          master.disconnect()
        } catch {
          /* already disconnected */
        }
      }, 320)
    },
  }
}

/**
 * Sound the tonic underneath the exercise.
 *
 * On iOS this drives the same engine as the tuner tab, so the player's own
 * drone settings are captured first and put back when the run ends.
 */
const DRONE_VOLUME = 0.85

/**
 * Octave 4 rather than 3.
 *
 * A phone speaker rolls off badly in the bass, so a drone an octave lower
 * measures the same but sounds far quieter than the tuner tab's.
 */
export async function startDrone(concertPitchClass: number, octave = 4): Promise<DroneHandle> {
  if (!isDroneNativeAvailable()) return startWebDrone(concertPitchClass, octave)

  let previous: DroneState | null = null
  try {
    previous = await droneGetState()
    await droneSetOctave(octave)
    await droneSetVolume(DRONE_VOLUME)
    await droneSoloNote(concertPitchClass, octave)
    await droneStart()
  } catch {
    return startWebDrone(concertPitchClass, octave)
  }

  return {
    async stop() {
      try {
        await droneStop()
        if (previous) {
          await droneSetVolume(previous.volume)
          if (previous.activeNotes.length > 0) {
            await droneRestoreState({
              activeNotes: previous.activeNotes,
              octave: previous.octave,
              volume: previous.volume,
              waveform: previous.waveform,
            })
          }
        }
      } catch {
        /* the tuner tab re-applies its own state when it next opens */
      }
    },
  }
}
