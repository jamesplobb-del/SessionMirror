import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { MetronomeClickTier } from '../utils/metronomeConfig'

export interface NativeMetronomeStartResult {
  playing: boolean
  firstClickPerfMs: number
  firstClickHostTimeSec: number
  sampleRate: number
}

export interface NativeMetronomePulseEvent {
  beatIndex: number
  subTickIndex: number
  beatPulseId: number
}

interface MetronomePluginType {
  start(options: {
    tierPattern: Array<MetronomeClickTier | null>
    ticksPerBar: number
    pulseTicks: number
    secondsPerTick: number
    soundId: string
    muted: boolean
    leadSec: number
  }): Promise<NativeMetronomeStartResult>
  stop(): Promise<{ playing: boolean }>
  update(options: {
    tierPattern: Array<MetronomeClickTier | null>
    ticksPerBar: number
    pulseTicks: number
    secondsPerTick: number
    soundId: string
  }): Promise<{ playing: boolean }>
  setMuted(options: { muted: boolean }): Promise<{ muted: boolean }>
  prepare(): Promise<{ prepared: boolean }>
  isPlaying(): Promise<{ playing: boolean }>
  addListener(
    eventName: 'metronomePulse',
    listenerFunc: (event: NativeMetronomePulseEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(eventName: 'metronomeBar', listenerFunc: () => void): Promise<PluginListenerHandle>
}

const MetronomePlugin = registerPlugin<MetronomePluginType>('MetronomePlugin')

const webStub: MetronomePluginType = {
  start: async () => ({ playing: false, firstClickPerfMs: 0, firstClickHostTimeSec: 0, sampleRate: 48_000 }),
  stop: async () => ({ playing: false }),
  update: async () => ({ playing: false }),
  setMuted: async (options) => ({ muted: options.muted }),
  prepare: async () => ({ prepared: false }),
  isPlaying: async () => ({ playing: false }),
  addListener: async () => ({ remove: async () => {} }),
}

export function isNativeIosMetronome(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function plugin(): MetronomePluginType {
  return isNativeIosMetronome() ? MetronomePlugin : webStub
}

export async function nativeMetronomePrepare(): Promise<boolean> {
  if (!isNativeIosMetronome()) return false
  try {
    const result = await plugin().prepare()
    return result.prepared
  } catch {
    return false
  }
}

export async function nativeMetronomeStart(options: {
  tierPattern: Array<MetronomeClickTier | null>
  ticksPerBar: number
  pulseTicks: number
  secondsPerTick: number
  soundId: string
  muted: boolean
  leadSec: number
}): Promise<NativeMetronomeStartResult | null> {
  if (!isNativeIosMetronome()) return null
  try {
    return await plugin().start(options)
  } catch (error) {
    console.warn('[NativeMetronome] start failed', error)
    return null
  }
}

export async function nativeMetronomeStop(): Promise<void> {
  if (!isNativeIosMetronome()) return
  try {
    await plugin().stop()
  } catch {
    /* ignore */
  }
}

export async function nativeMetronomeUpdate(options: {
  tierPattern: Array<MetronomeClickTier | null>
  ticksPerBar: number
  pulseTicks: number
  secondsPerTick: number
  soundId: string
}): Promise<void> {
  if (!isNativeIosMetronome()) return
  try {
    await plugin().update(options)
  } catch {
    /* ignore */
  }
}

export async function nativeMetronomeSetMuted(muted: boolean): Promise<void> {
  if (!isNativeIosMetronome()) return
  try {
    await plugin().setMuted({ muted })
  } catch {
    /* ignore */
  }
}

export async function nativeMetronomeIsPlaying(): Promise<boolean> {
  if (!isNativeIosMetronome()) return false
  try {
    const result = await plugin().isPlaying()
    return result.playing
  } catch {
    return false
  }
}

export function nativeMetronomeAddPulseListener(
  listener: (event: NativeMetronomePulseEvent) => void,
): Promise<PluginListenerHandle> {
  return plugin().addListener('metronomePulse', listener)
}

export function nativeMetronomeAddBarListener(listener: () => void): Promise<PluginListenerHandle> {
  return plugin().addListener('metronomeBar', listener)
}
