import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin, {
  type NativeMultitrackMonitorSource,
  type NativeMultitrackTransportStartResult,
} from '../../utils/audioSessionRoute'

export type MultitrackMonitorSource = NativeMultitrackMonitorSource

export function isNativeMultitrackTransportAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function prepareNativeMultitrackMonitor(
  sources: MultitrackMonitorSource[],
): Promise<boolean> {
  if (!isNativeMultitrackTransportAvailable()) return false
  try {
    const result = await BestTakeAudioPlugin.prepareMultitrackMonitor({ sources })
    return result.prepared
  } catch (error) {
    console.error('[MultitrackTransport] native prepare failed', error)
    return false
  }
}

export async function startNativeMultitrackTransport(options: {
  bpm: number
  beatsPerBar: number
  countInBars: number
  clickEnabled: boolean
  soundId: string
}): Promise<NativeMultitrackTransportStartResult | null> {
  if (!isNativeMultitrackTransportAvailable()) return null
  try {
    return await BestTakeAudioPlugin.startMultitrackTransport(options)
  } catch (error) {
    console.error('[MultitrackTransport] native start failed', error)
    return null
  }
}

export async function stopNativeMultitrackTransport(): Promise<void> {
  if (!isNativeMultitrackTransportAvailable()) return
  try {
    await BestTakeAudioPlugin.stopMultitrackTransport()
  } catch (error) {
    console.warn('[MultitrackTransport] native stop failed', error)
  }
}
