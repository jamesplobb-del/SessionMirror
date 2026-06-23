import { useCallback, useEffect, useRef, useState } from 'react'
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
  type MetronomeSoundType,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

/** How far ahead to schedule audio events (seconds). */
const SCHEDULE_AHEAD_SEC = 0.12
/** How often the scheduler runs (ms). */
const LOOKAHEAD_MS = 25

const CLICK_ATTACK_SEC = 0.0015

const TIER_PEAK: Record<MetronomeClickTier, number> = {
  downbeat: 1.0,
  macro: 0.6,
  subdivision: 0.2,
}

const TIER_SINE: Record<MetronomeClickTier, { hz: number; decaySec: number }> = {
  downbeat: { hz: 1000, decaySec: 0.045 },
  macro: { hz: 800, decaySec: 0.045 },
  subdivision: { hz: 600, decaySec: 0.028 },
}

const TIER_DIGITAL: Record<MetronomeClickTier, { hz: number; decaySec: number }> = {
  downbeat: { hz: 1400, decaySec: 0.035 },
  macro: { hz: 1050, decaySec: 0.032 },
  subdivision: { hz: 780, decaySec: 0.022 },
}

const TIER_WOOD: Record<MetronomeClickTier, { thumpHz: number; decaySec: number }> = {
  downbeat: { thumpHz: 160, decaySec: 0.05 },
  macro: { thumpHz: 210, decaySec: 0.042 },
  subdivision: { thumpHz: 280, decaySec: 0.03 },
}

function scheduleSineClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
): void {
  const { hz, decaySec } = TIER_SINE[tier]
  const peak = muted ? 0.0001 : TIER_PEAK[tier]
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = hz

  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + CLICK_ATTACK_SEC)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec)

  osc.connect(gain)
  gain.connect(outputNode)

  osc.start(when)
  osc.stop(when + decaySec + 0.01)
}

function scheduleDigitalClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
): void {
  const { hz, decaySec } = TIER_DIGITAL[tier]
  const peak = muted ? 0.0001 : TIER_PEAK[tier] * 1.15
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'square'
  osc.frequency.value = hz

  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), when + CLICK_ATTACK_SEC)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec * 0.85)

  osc.connect(gain)
  gain.connect(outputNode)

  osc.start(when)
  osc.stop(when + decaySec + 0.01)
}

function scheduleWoodClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
): void {
  const { thumpHz, decaySec } = TIER_WOOD[tier]
  const peak = muted ? 0.0001 : TIER_PEAK[tier]

  const bufferSize = Math.max(1, Math.ceil(ctx.sampleRate * decaySec))
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    const env = Math.exp(-i / (bufferSize * 0.14))
    data[i] = (Math.random() * 2 - 1) * env
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = tier === 'downbeat' ? 900 : tier === 'macro' ? 700 : 500

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(Math.max(peak * 0.85, 0.0002), when)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec)

  noise.connect(highpass)
  highpass.connect(noiseGain)
  noiseGain.connect(outputNode)
  noise.start(when)
  noise.stop(when + decaySec + 0.01)

  const thump = ctx.createOscillator()
  const thumpGain = ctx.createGain()
  thump.type = 'sine'
  thump.frequency.value = thumpHz
  thumpGain.gain.setValueAtTime(0.0001, when)
  thumpGain.gain.exponentialRampToValueAtTime(Math.max(peak * 0.55, 0.0002), when + CLICK_ATTACK_SEC)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec * 0.7)

  thump.connect(thumpGain)
  thumpGain.connect(outputNode)
  thump.start(when)
  thump.stop(when + decaySec + 0.01)
}

function scheduleTieredClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  soundType: MetronomeSoundType,
  outputNode: AudioNode,
  muted: boolean,
): void {
  switch (soundType) {
    case 'wood':
      scheduleWoodClick(ctx, when, tier, outputNode, muted)
      break
    case 'digital':
      scheduleDigitalClick(ctx, when, tier, outputNode, muted)
      break
    default:
      scheduleSineClick(ctx, when, tier, outputNode, muted)
  }
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
  soundType: MetronomeSoundType
  playing: boolean
  beatIndex: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  setSubdivision: (subdivision: MetronomeSubdivision) => void
  setSoundType: (soundType: MetronomeSoundType) => void
  togglePlay: () => void
  stop: () => void
}

export function useMetronome(options: UseMetronomeOptions = {}): UseMetronomeResult {
  const initial = loadMetronomePrefs()
  const [bpm, setBpmState] = useState(initial.bpm)
  const [meter, setMeterState] = useState<MetronomeMeter>(initial.meter)
  const [subdivision, setSubdivisionState] = useState<MetronomeSubdivision>(initial.subdivision)
  const [soundType, setSoundTypeState] = useState<MetronomeSoundType>(initial.soundType)
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
  const soundTypeRef = useRef(soundType)
  const playingRef = useRef(false)
  const isTakePlayingRef = useRef(isTakePlaying)
  const muteDuringPlaybackRef = useRef(muteDuringPlayback)

  bpmRef.current = bpm
  meterRef.current = meter
  subdivisionRef.current = subdivision
  soundTypeRef.current = soundType
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

  const persistPrefs = useCallback(
    (
      nextBpm: number,
      nextMeter: MetronomeMeter,
      nextSubdivision: MetronomeSubdivision,
      nextSoundType: MetronomeSoundType,
    ) => {
      saveMetronomePrefs({
        bpm: nextBpm,
        meter: nextMeter,
        subdivision: nextSubdivision,
        soundType: nextSoundType,
      })
    },
    [],
  )

  const setBpm = useCallback(
    (value: number) => {
      const next = clampBpm(value)
      setBpmState(next)
      persistPrefs(next, meterRef.current, subdivisionRef.current, soundTypeRef.current)
    },
    [persistPrefs],
  )

  const setMeter = useCallback(
    (nextMeter: MetronomeMeter) => {
      setMeterState(nextMeter)
      tickCounterRef.current = 0
      setBeatIndex(0)
      persistPrefs(bpmRef.current, nextMeter, subdivisionRef.current, soundTypeRef.current)
    },
    [persistPrefs],
  )

  const setSubdivision = useCallback(
    (nextSubdivision: MetronomeSubdivision) => {
      setSubdivisionState(nextSubdivision)
      tickCounterRef.current = 0
      setBeatIndex(0)
      persistPrefs(bpmRef.current, meterRef.current, nextSubdivision, soundTypeRef.current)
    },
    [persistPrefs],
  )

  const setSoundType = useCallback(
    (nextSoundType: MetronomeSoundType) => {
      setSoundTypeState(nextSoundType)
      persistPrefs(bpmRef.current, meterRef.current, subdivisionRef.current, nextSoundType)
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

    const ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      playingRef.current = false
      setPlaying(false)
      return
    }

    let cancelled = false

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
        scheduleTieredClick(
          activeCtx,
          nextBeatTimeRef.current,
          tier,
          soundTypeRef.current,
          outputNode,
          muted,
        )

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
    soundType,
    playing,
    beatIndex,
    setBpm,
    setMeter,
    setSubdivision,
    setSoundType,
    togglePlay,
    stop,
  }
}
