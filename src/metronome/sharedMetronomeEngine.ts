import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { metronomeSpeakerGain } from '../utils/playbackVolume'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from '../utils/playbackAudioContext'
import { scheduleMetronomeClick } from '../utils/metronomeClickSounds'
import {
  clampBpm,
  getBeatsPerBar,
  getDefaultAccentPattern,
  getEighthNotesPerBar,
  getMeterDef,
  isCompoundMeter,
  isSimpleEighthMeter,
  isSixteenthMeter,
  loadMetronomePrefs,
  naturalPulseDivisor,
  normalizeAccentPattern,
  resolveClickTierWithAccents,
  saveMetronomePrefs,
  subdivisionsPerBeat,
  suggestSubdivisionForMeterChange,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

const SCHEDULE_AHEAD_SEC = 0.12
const LOOKAHEAD_MS = 25
const START_LEAD_SEC = 0.05
const FOREGROUND_RECOVERY_DELAY_MS = 200

export interface SharedMetronomeSnapshot {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  accentPattern: boolean[]
  soundId: string
  playing: boolean
  beatIndex: number
  subTickIndex: number
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
  if (subdivision === 'off') {
    const divisor = naturalPulseDivisor(meter)
    if (divisor > 1) {
      return macroBeatSec / divisor
    }
  }
  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  return macroBeatSec / ticksPerBeat
}

function resolveUiTick(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
): { beatIndex: number; subTickIndex: number } {
  if (isCompoundMeter(meter) && subdivision === 'off') {
    const beatsPerBar = getBeatsPerBar(meter)
    const beatIndex = Math.floor(tickIndexInBar / 3) % beatsPerBar
    const subTickIndex = tickIndexInBar % 3
    return { beatIndex, subTickIndex }
  }

  if (subdivision === 'off' && (isSimpleEighthMeter(meter) || isSixteenthMeter(meter))) {
    const beatsPerBar = getBeatsPerBar(meter)
    return { beatIndex: tickIndexInBar % beatsPerBar, subTickIndex: 0 }
  }

  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  const beatsPerBar = getBeatsPerBar(meter)
  const beatIndex = Math.floor(tickIndexInBar / ticksPerBeat) % beatsPerBar
  const subTickIndex = tickIndexInBar % ticksPerBeat
  return { beatIndex, subTickIndex }
}

function ticksPerBar(meter: MetronomeMeter, subdivision: MetronomeSubdivision): number {
  if (isCompoundMeter(meter) && subdivision === 'off') {
    return getEighthNotesPerBar(meter)
  }
  if (subdivision === 'off' && (isSimpleEighthMeter(meter) || isSixteenthMeter(meter))) {
    return getMeterDef(meter).numerator
  }
  return getBeatsPerBar(meter) * subdivisionsPerBeat(subdivision)
}

function createInitialSnapshot(): SharedMetronomeSnapshot {
  const prefs = loadMetronomePrefs()
  return {
    bpm: prefs.bpm,
    meter: prefs.meter,
    subdivision: prefs.subdivision,
    accentPattern: normalizeAccentPattern(prefs.meter, prefs.accentPattern),
    soundId: prefs.soundId,
    playing: false,
    beatIndex: 0,
    subTickIndex: 0,
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
  private foregroundTimer: number | null = null
  private recoveringForeground = false
  private startInFlight = false
  private playbackWatchCtx: AudioContext | null = null
  private onPlaybackStateChange: (() => void) | null = null

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

    this.attachPlaybackInterruptWatch()

    const onBackground = () => {
      if (this.isBackgrounded) return
      this.isBackgrounded = true

      if (this.foregroundTimer !== null) {
        window.clearTimeout(this.foregroundTimer)
        this.foregroundTimer = null
      }

      if (this.snapshot.playing) {
        this.resumeOnForeground = true
      }
      this.hardStop({ background: true })
    }

    const onForeground = () => {
      this.isBackgrounded = false
      void resumePlaybackAudioContext().finally(() => {
        this.reconcileAfterInterrupt()
      })
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onBackground()
      } else {
        onForeground()
      }
    }

    const onPageHide = () => {
      if (this.snapshot.playing || this.resumeOnForeground) {
        onBackground()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onForeground)
    window.addEventListener('focus', onForeground)
    window.addEventListener('pagehide', onPageHide)

    const retryOnUserGesture = () => {
      if (!this.resumeOnForeground || this.snapshot.playing) return
      this.reconcileAfterInterrupt()
    }
    document.addEventListener('pointerdown', retryOnUserGesture, { passive: true, capture: true })

    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          onBackground()
        } else {
          onForeground()
        }
      })
      void App.addListener('pause', onBackground)
      void App.addListener('resume', onForeground)
    }
  }

  private attachPlaybackInterruptWatch(): void {
    const ctx = primePlaybackAudioContextSync()
    if (this.playbackWatchCtx === ctx && this.onPlaybackStateChange) return

    if (this.playbackWatchCtx && this.onPlaybackStateChange) {
      this.playbackWatchCtx.removeEventListener('statechange', this.onPlaybackStateChange)
    }

    const onStateChange = () => {
      if (ctx.state === 'suspended' && this.snapshot.playing) {
        void ctx.resume().catch(() => {})
        return
      }
      if (ctx.state === 'running' && this.resumeOnForeground) {
        this.reconcileAfterInterrupt()
      }
    }

    this.playbackWatchCtx = ctx
    this.onPlaybackStateChange = onStateChange
    ctx.addEventListener('statechange', onStateChange)
  }

  private reconcileAfterInterrupt(): void {
    if (this.resumeOnForeground) {
      this.scheduleForegroundRecovery()
      return
    }

    if (!this.snapshot.playing) return

    const ctx = this.audioCtx ?? primePlaybackAudioContextSync()
    const audioNeedsRecovery = ctx.state === 'suspended' || ctx.state === 'closed'
    if (!this.isSchedulerHealthy() || audioNeedsRecovery) {
      this.resumeOnForeground = true
      this.scheduleForegroundRecovery()
    }
  }

  private scheduleForegroundRecovery(): void {
    if (this.foregroundTimer !== null) {
      window.clearTimeout(this.foregroundTimer)
    }
    this.foregroundTimer = window.setTimeout(() => {
      this.foregroundTimer = null
      void this.handleForegroundRecovery()
    }, FOREGROUND_RECOVERY_DELAY_MS)
  }

  private async handleForegroundRecovery(): Promise<void> {
    if (!this.resumeOnForeground) {
      this.isBackgrounded = false
      if (this.snapshot.playing) {
        this.patchState({ playing: false, beatIndex: 0, subTickIndex: 0 })
      }
      return
    }

    if (this.recoveringForeground) return
    this.recoveringForeground = true
    this.isBackgrounded = false

    this.debugLog('foreground recovery')
    this.clearSchedulerTimer()
    this.releaseAudioGraph()

    try {
      await resumePlaybackAudioContext()
      this.attachPlaybackInterruptWatch()

      for (let attempt = 0; attempt < 6; attempt++) {
        if (!this.resumeOnForeground) return

        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 100 * attempt))
          await resumePlaybackAudioContext()
        }

        const started = await this.start({ recovered: true })
        if (started) {
          this.resumeOnForeground = false
          this.debugLog('foreground recovery complete')
          return
        }
      }

      this.debugLog('foreground recovery failed; keeping resume intent')
    } finally {
      this.recoveringForeground = false
    }
  }

  private persistPrefs(
    nextBpm: number,
    nextMeter: MetronomeMeter,
    nextSubdivision: MetronomeSubdivision,
    nextAccentPattern: boolean[] = this.snapshot.accentPattern,
    nextSoundId: string = this.snapshot.soundId,
  ): void {
    saveMetronomePrefs({
      bpm: nextBpm,
      meter: nextMeter,
      subdivision: nextSubdivision,
      accentPattern: normalizeAccentPattern(nextMeter, nextAccentPattern),
      soundId: nextSoundId,
    })
  }

  setBpm = (value: number): void => {
    const next = clampBpm(value)
    this.patchState({ bpm: next })
    this.persistPrefs(next, this.snapshot.meter, this.snapshot.subdivision)
  }

  setMeter = (nextMeter: MetronomeMeter): void => {
    const nextSubdivision = suggestSubdivisionForMeterChange(
      nextMeter,
      this.snapshot.meter,
      this.snapshot.subdivision,
    )
    const nextAccentPattern = getDefaultAccentPattern(nextMeter)
    this.tickCounter = 0
    this.patchState({
      meter: nextMeter,
      subdivision: nextSubdivision,
      beatIndex: 0,
      subTickIndex: 0,
      accentPattern: nextAccentPattern,
    })
    this.persistPrefs(this.snapshot.bpm, nextMeter, nextSubdivision, nextAccentPattern)
    if (import.meta.env.DEV) {
      console.log(`[MetronomeTab] timeSignature=${nextMeter}`)
    }
  }

  setSubdivision = (nextSubdivision: MetronomeSubdivision): void => {
    this.tickCounter = 0
    this.patchState({ subdivision: nextSubdivision, beatIndex: 0, subTickIndex: 0 })
    this.persistPrefs(this.snapshot.bpm, this.snapshot.meter, nextSubdivision)
    if (import.meta.env.DEV) {
      console.log(`[MetronomeTab] subdivision=${nextSubdivision}`)
    }
    this.debugLog(`ticksPerBeat=${subdivisionsPerBeat(nextSubdivision)}`)
  }

  setAccentPattern = (nextAccentPattern: boolean[]): void => {
    const pattern = normalizeAccentPattern(this.snapshot.meter, nextAccentPattern)
    this.patchState({ accentPattern: pattern })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      pattern,
    )
  }

  toggleBeatAccent = (beatIndex: number): void => {
    const beats = getBeatsPerBar(this.snapshot.meter)
    if (beatIndex < 0 || beatIndex >= beats) return
    const pattern = normalizeAccentPattern(this.snapshot.meter, [...this.snapshot.accentPattern])
    pattern[beatIndex] = !pattern[beatIndex]
    this.setAccentPattern(pattern)
  }

  /** Legacy control for audio stage / camera widget — toggles accent on beat 1 only. */
  setAccentFirstBeat = (nextAccentFirstBeat: boolean): void => {
    const pattern = normalizeAccentPattern(this.snapshot.meter, [...this.snapshot.accentPattern])
    if (pattern.length > 0) {
      pattern[0] = nextAccentFirstBeat
    }
    this.setAccentPattern(pattern)
  }

  setSoundId = (nextSoundId: string): void => {
    this.patchState({ soundId: nextSoundId })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      this.snapshot.accentPattern,
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

    await resumePlaybackAudioContext()

    let ctx = primePlaybackAudioContextSync()
    if (ctx.state === 'closed') {
      ctx = primePlaybackAudioContextSync()
    }

    this.masterGain = null
    this.audioCtx = ctx
    this.attachPlaybackInterruptWatch()

    if (wasReleased) {
      this.debugLog('audio context recreated')
    }

    if (ctx.state === 'suspended') {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await ctx.resume()
        } catch {
          /* iOS may block until audio session is ready */
        }
        if (ctx.state !== 'suspended') break
        await new Promise((resolve) => window.setTimeout(resolve, 50 * (attempt + 1)))
      }

      if (ctx.state === 'suspended') {
        this.debugLog('audio context resume blocked')
        return null
      }

      this.debugLog('audio context resumed')
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
        void activeCtx.resume().catch(() => {})
        this.schedulerTimer = window.setTimeout(tick, LOOKAHEAD_MS)
        return
      }

      const meter = this.snapshot.meter
      const subdivision = this.snapshot.subdivision
      const barTicks = ticksPerBar(meter, subdivision)
      const secondsPerTick = secondsPerSchedulerTick(meter, this.snapshot.bpm, subdivision)
      const outputNode = this.ensureMasterGain(activeCtx)
      const muted = this.shouldMuteOutput()
      const sound = this.snapshot.soundId

      let uiBeat = -1
      let uiSubTick = 0

      while (this.nextBeatTime < activeCtx.currentTime + SCHEDULE_AHEAD_SEC) {
        const tickInBar = this.tickCounter % barTicks
        const beatTime = this.nextBeatTime
        const tier = resolveClickTierWithAccents(
          meter,
          tickInBar,
          subdivision,
          this.snapshot.accentPattern,
        )
        scheduleMetronomeClick(activeCtx, beatTime, tier, outputNode, muted, sound)

        if (beatTime - activeCtx.currentTime <= SCHEDULE_AHEAD_SEC) {
          const uiTick = resolveUiTick(meter, tickInBar, subdivision)
          uiBeat = uiTick.beatIndex
          uiSubTick = uiTick.subTickIndex
        }

        this.nextBeatTime += secondsPerTick
        this.tickCounter += 1
      }

      if (uiBeat >= 0) {
        this.patchState({
          beatIndex: uiBeat,
          subTickIndex: uiSubTick,
          beatPulseId: this.snapshot.beatPulseId + 1,
        })
        this.debugLog(`beat=${uiBeat + 1} subTick=${uiSubTick}`)
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

  private isSchedulerHealthy(): boolean {
    return (
      this.schedulerTimer !== null &&
      this.audioCtx !== null &&
      this.audioCtx.state !== 'closed' &&
      this.audioCtx.state !== 'suspended'
    )
  }

  private sanityReset(): void {
    this.debugLog('sanity reset')
    this.schedulerSession += 1
    this.clearSchedulerTimer()
    this.patchState({ playing: false })
  }

  reconcileAfterModeSwitch(): void {
    if (!this.snapshot.playing) return
    if (this.isSchedulerHealthy()) return
    this.sanityReset()
    void this.start({ recovered: true, fromStale: true })
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

  start = async (options?: {
    recovered?: boolean
    fromStale?: boolean
  }): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    if (this.startInFlight) return false

    this.startInFlight = true

    try {
      if (this.snapshot.playing && !this.isSchedulerHealthy()) {
        this.debugLog(
          options?.fromStale
            ? 'start recovered from stale state'
            : 'start recovered from stale state',
        )
        this.sanityReset()
      }

      this.clearSchedulerTimer()

      const ctx = await this.prepareAudioContextForStart()
      if (!ctx || ctx.state === 'closed') {
        this.schedulerSession += 1
        this.clearSchedulerTimer()
        this.patchState({ playing: false })
        return false
      }

      this.tickCounter = 0
      this.nextBeatTime = ctx.currentTime + START_LEAD_SEC
      this.schedulerSession += 1
      this.patchState({ playing: true, beatIndex: 0, subTickIndex: 0, beatPulseId: 0 })
      this.debugLog(options?.recovered ? 'start (recovered)' : 'start')
      this.runSchedulerLoop()
      return true
    } finally {
      this.startInFlight = false
    }
  }

  togglePlay = (): void => {
    if (this.snapshot.playing) {
      if (!this.isSchedulerHealthy()) {
        this.resumeOnForeground = false
        this.sanityReset()
        void this.start()
      } else {
        this.stop()
      }
      return
    }
    this.resumeOnForeground = false
    void this.start()
  }
}

export const sharedMetronomeEngine = new SharedMetronomeEngine()
