import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
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

const SCHEDULE_AHEAD_SEC = 0.12
const LOOKAHEAD_MS = 25
const START_LEAD_SEC = 0.05

export interface SharedMetronomeSnapshot {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  accentFirstBeat: boolean
  soundId: string
  playing: boolean
  beatIndex: number
  beatPulseId: number
}

type Listener = () => void

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

function createInitialSnapshot(): SharedMetronomeSnapshot {
  const prefs = loadMetronomePrefs()
  return {
    bpm: prefs.bpm,
    meter: prefs.meter,
    subdivision: prefs.subdivision,
    accentFirstBeat: prefs.accentFirstBeat,
    soundId: prefs.soundId,
    playing: false,
    beatIndex: 0,
    beatPulseId: 0,
  }
}

class SharedMetronomeEngine {
  private listeners = new Set<Listener>()
  private snapshot: SharedMetronomeSnapshot = createInitialSnapshot()

  private audioCtx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private schedulerTimer: number | null = null
  private schedulerSession = 0
  private nextBeatTime = 0
  private tickCounter = 0

  private isTakePlaying = false
  private muteDuringPlayback = true
  private resumeOnForeground = false
  private lifecycleAttached = false
  private isBackgrounded = false

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SharedMetronomeSnapshot => this.snapshot

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private patchState(partial: Partial<SharedMetronomeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial }
    this.emit()
  }

  private debugLog(message: string): void {
    if (!import.meta.env.DEV) return
    console.log(`[SharedMetronome] ${message}`)
  }

  private shouldMuteOutput(): boolean {
    return this.muteDuringPlayback && this.isTakePlaying
  }

  setPlaybackMutePolicy(isTakePlaying: boolean, muteDuringPlayback: boolean): void {
    this.isTakePlaying = isTakePlaying
    this.muteDuringPlayback = muteDuringPlayback

    const ctx = this.audioCtx
    const master = this.masterGain
    if (!ctx || !master || master.context !== ctx) return

    master.gain.setValueAtTime(metronomeSpeakerGain(this.shouldMuteOutput()), ctx.currentTime)
  }

  attachLifecycle(): void {
    if (this.lifecycleAttached || typeof window === 'undefined') return
    this.lifecycleAttached = true

    const onForeground = () => {
      if (!this.isBackgrounded && !this.resumeOnForeground) {
        return
      }
      this.isBackgrounded = false

      this.debugLog('foreground recovery')
      this.clearSchedulerTimer()

      if (this.masterGain) {
        try {
          this.masterGain.disconnect()
        } catch {
          /* already disconnected */
        }
      }
      this.masterGain = null
      this.audioCtx = null

      if (this.resumeOnForeground) {
        this.resumeOnForeground = false
        void this.start({ recovered: true })
        return
      }

      if (this.snapshot.playing) {
        this.patchState({ playing: false, beatIndex: 0 })
      }
    }

    const onBackground = () => {
      if (this.isBackgrounded) return
      this.isBackgrounded = true

      if (this.snapshot.playing) {
        this.resumeOnForeground = true
      }
      this.hardStop({ background: true })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onBackground()
      } else {
        onForeground()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          onBackground()
        } else {
          onForeground()
        }
      })
    }
  }

  private persistPrefs(
    nextBpm: number,
    nextMeter: MetronomeMeter,
    nextSubdivision: MetronomeSubdivision,
    nextAccentFirstBeat: boolean = this.snapshot.accentFirstBeat,
    nextSoundId: string = this.snapshot.soundId,
  ): void {
    saveMetronomePrefs({
      bpm: nextBpm,
      meter: nextMeter,
      subdivision: nextSubdivision,
      accentFirstBeat: nextAccentFirstBeat,
      soundId: nextSoundId,
    })
  }

  setBpm = (value: number): void => {
    const next = clampBpm(value)
    this.patchState({ bpm: next })
    this.persistPrefs(next, this.snapshot.meter, this.snapshot.subdivision)
  }

  setMeter = (nextMeter: MetronomeMeter): void => {
    this.tickCounter = 0
    this.patchState({ meter: nextMeter, beatIndex: 0 })
    this.persistPrefs(this.snapshot.bpm, nextMeter, this.snapshot.subdivision)
  }

  setSubdivision = (nextSubdivision: MetronomeSubdivision): void => {
    this.tickCounter = 0
    this.patchState({ subdivision: nextSubdivision, beatIndex: 0 })
    this.persistPrefs(this.snapshot.bpm, this.snapshot.meter, nextSubdivision)
  }

  setAccentFirstBeat = (nextAccentFirstBeat: boolean): void => {
    this.patchState({ accentFirstBeat: nextAccentFirstBeat })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      nextAccentFirstBeat,
    )
  }

  setSoundId = (nextSoundId: string): void => {
    this.patchState({ soundId: nextSoundId })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      this.snapshot.accentFirstBeat,
      nextSoundId,
    )
  }

  private clearSchedulerTimer(): void {
    if (this.schedulerTimer !== null) {
      window.clearTimeout(this.schedulerTimer)
      this.schedulerTimer = null
    }
  }

  private releaseAudioGraph(): void {
    try {
      this.masterGain?.disconnect()
    } catch {
      /* already disconnected */
    }
    this.masterGain = null
    this.audioCtx = null
  }

  private ensureMasterGain(ctx: AudioContext): GainNode {
    let master = this.masterGain
    if (!master || master.context !== ctx) {
      master = ctx.createGain()
      master.gain.value = metronomeSpeakerGain(this.shouldMuteOutput())
      master.connect(ctx.destination)
      this.masterGain = master
    }
    return master
  }

  private async prepareAudioContextForStart(): Promise<AudioContext | null> {
    const wasReleased = this.audioCtx === null

    let ctx = primePlaybackAudioContextSync()
    if (ctx.state === 'closed') {
      ctx = primePlaybackAudioContextSync()
    }

    this.masterGain = null
    this.audioCtx = ctx

    if (wasReleased) {
      this.debugLog('audio context recreated')
    }

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
        this.debugLog('audio context resumed')
      } catch {
        return null
      }
    }

    return ctx
  }

  private runSchedulerLoop(): void {
    if (!this.snapshot.playing) return

    if (this.schedulerTimer !== null) {
      this.debugLog('prevented duplicate scheduler')
      this.clearSchedulerTimer()
    }

    const sessionId = this.schedulerSession

    const tick = () => {
      if (!this.snapshot.playing || sessionId !== this.schedulerSession) return

      const activeCtx = this.audioCtx
      if (!activeCtx || activeCtx.state === 'closed') {
        this.hardStop()
        return
      }

      if (activeCtx.state === 'suspended') {
        void activeCtx.resume().catch(() => {
          this.hardStop()
        })
      }

      const meter = this.snapshot.meter
      const subdivision = this.snapshot.subdivision
      const barTicks = ticksPerBar(meter, subdivision)
      const secondsPerTick = secondsPerSchedulerTick(meter, this.snapshot.bpm, subdivision)
      const outputNode = this.ensureMasterGain(activeCtx)
      const muted = this.shouldMuteOutput()
      const sound = this.snapshot.soundId

      let uiBeat = -1

      while (this.nextBeatTime < activeCtx.currentTime + SCHEDULE_AHEAD_SEC) {
        const tickInBar = this.tickCounter % barTicks
        const beatTime = this.nextBeatTime
        const tier = applyAccentFirstBeat(
          resolveClickTier(meter, tickInBar, subdivision),
          meter,
          subdivision,
          this.snapshot.accentFirstBeat,
        )
        scheduleMetronomeClick(activeCtx, beatTime, tier, outputNode, muted, sound)

        if (beatTime - activeCtx.currentTime <= SCHEDULE_AHEAD_SEC) {
          uiBeat = resolveUiBeatIndex(meter, tickInBar, subdivision)
        }

        this.nextBeatTime += secondsPerTick
        this.tickCounter += 1
      }

      if (uiBeat >= 0) {
        this.patchState({
          beatIndex: uiBeat,
          beatPulseId: this.snapshot.beatPulseId + 1,
        })
        this.debugLog(`tick beat=${uiBeat + 1}`)
      }

      this.schedulerTimer = window.setTimeout(tick, LOOKAHEAD_MS)
    }

    const ctx = this.audioCtx
    if (!ctx) return

    if (this.nextBeatTime <= 0 || this.nextBeatTime < ctx.currentTime) {
      this.nextBeatTime = ctx.currentTime + START_LEAD_SEC
    }

    tick()
  }

  private hardStop(options?: { background?: boolean }): void {
    if (this.snapshot.playing && !options?.background) {
      this.debugLog('stop')
    }
    this.schedulerSession += 1
    this.clearSchedulerTimer()
    this.patchState({ playing: false })
    if (options?.background) {
      this.releaseAudioGraph()
    }
  }

  stop = (): void => {
    this.resumeOnForeground = false
    this.hardStop()
  }

  start = async (options?: { recovered?: boolean }): Promise<void> => {
    if (typeof window === 'undefined') return

    this.clearSchedulerTimer()

    const ctx = await this.prepareAudioContextForStart()
    if (!ctx || ctx.state === 'closed') {
      this.schedulerSession += 1
      this.clearSchedulerTimer()
      this.patchState({ playing: false })
      return
    }

    this.tickCounter = 0
    this.nextBeatTime = ctx.currentTime + START_LEAD_SEC
    this.schedulerSession += 1
    this.patchState({ playing: true, beatIndex: 0, beatPulseId: 0 })
    this.debugLog(options?.recovered ? 'start (recovered)' : 'start')
    this.runSchedulerLoop()
  }

  togglePlay = (): void => {
    if (this.snapshot.playing) {
      this.stop()
      return
    }
    void this.start()
  }
}

export const sharedMetronomeEngine = new SharedMetronomeEngine()
