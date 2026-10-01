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
import { getGameAudioContext } from '../gameAudioContext'
import { scheduleMetronomeClick } from '../../utils/metronomeClickSounds'
import { metronomeSpeakerGain } from '../../utils/playbackVolume'
import { isConfirmedHeadphoneOutputActive, subscribeConfirmedHeadphoneOutput } from '../../utils/headphoneOutput'
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

export async function startClickTrack(options: ClickTrackOptions, isCurrent = () => true): Promise<ClickTrackHandle> {
  if (!isCurrent()) throw new Error('Staff Jumper audio start cancelled.')
  if (options.audible && !isConfirmedHeadphoneOutputActive()) throw new Error('Connect headphones to use the Staff Jumper metronome.')
  const ctx = await getGameAudioContext()
  if (!isCurrent()) throw new Error('Staff Jumper audio start cancelled.')
  if (options.audible && !isConfirmedHeadphoneOutputActive()) throw new Error('Headphones disconnected.')

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

  /** Seconds between clicks — a quarter in 4/4, an eighth in 6/8. */
  const secondsPerTick = () => spp / meter.ticksPerPulse

  const countInTicks = options.countInBars * meter.ticksPerBar
  // A little headroom so the very first click is never scheduled in the past.
  const countInStart = ctx.currentTime + 0.12
  const startTimeSec = countInStart + countInTicks * secondsPerTick()

  /** Next tick index to queue, counted from the top of the count-in. */
  let nextTick = 0
  let timer: number | null = null
  let removeRouteListener: (() => void) | undefined
  const stop = () => {
    if (timer != null) window.clearInterval(timer)
    timer = null
    removeRouteListener?.()
    removeRouteListener = undefined
    try { master.disconnect() } catch { /* already disconnected */ }
  }

  const timeOfTick = (tickFromCountInStart: number) =>
    countInStart + tickFromCountInStart * secondsPerTick()

  /**
   * Same tiering the shared metronome uses: ticks landing on a pulse are
   * accented, everything between them is a quieter subdivision click. In 4/4
   * every tick is a pulse; in 6/8 two ticks in three are subdivisions, which is
   * what gives compound time its lilt instead of two bare clicks a bar.
   */
  const tierForTick = (tick: number) => {
    const tickInBar = ((tick % meter.ticksPerBar) + meter.ticksPerBar) % meter.ticksPerBar
    if (tickInBar % meter.ticksPerPulse !== 0) return 'subdivision' as const
    return tickInBar === 0 ? ('downbeat' as const) : ('macro' as const)
  }

  const pump = () => {
    if (options.audible && !isConfirmedHeadphoneOutputActive()) { stop(); return }
    const horizon = ctx.currentTime + SCHEDULE_AHEAD_SEC
    while (timeOfTick(nextTick) < horizon) {
      // Turning sound off also silences the count-in. The timing clock still runs.
      scheduleMetronomeClick(
        ctx,
        timeOfTick(nextTick),
        tierForTick(nextTick),
        master,
        muted || !isConfirmedHeadphoneOutputActive(),
        options.soundId,
      )
      nextTick += 1
    }
  }

  pump()
  timer = window.setInterval(pump, SCHEDULE_INTERVAL_MS)
  removeRouteListener = subscribeConfirmedHeadphoneOutput((connected) => {
    if (!connected && options.audible) stop()
  })

  return {
    startTimeSec,
    countInPulses: countInTicks / meter.ticksPerPulse,
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
    stop,
  }
}

export interface DroneHandle {
  setPitch(pitchClass: number, octave: number): Promise<void>
  stop(restorePrevious?: boolean): Promise<void>
}

/**
 * Level for the web-fallback drone.
 *
 * Sustained reference tones have their own headroom-safe level.
 */
const WEB_DRONE_PEAK = 0.34

/** Web fallback: the same fundamental-led warm recipe as the native drone. */
async function startWebDrone(
  pitchClass: number,
  octave: number,
  volume = DRONE_VOLUME,
  isCurrent: () => boolean = () => true,
): Promise<DroneHandle> {
  if (!isCurrent()) throw new Error('Staff Jumper drone startup cancelled.')
  const ctx = await getGameAudioContext()
  if (!isCurrent()) throw new Error('Staff Jumper drone startup cancelled.')
  if (!isConfirmedHeadphoneOutputActive()) throw new Error('Connect headphones to use the Staff Jumper drone.')
  const frequencyForPitch = (nextPitchClass: number, nextOctave: number) => {
    const midi = (nextOctave + 1) * 12 + nextPitchClass
    return 440 * Math.pow(2, (midi - 69) / 12)
  }
  const hz = frequencyForPitch(pitchClass, octave)

  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, ctx.currentTime)
  const peak = Math.max(0.0001, WEB_DRONE_PEAK * Math.max(0, Math.min(1, volume)) / DRONE_VOLUME)
  master.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.6)
  master.connect(ctx.destination)

  // Harmonics stay quiet enough to leave the root easy to hear and match.
  const voices = [
    { ratio: 1, gain: 1 / 1.24, type: 'sine' as OscillatorType },
    { ratio: 2, gain: 0.16 / 1.24, type: 'sine' as OscillatorType },
    { ratio: 3, gain: 0.06 / 1.24, type: 'sine' as OscillatorType },
    { ratio: 4, gain: 0.02 / 1.24, type: 'sine' as OscillatorType },
  ].map(({ ratio, gain, type }) => {
    const osc = ctx.createOscillator()
    const voiceGain = ctx.createGain()
    osc.type = type
    osc.frequency.value = hz * ratio
    voiceGain.gain.value = gain
    osc.connect(voiceGain)
    voiceGain.connect(master)
    osc.start()
    return { osc, voiceGain, ratio }
  })

  return {
    async setPitch(nextPitchClass: number, nextOctave: number) {
      const nextHz = frequencyForPitch(nextPitchClass, nextOctave)
      const now = ctx.currentTime
      for (const { osc, ratio } of voices) {
        osc.frequency.cancelScheduledValues(now)
        osc.frequency.setValueAtTime(osc.frequency.value, now)
        osc.frequency.linearRampToValueAtTime(nextHz * ratio, now + 0.045)
      }
    },
    async stop() {
      // Disconnect immediately: a fade would leak the drone to the speaker
      // after headphones are unplugged.
      for (const { osc, voiceGain } of voices) {
        try {
          osc.stop()
          osc.disconnect()
          voiceGain.disconnect()
        } catch {
          /* already stopped */
        }
      }
      try { master.disconnect() } catch { /* already disconnected */ }
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

// The native tuner drone is a singleton. Keep its mutations and restoration
// ordered, including handles returned after their run was cancelled.
let nativeDroneQueue: Promise<void> = Promise.resolve()
let nativeDroneOwner: symbol | null = null
let nativeDronePrevious: DroneState | null = null

function enqueueNativeDrone<T>(perform: () => Promise<T>): Promise<T> {
  const operation = nativeDroneQueue.then(perform, perform)
  nativeDroneQueue = operation.then(() => undefined, () => undefined)
  return operation
}

/**
 * Octave 4 rather than 3.
 *
 * A phone speaker rolls off badly in the bass, so a drone an octave lower
 * measures the same but sounds far quieter than the tuner tab's.
 */
export async function startDrone(
  concertPitchClass: number,
  octave = 4,
  volume = DRONE_VOLUME,
  isCurrent: () => boolean = () => true,
): Promise<DroneHandle> {
  if (!isConfirmedHeadphoneOutputActive()) throw new Error('Connect headphones to use the Staff Jumper drone.')

  const owner = Symbol('staff-jumper-drone')
  let previous: DroneState | null = null
  let webHandle: DroneHandle | null = null
  let stopped = false
  let routeLost = false
  let removeRouteListener: (() => void) | undefined
  const guardCurrent = () => {
    if (stopped || !isCurrent()) throw new Error('Staff Jumper drone startup cancelled.')
    if (routeLost || !isConfirmedHeadphoneOutputActive()) throw new Error('Headphones disconnected.')
  }

  // Call only inside nativeDroneQueue. Ownership stays held across awaits.
  const stopOwnedNative = async (restorePrevious: boolean, releaseOwner = true) => {
    if (nativeDroneOwner !== owner) return
    try {
      await droneStop()
      if (previous) {
        const restoreNotes = restorePrevious && !routeLost && isConfirmedHeadphoneOutputActive()
        await droneRestoreState({
          // Native stop retains its last solo note/settings. Roll those back
          // even when sound must stay off, so a later run cannot inherit a
          // cancelled game's tonic as its tuner snapshot.
          activeNotes: restoreNotes ? previous.activeNotes : [],
          octave: previous.octave,
          volume: previous.volume,
          waveform: previous.waveform,
        })
        // A disconnect during the bridge await must also stop a late restore.
        if (restoreNotes && (routeLost || !isConfirmedHeadphoneOutputActive())) {
          await droneRestoreState({ ...previous, activeNotes: [] })
        }
        if (!restoreNotes || routeLost || !isConfirmedHeadphoneOutputActive()) await droneStop()
      }
    } finally {
      if (releaseOwner && nativeDroneOwner === owner) {
        nativeDroneOwner = null
        nativeDronePrevious = null
      }
    }
  }

  const stop = async (restorePrevious = true) => {
    stopped = true
    // Web audio has its own graph, so unplugging disconnects it immediately.
    if (webHandle) await webHandle.stop(false)
    try {
      await enqueueNativeDrone(() => stopOwnedNative(restorePrevious))
    } catch {
      /* the tuner tab re-applies its own state when it next opens */
    } finally {
      removeRouteListener?.()
      removeRouteListener = undefined
    }
  }
  removeRouteListener = subscribeConfirmedHeadphoneOutput((connected) => {
    if (connected) return
    routeLost = true
    void stop(false)
  })

  try {
    guardCurrent()
    const nativeStarted = isDroneNativeAvailable() && await enqueueNativeDrone(async () => {
      try {
        guardCurrent()
        // Replacing a game handle inherits the original tuner snapshot, rather
        // than treating the old game's tonic as the state to restore later.
        previous = nativeDroneOwner ? nativeDronePrevious : await droneGetState()
        guardCurrent()
        nativeDroneOwner = owner
        nativeDronePrevious = previous
        await droneSetOctave(octave)
        guardCurrent()
        await droneSetVolume(Math.max(0, Math.min(1, volume)))
        guardCurrent()
        await droneSoloNote(concertPitchClass, octave)
        guardCurrent()
        await droneStart()
        guardCurrent()
        return true
      } catch (error) {
        // Do not fall back while a partially started native drone can sound.
        // Retain the snapshot for restoration when the fallback later stops.
        await stopOwnedNative(false, false)
        try {
          guardCurrent()
        } catch {
          // A replacement cannot enter the native queue until this rollback
          // finishes. Restore the tuner snapshot while private output remains
          // available; route loss instead rolls back with no active notes.
          await stopOwnedNative(true)
          throw error
        }
        return false
      }
    })
    guardCurrent()
    if (!nativeStarted) {
      webHandle = await startWebDrone(concertPitchClass, octave, volume, () => {
        return !stopped && !routeLost && isCurrent()
      })
      guardCurrent()
    }

    return {
      async setPitch(nextPitchClass: number, nextOctave: number) {
        guardCurrent()
        const normalizedPitchClass = ((Math.round(nextPitchClass) % 12) + 12) % 12
        const normalizedOctave = Math.max(0, Math.min(8, Math.round(nextOctave)))
        if (webHandle) {
          await webHandle.setPitch(normalizedPitchClass, normalizedOctave)
          guardCurrent()
        } else {
          await enqueueNativeDrone(async () => {
            guardCurrent()
            if (nativeDroneOwner !== owner) return
            await droneSoloNote(normalizedPitchClass, normalizedOctave)
            if (stopped || !isCurrent() || routeLost || !isConfirmedHeadphoneOutputActive()) {
              // Keep the snapshot owned until the queued explicit stop decides
              // whether to restore it, or a replacement inherits it.
              await stopOwnedNative(false, false)
            }
          })
          guardCurrent()
        }
      },
      stop,
    }
  } catch (error) {
    if (webHandle) await webHandle.stop(false)
    try {
      await enqueueNativeDrone(() => stopOwnedNative(false))
    } finally {
      removeRouteListener?.()
      removeRouteListener = undefined
    }
    throw error
  }
}
