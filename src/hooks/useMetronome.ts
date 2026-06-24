import { useCallback, useEffect, useRef, useState } from 'react'
import { logPlaybackStartRouteDiagnostics } from '../utils/playbackRouteDiagnostics'
import {
  ensureFreshPlaybackOutputProfile,
  subscribePlaybackOutputProfile,
} from '../utils/audioOutputProfile'
import { metronomeSpeakerGain } from '../utils/playbackVolume'
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

const CLICK_ATTACK_SEC = 0.0015

const TIER_AUDIO: Record<
  MetronomeClickTier,
  { hz: number; peak: number; decaySec: number }
> = {
  downbeat: { hz: 1000, peak: 1.0, decaySec: 0.045 },
  macro: { hz: 800, peak: 0.6, decaySec: 0.045 },
  subdivision: { hz: 600, peak: 0.2, decaySec: 0.028 },
}

function scheduleTieredClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
): void {
  const { hz, peak, decaySec } = TIER_AUDIO[tier]
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = hz

  const effectivePeak = muted ? 0.0001 : Math.max(peak, 0.0002)

  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(effectivePeak, when + CLICK_ATTACK_SEC)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec)

  osc.connect(gain)
  gain.connect(outputNode)

  osc.start(when)
  osc.stop(when + decaySec + 0.01)
}

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
}

export interface UseMetronomeResult {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  playing: boolean
  beatIndex: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  setSubdivision: (subdivision: MetronomeSubdivision) => void
  togglePlay: () => void
  stop: () => void
}

export function useMetronome(options: UseMetronomeOptions = {}): UseMetronomeResult {
  const initial = loadMetronomePrefs()
  const [bpm, setBpmState] = useState(initial.bpm)
  const [meter, setMeterState] = useState<MetronomeMeter>(initial.meter)
  const [subdivision, setSubdivisionState] = useState<MetronomeSubdivision>(initial.subdivision)
  const [playing, setPlaying] = useState(false)
  const [beatIndex, setBeatIndex] = useState(0)

  const isTakePlaying = options.isTakePlaying ?? false
  const muteDuringPlayback = options.muteDuringPlayback ?? true

  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const schedulerTimerRef = useRef<number | null>(null)
  const nextBeatTimeRef = useRef(0)
  const tickCounterRef = useRef(0)
  const bpmRef = useRef(bpm)
  const meterRef = useRef(meter)
  const subdivisionRef = useRef(subdivision)
  const playingRef = useRef(false)
  const isTakePlayingRef = useRef(isTakePlaying)
  const muteDuringPlaybackRef = useRef(muteDuringPlayback)

  bpmRef.current = bpm
  meterRef.current = meter
  subdivisionRef.current = subdivision
  playingRef.current = playing
  isTakePlayingRef.current = isTakePlaying
  muteDuringPlaybackRef.current = muteDuringPlayback

  const shouldMuteOutput = useCallback(
    () => muteDuringPlaybackRef.current && isTakePlayingRef.current,
    [],
  )

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

  useEffect(() => {
    return subscribePlaybackOutputProfile(() => {
      const ctx = audioCtxRef.current
      const master = masterGainRef.current
      if (!ctx || !master || master.context !== ctx) return
      master.gain.setValueAtTime(metronomeSpeakerGain(shouldMuteOutput()), ctx.currentTime)
    })
  }, [shouldMuteOutput])

  const persistPrefs = useCallback(
    (nextBpm: number, nextMeter: MetronomeMeter, nextSubdivision: MetronomeSubdivision) => {
      saveMetronomePrefs({ bpm: nextBpm, meter: nextMeter, subdivision: nextSubdivision })
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

  const stop = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    if (schedulerTimerRef.current !== null) {
      window.clearTimeout(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
    void audioCtxRef.current?.suspend()
  }, [])

  const start = useCallback(() => {
    if (typeof window === 'undefined') return

    if (!audioCtxRef.current) {
      const WebkitAudioContext = (
        window as Window & { webkitAudioContext?: typeof AudioContext }
      ).webkitAudioContext
      const Ctor = window.AudioContext ?? WebkitAudioContext
      if (!Ctor) return
      audioCtxRef.current = new Ctor()
    }

    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') return

    const resumeAndPlay = async () => {
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch {
          return
        }
      }

      tickCounterRef.current = 0
      setBeatIndex(0)
      nextBeatTimeRef.current = 0
      playingRef.current = true
      setPlaying(true)
    }

    void resumeAndPlay()
  }, [])

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      stop()
      return
    }
    start()
  }, [start, stop])

  useEffect(() => {
    if (!playing) return

    let cancelled = false

    void (async () => {
      await ensureFreshPlaybackOutputProfile()
      if (cancelled) return

      logPlaybackStartRouteDiagnostics('metronomeStart', {
        muted: shouldMuteOutput(),
      })

      const ctx = audioCtxRef.current
      if (!ctx || ctx.state === 'closed') {
        playingRef.current = false
        setPlaying(false)
        return
      }

      const master = ensureMasterGain(ctx)
      master.gain.setValueAtTime(metronomeSpeakerGain(shouldMuteOutput()), ctx.currentTime)

      nextBeatTimeRef.current = Math.max(
        ctx.currentTime + 0.03,
        nextBeatTimeRef.current > ctx.currentTime ? nextBeatTimeRef.current : ctx.currentTime + 0.03,
      )

      const tick = () => {
        if (cancelled || !playingRef.current) return

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

        let uiBeat = -1

        while (nextBeatTimeRef.current < activeCtx.currentTime + SCHEDULE_AHEAD_SEC) {
          const tickInBar = tickCounterRef.current % barTicks
          const tier = resolveClickTier(meter, tickInBar, subdivision)
          scheduleTieredClick(activeCtx, nextBeatTimeRef.current, tier, outputNode, muted)

          if (nextBeatTimeRef.current - activeCtx.currentTime <= LOOKAHEAD_MS / 1000) {
            uiBeat = resolveUiBeatIndex(meter, tickInBar, subdivision)
          }

          nextBeatTimeRef.current += secondsPerTick
          tickCounterRef.current += 1
        }

        if (uiBeat >= 0) {
          setBeatIndex(uiBeat)
        }

        schedulerTimerRef.current = window.setTimeout(tick, LOOKAHEAD_MS)
      }

      tick()
    })()

    return () => {
      cancelled = true
      if (schedulerTimerRef.current !== null) {
        window.clearTimeout(schedulerTimerRef.current)
        schedulerTimerRef.current = null
      }
    }
  }, [playing, bpm, meter, subdivision, ensureMasterGain, shouldMuteOutput, stop])

  useEffect(() => {
    if (playing) {
      tickCounterRef.current = 0
      setBeatIndex(0)
      nextBeatTimeRef.current = 0
    }
  }, [bpm, meter, subdivision, playing])

  useEffect(() => {
    return () => {
      playingRef.current = false
      if (schedulerTimerRef.current !== null) {
        window.clearTimeout(schedulerTimerRef.current)
        schedulerTimerRef.current = null
      }
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      masterGainRef.current = null
      if (ctx && ctx.state !== 'closed') {
        void ctx.close()
      }
    }
  }, [])

  return {
    bpm,
    meter,
    subdivision,
    playing,
    beatIndex,
    setBpm,
    setMeter,
    setSubdivision,
    togglePlay,
    stop,
  }
}
