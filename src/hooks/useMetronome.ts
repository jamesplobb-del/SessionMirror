import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampBpm,
  getBeatsPerBar,
  loadMetronomePrefs,
  saveMetronomePrefs,
  type MetronomeMeter,
} from '../utils/metronomeConfig'

/** How far ahead to schedule audio events (seconds). */
const SCHEDULE_AHEAD_SEC = 0.12
/** How often the scheduler runs (ms). */
const LOOKAHEAD_MS = 25

const ACCENT_HZ = 1240
const TICK_HZ = 820
const CLICK_ATTACK_SEC = 0.0015
const CLICK_DECAY_SEC = 0.045
const CLICK_PEAK = 0.28

function scheduleClick(
  ctx: AudioContext,
  when: number,
  accent: boolean,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.value = accent ? ACCENT_HZ : TICK_HZ

  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(CLICK_PEAK, when + CLICK_ATTACK_SEC)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_DECAY_SEC)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(when)
  osc.stop(when + CLICK_DECAY_SEC + 0.01)
}

export interface UseMetronomeResult {
  bpm: number
  meter: MetronomeMeter
  playing: boolean
  beatIndex: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  togglePlay: () => void
  stop: () => void
}

export function useMetronome(): UseMetronomeResult {
  const initial = loadMetronomePrefs()
  const [bpm, setBpmState] = useState(initial.bpm)
  const [meter, setMeterState] = useState<MetronomeMeter>(initial.meter)
  const [playing, setPlaying] = useState(false)
  const [beatIndex, setBeatIndex] = useState(0)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const schedulerTimerRef = useRef<number | null>(null)
  const nextBeatTimeRef = useRef(0)
  const beatCounterRef = useRef(0)
  const bpmRef = useRef(bpm)
  const meterRef = useRef(meter)
  const playingRef = useRef(false)

  bpmRef.current = bpm
  meterRef.current = meter
  playingRef.current = playing

  const persistPrefs = useCallback((nextBpm: number, nextMeter: MetronomeMeter) => {
    saveMetronomePrefs({ bpm: nextBpm, meter: nextMeter })
  }, [])

  const setBpm = useCallback(
    (value: number) => {
      const next = clampBpm(value)
      setBpmState(next)
      persistPrefs(next, meterRef.current)
    },
    [persistPrefs],
  )

  const setMeter = useCallback(
    (nextMeter: MetronomeMeter) => {
      setMeterState(nextMeter)
      beatCounterRef.current = 0
      setBeatIndex(0)
      persistPrefs(bpmRef.current, nextMeter)
    },
    [persistPrefs],
  )

  const ensureContext = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') return null

    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ latencyHint: 'interactive' })
      audioCtxRef.current = ctx
    }

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        return null
      }
    }

    return ctx
  }, [])

  const stop = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    if (schedulerTimerRef.current !== null) {
      window.clearTimeout(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
    void audioCtxRef.current?.suspend()
  }, [])

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      stop()
      return
    }
    setPlaying(true)
  }, [stop])

  useEffect(() => {
    if (!playing) return

    let cancelled = false

    const runScheduler = async () => {
      const ctx = await ensureContext()
      if (!ctx || cancelled) return

      const secondsPerBeat = 60 / bpmRef.current
      nextBeatTimeRef.current = Math.max(
        ctx.currentTime + 0.03,
        nextBeatTimeRef.current > ctx.currentTime ? nextBeatTimeRef.current : ctx.currentTime + 0.03,
      )

      const tick = () => {
        if (cancelled || !playingRef.current) return

        const beatsPerBar = getBeatsPerBar(meterRef.current)
        const interval = 60 / bpmRef.current

        let uiBeat = -1

        while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
          const beatInBar = beatCounterRef.current % beatsPerBar
          const accent = beatInBar === 0
          scheduleClick(ctx, nextBeatTimeRef.current, accent)

          if (nextBeatTimeRef.current - ctx.currentTime <= LOOKAHEAD_MS / 1000) {
            uiBeat = beatInBar
          }

          nextBeatTimeRef.current += interval
          beatCounterRef.current += 1
        }

        if (uiBeat >= 0) {
          setBeatIndex(uiBeat)
        }

        schedulerTimerRef.current = window.setTimeout(tick, LOOKAHEAD_MS)
      }

      tick()
    }

    void runScheduler()

    return () => {
      cancelled = true
      if (schedulerTimerRef.current !== null) {
        window.clearTimeout(schedulerTimerRef.current)
        schedulerTimerRef.current = null
      }
    }
  }, [playing, bpm, meter, ensureContext])

  useEffect(() => {
    if (playing) {
      beatCounterRef.current = 0
      setBeatIndex(0)
      nextBeatTimeRef.current = 0
    }
  }, [bpm, meter, playing])

  useEffect(() => {
    return () => {
      if (schedulerTimerRef.current !== null) {
        window.clearTimeout(schedulerTimerRef.current)
      }
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx && ctx.state !== 'closed') {
        void ctx.close()
      }
    }
  }, [])

  return {
    bpm,
    meter,
    playing,
    beatIndex,
    setBpm,
    setMeter,
    togglePlay,
    stop,
  }
}
