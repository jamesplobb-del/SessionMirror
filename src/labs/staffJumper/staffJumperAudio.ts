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
import {
  droneGetState,
  droneRestoreState,
  droneSetOctave,
  droneSoloNote,
  droneStart,
  droneStop,
  isDroneNativeAvailable,
  type DroneState,
} from '../../utils/droneEngine'
import { BEATS_PER_BAR, secondsPerBeat } from './staffJumperRhythm'

/** How far ahead of the audio clock clicks are queued, and how often we top up. */
const SCHEDULE_AHEAD_SEC = 0.18
const SCHEDULE_INTERVAL_MS = 40

export interface ClickTrackHandle {
  /**
   * Audio-context time of beat 0 — the first note of the run, i.e. the moment
   * the count-in finishes. Timing scores are measured against this clock.
   */
  readonly startTimeSec: number
  readonly countInBeats: number
  /** Beats elapsed since beat 0. Negative during the count-in. */
  beatsElapsed(): number
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
  /** Silent transport when false — the beat clock still runs for scoring. */
  audible: boolean
  /** Bars of count-in before beat 0. */
  countInBars: number
}

export async function startClickTrack(options: ClickTrackOptions): Promise<ClickTrackHandle> {
  const ctx = await getPlaybackAudioContext()

  let bpm = options.bpm
  let muted = !options.audible
  let spb = secondsPerBeat(bpm)

  const countInBeats = options.countInBars * BEATS_PER_BAR
  // A beat of headroom so the very first click is never scheduled in the past.
  const countInStart = ctx.currentTime + 0.12
  const startTimeSec = countInStart + countInBeats * spb

  /** Next beat index to queue, counted from the top of the count-in. */
  let nextBeat = 0
  let timer: number | null = null

  const timeOfBeat = (beatFromCountInStart: number) => countInStart + beatFromCountInStart * spb

  const pump = () => {
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SEC
    while (timeOfBeat(nextBeat) < horizon) {
      const when = timeOfBeat(nextBeat)
      const beatInBar = nextBeat % BEATS_PER_BAR
      // Count-in clicks stay audible even when the click track is muted for the
      // run itself, so the player always gets the tempo before the first note.
      const inCountIn = nextBeat < countInBeats
      scheduleMetronomeClick(
        ctx,
        when,
        beatInBar === 0 ? 'downbeat' : 'macro',
        ctx.destination,
        muted && !inCountIn,
        options.soundId,
      )
      nextBeat += 1
    }
  }

  pump()
  timer = window.setInterval(pump, SCHEDULE_INTERVAL_MS)

  return {
    startTimeSec,
    countInBeats,
    beatsElapsed: () => (ctx.currentTime - startTimeSec) / spb,
    countInRemainingSec: () => Math.max(0, startTimeSec - ctx.currentTime),
    isRunning: () => ctx.state === 'running',
    setBpm: (nextBpm: number) => {
      bpm = nextBpm
      spb = secondsPerBeat(bpm)
    },
    setMuted: (nextMuted: boolean) => {
      muted = nextMuted
    },
    stop: () => {
      if (timer != null) window.clearInterval(timer)
      timer = null
    },
  }
}

export interface DroneHandle {
  stop(): Promise<void>
}

/** Web fallback: a soft two-oscillator drone in the shared playback context. */
async function startWebDrone(pitchClass: number, octave: number): Promise<DroneHandle> {
  const ctx = await getPlaybackAudioContext()
  const midi = (octave + 1) * 12 + pitchClass
  const hz = 440 * Math.pow(2, (midi - 69) / 12)

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  master.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.6)
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
export async function startDrone(concertPitchClass: number, octave = 3): Promise<DroneHandle> {
  if (!isDroneNativeAvailable()) return startWebDrone(concertPitchClass, octave)

  let previous: DroneState | null = null
  try {
    previous = await droneGetState()
    await droneSetOctave(octave)
    await droneSoloNote(concertPitchClass, octave)
    await droneStart()
  } catch {
    return startWebDrone(concertPitchClass, octave)
  }

  return {
    async stop() {
      try {
        await droneStop()
        if (previous && previous.activeNotes.length > 0) {
          await droneRestoreState({
            activeNotes: previous.activeNotes,
            octave: previous.octave,
            volume: previous.volume,
            waveform: previous.waveform,
          })
        }
      } catch {
        /* the tuner tab re-applies its own state when it next opens */
      }
    },
  }
}
