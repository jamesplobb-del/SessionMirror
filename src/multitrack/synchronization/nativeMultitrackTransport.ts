import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin, {
  type NativeMultitrackMonitorSource,
  type NativeMultitrackTransportStartResult,
} from '../../utils/audioSessionRoute'

export type MultitrackMonitorSource = NativeMultitrackMonitorSource

// Keep/Retry can issue a stop without awaiting it. A subsequent prepare/start
// must not overtake that stop and have its newly prepared graph torn down.
let transportWork: Promise<unknown> = Promise.resolve()
function enqueueTransport<T>(operation: () => Promise<T>): Promise<T> {
  const work = transportWork.then(operation, operation)
  transportWork = work.catch(() => {})
  return work
}

export function isNativeMultitrackTransportAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function prepareNativeMultitrackMonitor(
  sources: MultitrackMonitorSource[],
): Promise<boolean> {
  if (!isNativeMultitrackTransportAvailable()) return false
  const result = await enqueueTransport(() => BestTakeAudioPlugin.prepareMultitrackMonitor({ sources }))
  return result.prepared
}

export async function startNativeMultitrackTransport(options: {
  bpm: number
  beatsPerBar: number
  countInBars: number
  clickEnabled: boolean
  soundId: string
  playbackCountOff?: boolean
}): Promise<NativeMultitrackTransportStartResult | null> {
  if (!isNativeMultitrackTransportAvailable()) return null
  return enqueueTransport(() => BestTakeAudioPlugin.startMultitrackTransport(options))
}

/**
 * Silence the running mix without stopping the transport — used when the
 * headphones go away mid-take, so nothing plays out of the speaker into the mic.
 * Not queued behind prepare/stop: it has to land now, and the next start
 * resets it anyway.
 */
export async function setNativeMultitrackOutputMuted(muted: boolean): Promise<void> {
  if (!isNativeMultitrackTransportAvailable()) return
  try {
    await BestTakeAudioPlugin.setMultitrackOutputMuted({ muted })
  } catch (error) {
    console.warn('[MultitrackTransport] native mute failed', error)
  }
}

export async function stopNativeMultitrackTransport(): Promise<void> {
  if (!isNativeMultitrackTransportAvailable()) return
  try {
    await enqueueTransport(() => BestTakeAudioPlugin.stopMultitrackTransport())
  } catch (error) {
    console.warn('[MultitrackTransport] native stop failed', error)
  }
}
