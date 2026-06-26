import { useCallback, useEffect, useRef, useState } from 'react'
import { metronomeSpeakerGain } from '../utils/playbackVolume'
import { primePlaybackAudioContextSync } from '../utils/playbackAudioContext'
import { scheduleMetronomeClick } from '../utils/metronomeClickSounds'
import {
  clampBpm,
  getBeatsPerBar,
  getCompoundClickTier,
  getEighthNotesPerBar,
  getSimpleClickTier,
  isCompoundMeter,
  loadMetronomePrefs,
  saveMetronomePrefs,
  subdivisionsPerBeat,
  type MetronomeClickTier,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

/** How far ahead to schedule audio events (seconds). */
const SCHEDULE_AHEAD_SEC = 0.12
/** How often the scheduler runs (ms). */
const LOOKAHEAD_MS = 25
const START_LEAD_SEC = 0.05

function secondsPerSchedulerTick(
  meter: MetronomeMeter,
  bpm: number,
  subdivision: MetronomeSubdivision,
): number {
  const macroBeatSec = 60 / bpm
  if (isCompoundMeter(meter) && subdivision === 'off') {
    return macroBeatSec / 3
  }
  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  return macroBeatSec / ticksPerBeat
}

function resolveClickTier(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
): MetronomeClickTier {
  if (isCompoundMeter(meter) && subdivision === 'off') {
    return getCompoundClickTier(tickIndexInBar)
  }

  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  const beatIndex = Math.floor(tickIndexInBar / ticksPerBeat)
  const tickInBeat = tickIndexInBar % ticksPerBeat

  if (tickInBeat === 0) {
    return getSimpleClickTier(beatIndex)
  }
  return 'subdivision'
}

function applyAccentFirstBeat(
  tier: MetronomeClickTier,
  meter: MetronomeMeter,
  subdivision: MetronomeSubdivision,
  accentFirstBeat: boolean,
): MetronomeClickTier {
  if (accentFirstBeat || tier !== 'downbeat') return tier
  if (isCompoundMeter(meter) && subdivision === 'off') return 'macro'
  return 'subdivision'
}

function resolveUiBeatIndex(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
): number {
  if (isCompoundMeter(meter) && subdivision === 'off') {
    return Math.floor(tickIndexInBar / 3) % getBeatsPerBar(meter)
  }
  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  return Math.floor(tickIndexInBar / ticksPerBeat) % getBeatsPerBar(meter)
}

function ticksPerBar(meter: MetronomeMeter, subdivision: MetronomeSubdivision): number {
  if (isCompoundMeter(meter) && subdivision === 'off') {
    return getEighthNotesPerBar(meter)
  }
  return getBeatsPerBar(meter) * subdivisionsPerBeat(subdivision)
}

export interface UseMetronomeOptions {
  /** True when a take is playing on the main HUD (PiP or auto-playback). */
  isTakePlaying?: boolean
  /** When true with isTakePlaying, metronome output is gated to silence. */
  muteDuringPlayback?: boolean
  /** Dev-only console prefix, e.g. "MetronomeTab". */
  debugLabel?: string
}

export interface UseMetronomeResult {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  accentFirstBeat: boolean
  soundId: string
  playing: boolean
  beatIndex: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  setSubdivision: (subdivision: MetronomeSubdivision) => void
  setAccentFirstBeat: (accentFirstBeat: boolean) => void
  setSoundId: (soundId: string) => void
  togglePlay: () => void
  stop: () => void
}

export function useMetronome(options: UseMetronomeOptions = {}): UseMetronomeResult {
  const initial = loadMetronomePrefs()
  const [bpm, setBpmState] = useState(initial.bpm)
  const [meter, setMeterState] = useState<MetronomeMeter>(initial.meter)
  const [subdivision, setSubdivisionState] = useState<MetronomeSubdivision>(initial.subdivision)
  const [accentFirstBeat, setAccentFirstBeatState] = useState(initial.accentFirstBeat)
  const [soundId, setSoundIdState] = useState(initial.soundId)
  const [playing, setPlaying] = useState(false)
  const [beatIndex, setBeatIndex] = useState(0)

  const isTakePlaying = options.isTakePlaying ?? false
  const muteDuringPlayback = options.muteDuringPlayback ?? true
  const debugLabel = options.debugLabel

  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const schedulerTimerRef = useRef<number | null>(null)
  const schedulerSessionRef = useRef(0)
  const nextBeatTimeRef = useRef(0)
  const tickCounterRef = useRef(0)
  const bpmRef = useRef(bpm)
  const meterRef = useRef(meter)
  const subdivisionRef = useRef(subdivision)
  const accentFirstBeatRef = useRef(accentFirstBeat)
  const soundIdRef = useRef(soundId)
  const playingRef = useRef(false)
  const isTakePlayingRef = useRef(isTakePlaying)
  const muteDuringPlaybackRef = useRef(muteDuringPlayback)

  bpmRef.current = bpm
  meterRef.current = meter
  subdivisionRef.current = subdivision
  accentFirstBeatRef.current = accentFirstBeat
  soundIdRef.current = soundId
  playingRef.current = playing
  isTakePlayingRef.current = isTakePlaying
  muteDuringPlaybackRef.current = muteDuringPlayback

  const debugLog = useCallback(
    (message: string) => {
      if (!debugLabel || !import.meta.env.DEV) return
      console.log(`[${debugLabel}] ${message}`)
    },
    [debugLabel],
  )

  const shouldMuteOutput = useCallback(
    () => muteDuringPlaybackRef.current && isTakePlayingRef.current,
    [],
  )

  const clearSchedulerTimer = useCallback(() => {
    if (schedulerTimerRef.current !== null) {
      window.clearTimeout(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
  }, [])

  const ensureMasterGain = useCallback((ctx: AudioContext): GainNode => {
    let master = masterGainRef.current
    if (!master || master.context !== ctx) {
      master = ctx.createGain()
      master.gain.value = metronomeSpeakerGain(shouldMuteOutput())
      master.connect(ctx.destination)
      masterGainRef.current = master
    }
    return master
  }, [shouldMuteOutput])

  useEffect(() => {
    const ctx = audioCtxRef.current
    const master = masterGainRef.current
    if (!ctx || !master || master.context !== ctx) return

    master.gain.setValueAtTime(metronomeSpeakerGain(shouldMuteOutput()), ctx.currentTime)
  }, [isTakePlaying, muteDuringPlayback, shouldMuteOutput])

  const persistPrefs = useCallback(
    (
      nextBpm: number,
      nextMeter: MetronomeMeter,
      nextSubdivision: MetronomeSubdivision,
      nextAccentFirstBeat: boolean = accentFirstBeatRef.current,
      nextSoundId: string = soundIdRef.current,
    ) => {
      saveMetronomePrefs({
        bpm: nextBpm,
        meter: nextMeter,
        subdivision: nextSubdivision,
        accentFirstBeat: nextAccentFirstBeat,
        soundId: nextSoundId,
      })
    },
    [],
  )

  const setBpm = useCallback(
    (value: number) => {
      const next = clampBpm(value)
      setBpmState(next)
      persistPrefs(next, meterRef.current, subdivisionRef.current)
    },
    [persistPrefs],
  )

  const setMeter = useCallback(
    (nextMeter: MetronomeMeter) => {
      setMeterState(nextMeter)
      tickCounterRef.current = 0
      setBeatIndex(0)
      persistPrefs(bpmRef.current, nextMeter, subdivisionRef.current)
    },
    [persistPrefs],
  )

  const setSubdivision = useCallback(
    (nextSubdivision: MetronomeSubdivision) => {
      setSubdivisionState(nextSubdivision)
      tickCounterRef.current = 0
      setBeatIndex(0)
      persistPrefs(bpmRef.current, meterRef.current, nextSubdivision)
    },
    [persistPrefs],
  )

  const setAccentFirstBeat = useCallback(
    (nextAccentFirstBeat: boolean) => {
      setAccentFirstBeatState(nextAccentFirstBeat)
      persistPrefs(bpmRef.current, meterRef.current, subdivisionRef.current, nextAccentFirstBeat)
    },
    [persistPrefs],
  )

  const setSoundId = useCallback(
    (nextSoundId: string) => {
      soundIdRef.current = nextSoundId
      setSoundIdState(nextSoundId)
      persistPrefs(
        bpmRef.current,
        meterRef.current,
        subdivisionRef.current,
        accentFirstBeatRef.current,
        nextSoundId,
      )
    },
    [persistPrefs],
  )

  const stop = useCallback(() => {
    if (playingRef.current) {
      debugLog('stop')
    }
    playingRef.current = false
    setPlaying(false)
    clearSchedulerTimer()
  }, [clearSchedulerTimer, debugLog])

  const start = useCallback(() => {
    if (typeof window === 'undefined') return

    if (schedulerTimerRef.current !== null) {
      debugLog('duplicate timer prevented')
      clearSchedulerTimer()
    }

    const ctx = primePlaybackAudioContextSync()
    audioCtxRef.current = ctx
    if (ctx.state === 'closed') return

    const resumeAndPlay = async () => {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          return
        }
      }

      if (schedulerTimerRef.current !== null) {
        debugLog('duplicate timer prevented')
        clearSchedulerTimer()
      }

      tickCounterRef.current = 0
      setBeatIndex(0)
      nextBeatTimeRef.current = ctx.currentTime + START_LEAD_SEC
      schedulerSessionRef.current += 1
      playingRef.current = true
      setPlaying(true)
      debugLog('start')
    }

    void resumeAndPlay()
  }, [clearSchedulerTimer, debugLog])

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      stop()
      return
    }
    start()
  }, [start, stop])

  useEffect(() => {
    if (!playing) {
      clearSchedulerTimer()
      return
    }

    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      playingRef.current = false
      setPlaying(false)
      return
    }

    const sessionId = schedulerSessionRef.current
    let cancelled = false

    if (nextBeatTimeRef.current <= 0 || nextBeatTimeRef.current < ctx.currentTime) {
      nextBeatTimeRef.current = ctx.currentTime + START_LEAD_SEC
    }

    const tick = () => {
      if (cancelled || !playingRef.current || sessionId !== schedulerSessionRef.current) return

      const activeCtx = audioCtxRef.current
      if (!activeCtx || activeCtx.state === 'closed') {
        stop()
        return
      }

      const meter = meterRef.current
      const subdivision = subdivisionRef.current
      const barTicks = ticksPerBar(meter, subdivision)
      const secondsPerTick = secondsPerSchedulerTick(meter, bpmRef.current, subdivision)
      const outputNode = ensureMasterGain(activeCtx)
      const muted = shouldMuteOutput()
      const sound = soundIdRef.current

      let uiBeat = -1

      while (nextBeatTimeRef.current < activeCtx.currentTime + SCHEDULE_AHEAD_SEC) {
        const tickInBar = tickCounterRef.current % barTicks
        const tier = applyAccentFirstBeat(
          resolveClickTier(meter, tickInBar, subdivision),
          meter,
          subdivision,
          accentFirstBeatRef.current,
        )
        scheduleMetronomeClick(activeCtx, nextBeatTimeRef.current, tier, outputNode, muted, sound)

        if (nextBeatTimeRef.current - activeCtx.currentTime <= LOOKAHEAD_MS / 1000) {
          uiBeat = resolveUiBeatIndex(meter, tickInBar, subdivision)
        }

        nextBeatTimeRef.current += secondsPerTick
        tickCounterRef.current += 1
      }

      if (uiBeat >= 0) {
        setBeatIndex(uiBeat)
        debugLog(`tick beat=${uiBeat + 1}`)
      }

      schedulerTimerRef.current = window.setTimeout(tick, LOOKAHEAD_MS)
    }

    clearSchedulerTimer()
    tick()

    return () => {
      cancelled = true
      clearSchedulerTimer()
    }
  }, [playing, clearSchedulerTimer, ensureMasterGain, shouldMuteOutput, stop, debugLog])

  useEffect(() => {
    return () => {
      playingRef.current = false
      clearSchedulerTimer()
      try {
        masterGainRef.current?.disconnect()
      } catch {
        /* already disconnected */
      }
      audioCtxRef.current = null
      masterGainRef.current = null
    }
  }, [clearSchedulerTimer])

  return {
    bpm,
    meter,
    subdivision,
    accentFirstBeat,
    soundId,
    playing,
    beatIndex,
    setBpm,
    setMeter,
    setSubdivision,
    setAccentFirstBeat,
    setSoundId,
    togglePlay,
    stop,
  }
}
