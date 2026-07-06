import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import {
  APP_BACKGROUND_SUSPEND_EVENT,
  APP_FOREGROUND_RECOVERY_EVENT,
} from '../utils/appForeground'
import { metronomeSpeakerGain } from '../utils/playbackVolume'
import { primePlaybackAudioContextSync, resumePlaybackAudioContext } from '../utils/playbackAudioContext'
import { scheduleMetronomeClick } from '../utils/metronomeClickSounds'
import {
  cycleAccentLevel,
  resolveUiTick,
  secondsPerSchedulerTick,
  ticksPerBar,
} from '../metronome/metronomeTiming'
import {
  clampBpm,
  getAccentLevelsForMeter,
  getMeterDefaults,
  hasFeelOptions,
  loadMetronomePrefs,
  normalizeAccentLevels,
  resolveClickTierWithAccents,
  saveMetronomePrefs,
  suggestSubdivisionForMeterChange,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'
import { resolvePulseTiming } from './pulseResolution'
import { meterHasPulseModeChoice } from './pulseModes'

const SCHEDULE_AHEAD_SEC = 0.12
const LOOKAHEAD_MS = 25
const START_LEAD_SEC = 0.05
const FOREGROUND_RECOVERY_DELAY_MS = 200

export interface SharedMetronomeSnapshot {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  feelId?: string
  pulseModeId: string
  pulseCount: number
  compound: boolean
  bpmSymbol: string
  pulseName: string
  accentLevels: MetronomeAccentLevel[]
  soundId: string
  playing: boolean
  beatIndex: number
  subTickIndex: number
  beatPulseId: number
}

type Listener = () => void
type BarListener = () => void
type PulseListener = (beatIndex: number) => void

function createInitialSnapshot(): SharedMetronomeSnapshot {
  const prefs = loadMetronomePrefs()
  const defaults = getMeterDefaults(prefs.meter, prefs.pulseModeId)
  const resolved = resolvePulseTiming({
    meter: prefs.meter,
    pulseModeId: defaults.pulseModeId,
    feelId: prefs.feelId ?? defaults.feelId,
    customAccents: prefs.accentLevels,
  })
  return {
    bpm: prefs.bpm,
    meter: prefs.meter,
    subdivision: prefs.subdivision,
    feelId: resolved.feelId,
    pulseModeId: resolved.pulseModeId,
    pulseCount: resolved.pulseCount,
    compound: resolved.compound,
    bpmSymbol: resolved.bpmSymbol,
    pulseName: resolved.pulseName,
    accentLevels: normalizeAccentLevels(
      prefs.meter,
      resolved.accentLevels,
      resolved.feelId,
      resolved.pulseModeId,
    ),
    soundId: prefs.soundId,
    playing: false,
    beatIndex: 0,
    subTickIndex: 0,
    beatPulseId: 0,
  }
}

class SharedMetronomeEngine {
  private listeners = new Set<Listener>()
  private barListeners = new Set<BarListener>()
  private pulseListeners = new Set<PulseListener>()
  private snapshot: SharedMetronomeSnapshot = createInitialSnapshot()

  private audioCtx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private schedulerTimer: number | null = null
  private schedulerSession = 0
  private nextBeatTime = 0
  private tickCounter = 0

  private isTakePlaying = false
  private muteDuringPlayback = true
  private outputGainMultiplier = 1
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

  subscribeBar = (listener: BarListener): (() => void) => {
    this.barListeners.add(listener)
    return () => {
      this.barListeners.delete(listener)
    }
  }

  /** Fires at the start of each conducting pulse (subTick 0). beatIndex is 0-based. */
  subscribePulse = (listener: PulseListener): (() => void) => {
    this.pulseListeners.add(listener)
    return () => {
      this.pulseListeners.delete(listener)
    }
  }

  private emitBar(): void {
    for (const listener of this.barListeners) {
      listener()
    }
  }

  private emitPulse(beatIndex: number): void {
    for (const listener of this.pulseListeners) {
      listener(beatIndex)
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

  private applyMasterGain(): void {
    const ctx = this.audioCtx
    const master = this.masterGain
    if (!ctx || !master || master.context !== ctx) return
    master.gain.setValueAtTime(
      metronomeSpeakerGain(this.shouldMuteOutput()) * this.outputGainMultiplier,
      ctx.currentTime,
    )
  }

  /** Optional session gain (e.g. multitrack mixer). Resets to 1 when not used. */
  setOutputGainMultiplier(multiplier: number): void {
    this.outputGainMultiplier = Math.max(0, Math.min(1, multiplier))
    this.applyMasterGain()
  }

  setPlaybackMutePolicy(isTakePlaying: boolean, muteDuringPlayback: boolean): void {
    this.isTakePlaying = isTakePlaying
    this.muteDuringPlayback = muteDuringPlayback
    this.applyMasterGain()
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
    window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, onBackground)
    window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, onForeground)

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

  private enrichPulseFields(
    partial: Partial<SharedMetronomeSnapshot>,
  ): Partial<SharedMetronomeSnapshot> {
    const meter = partial.meter ?? this.snapshot.meter
    const pulseModeId = partial.pulseModeId ?? this.snapshot.pulseModeId
    const feelId = partial.feelId !== undefined ? partial.feelId : this.snapshot.feelId
    const accentLevels = partial.accentLevels ?? this.snapshot.accentLevels
    const resolved = resolvePulseTiming({
      meter,
      pulseModeId,
      feelId,
      customAccents: accentLevels,
    })
    return {
      pulseModeId: resolved.pulseModeId,
      pulseCount: resolved.pulseCount,
      compound: resolved.compound,
      bpmSymbol: resolved.bpmSymbol,
      pulseName: resolved.pulseName,
      feelId: resolved.feelId,
      accentLevels: normalizeAccentLevels(
        meter,
        resolved.accentLevels,
        resolved.feelId,
        resolved.pulseModeId,
      ),
    }
  }

  private persistPrefs(
    nextBpm: number = this.snapshot.bpm,
    nextMeter: MetronomeMeter = this.snapshot.meter,
    nextSubdivision: MetronomeSubdivision = this.snapshot.subdivision,
    nextFeelId: string | undefined = this.snapshot.feelId,
    nextAccentLevels: MetronomeAccentLevel[] = this.snapshot.accentLevels,
    nextSoundId: string = this.snapshot.soundId,
    nextPulseModeId: string = this.snapshot.pulseModeId,
  ): void {
    saveMetronomePrefs({
      bpm: nextBpm,
      meter: nextMeter,
      subdivision: nextSubdivision,
      feelId: nextFeelId,
      pulseModeId: nextPulseModeId,
      accentLevels: normalizeAccentLevels(nextMeter, nextAccentLevels, nextFeelId, nextPulseModeId),
      soundId: nextSoundId,
    })
  }

  setBpm = (value: number): void => {
    const next = clampBpm(value)
    this.patchState({ bpm: next })
    this.persistPrefs(next)
  }

  setMeter = (nextMeter: MetronomeMeter): void => {
    const defaults = getMeterDefaults(nextMeter)
    const nextSubdivision = suggestSubdivisionForMeterChange(
      nextMeter,
      this.snapshot.meter,
      this.snapshot.subdivision,
      defaults.pulseModeId,
      this.snapshot.pulseModeId,
    )
    const nextFeelId = defaults.feelId
    const nextAccentLevels = getAccentLevelsForMeter(nextMeter, nextFeelId, defaults.pulseModeId)
    this.tickCounter = 0
    this.patchState({
      meter: nextMeter,
      subdivision: nextSubdivision,
      feelId: nextFeelId,
      pulseModeId: defaults.pulseModeId,
      beatIndex: 0,
      subTickIndex: 0,
      accentLevels: nextAccentLevels,
      ...this.enrichPulseFields({
        meter: nextMeter,
        pulseModeId: defaults.pulseModeId,
        feelId: nextFeelId,
        accentLevels: nextAccentLevels,
      }),
    })
    this.persistPrefs(
      this.snapshot.bpm,
      nextMeter,
      nextSubdivision,
      nextFeelId,
      this.snapshot.accentLevels,
      this.snapshot.soundId,
      defaults.pulseModeId,
    )
    if (import.meta.env.DEV) {
      console.log(`[MetronomeTab] timeSignature=${nextMeter}`)
    }
  }

  setPulseMode = (nextPulseModeId: string): void => {
    if (!meterHasPulseModeChoice(this.snapshot.meter)) return
    const defaults = getMeterDefaults(this.snapshot.meter, nextPulseModeId)
    const nextAccentLevels = getAccentLevelsForMeter(
      this.snapshot.meter,
      defaults.feelId,
      nextPulseModeId,
    )
    this.tickCounter = 0
    this.patchState({
      pulseModeId: nextPulseModeId,
      subdivision: defaults.subdivision,
      feelId: defaults.feelId,
      accentLevels: nextAccentLevels,
      beatIndex: 0,
      subTickIndex: 0,
      ...this.enrichPulseFields({
        pulseModeId: nextPulseModeId,
        feelId: defaults.feelId,
        accentLevels: nextAccentLevels,
      }),
    })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      defaults.subdivision,
      defaults.feelId,
      this.snapshot.accentLevels,
      this.snapshot.soundId,
      nextPulseModeId,
    )
  }

  setFeel = (nextFeelId: string): void => {
    if (!hasFeelOptions(this.snapshot.meter, this.snapshot.pulseModeId)) return
    const nextAccentLevels = getAccentLevelsForMeter(
      this.snapshot.meter,
      nextFeelId,
      this.snapshot.pulseModeId,
    )
    this.tickCounter = 0
    this.patchState({
      feelId: nextFeelId,
      accentLevels: nextAccentLevels,
      beatIndex: 0,
      subTickIndex: 0,
      ...this.enrichPulseFields({ feelId: nextFeelId, accentLevels: nextAccentLevels }),
    })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      nextFeelId,
      nextAccentLevels,
    )
    if (import.meta.env.DEV) {
      console.log(`[MetronomeTab] feel=${nextFeelId}`)
    }
  }

  setSubdivision = (nextSubdivision: MetronomeSubdivision): void => {
    this.tickCounter = 0
    this.patchState({ subdivision: nextSubdivision, beatIndex: 0, subTickIndex: 0 })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      nextSubdivision,
      this.snapshot.feelId,
      this.snapshot.accentLevels,
    )
    if (import.meta.env.DEV) {
      console.log(`[MetronomeTab] subdivision=${nextSubdivision}`)
    }
  }

  setAccentLevels = (nextAccentLevels: MetronomeAccentLevel[]): void => {
    const levels = normalizeAccentLevels(
      this.snapshot.meter,
      nextAccentLevels,
      this.snapshot.feelId,
      this.snapshot.pulseModeId,
    )
    this.patchState({
      accentLevels: levels,
      ...this.enrichPulseFields({ accentLevels: levels }),
    })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      this.snapshot.feelId,
      levels,
    )
  }

  /** @deprecated Use setAccentLevels */
  setAccentPattern = (nextAccentPattern: boolean[]): void => {
    const levels = normalizeAccentLevels(
      this.snapshot.meter,
      nextAccentPattern.map((accented, index) => {
        if (!accented) return 'weak'
        return index === 0 ? 'strong' : 'medium'
      }),
      this.snapshot.feelId,
      this.snapshot.pulseModeId,
    )
    this.setAccentLevels(levels)
  }

  toggleBeatAccent = (beatIndex: number): void => {
    const beats = this.snapshot.pulseCount
    if (beatIndex < 0 || beatIndex >= beats) return
    const levels = normalizeAccentLevels(
      this.snapshot.meter,
      [...this.snapshot.accentLevels],
      this.snapshot.feelId,
      this.snapshot.pulseModeId,
    )
    const current = levels[beatIndex] ?? 'weak'
    levels[beatIndex] = cycleAccentLevel(current)
    this.setAccentLevels(levels)
  }

  /** Legacy control for audio stage / camera widget — toggles accent on beat 1 only. */
  setAccentFirstBeat = (nextAccentFirstBeat: boolean): void => {
    const levels = normalizeAccentLevels(
      this.snapshot.meter,
      [...this.snapshot.accentLevels],
      this.snapshot.feelId,
      this.snapshot.pulseModeId,
    )
    if (levels.length > 0) {
      levels[0] = nextAccentFirstBeat ? 'strong' : 'weak'
    }
    this.setAccentLevels(levels)
  }

  setSoundId = (nextSoundId: string): void => {
    this.patchState({ soundId: nextSoundId })
    this.persistPrefs(
      this.snapshot.bpm,
      this.snapshot.meter,
      this.snapshot.subdivision,
      this.snapshot.feelId,
      this.snapshot.accentLevels,
      nextSoundId,
    )
  }

  /** Apply section settings during timeline playback without overwriting saved metronome prefs. */
  applySectionConfig = (
    config: {
      bpm: number
      meter: MetronomeMeter
      subdivision: MetronomeSubdivision
      feelId?: string
      pulseModeId?: string
      accentLevels: MetronomeAccentLevel[]
      soundId?: string
    },
    options?: { resetBeat?: boolean },
  ): void => {
    const nextBpm = clampBpm(config.bpm)
    const pulseModeId = config.pulseModeId ?? getMeterDefaults(config.meter).pulseModeId
    const levels = normalizeAccentLevels(
      config.meter,
      config.accentLevels,
      config.feelId,
      pulseModeId,
    )
    const resetBeat = options?.resetBeat !== false
    if (resetBeat) this.tickCounter = 0
    this.patchState({
      bpm: nextBpm,
      meter: config.meter,
      subdivision: config.subdivision,
      feelId: config.feelId,
      pulseModeId,
      accentLevels: levels,
      ...(resetBeat ? { beatIndex: 0, subTickIndex: 0 } : {}),
      ...(config.soundId ? { soundId: config.soundId } : {}),
      ...this.enrichPulseFields({
        meter: config.meter,
        pulseModeId,
        feelId: config.feelId,
        accentLevels: levels,
      }),
    })
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
      master.gain.value = metronomeSpeakerGain(this.shouldMuteOutput()) * this.outputGainMultiplier
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
      const pulseCount = this.snapshot.pulseCount
      const barTicks = ticksPerBar(meter, subdivision, pulseCount)
      const secondsPerTick = secondsPerSchedulerTick(meter, this.snapshot.bpm, subdivision, pulseCount)
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
          this.snapshot.accentLevels,
          pulseCount,
        )
        if (tier) {
          scheduleMetronomeClick(activeCtx, beatTime, tier, outputNode, muted, sound)
        }

        if (beatTime - activeCtx.currentTime <= SCHEDULE_AHEAD_SEC) {
          const uiTick = resolveUiTick(meter, tickInBar, subdivision, pulseCount)
          uiBeat = uiTick.beatIndex
          uiSubTick = uiTick.subTickIndex
        }

        this.nextBeatTime += secondsPerTick
        this.tickCounter += 1
        if (this.tickCounter > 0 && this.tickCounter % barTicks === 0) {
          this.emitBar()
        }
      }

      if (uiBeat >= 0) {
        if (uiSubTick === 0) {
          this.emitPulse(uiBeat)
        }
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
