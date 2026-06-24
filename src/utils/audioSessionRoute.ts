import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface AudioRouteSnapshot {
  success?: boolean
  inputPort: string
  outputPort: string
  usesBuiltInMic: boolean
  usesBluetoothOutput: boolean
  usesA2DPOutput: boolean
  availableInputPorts: string[]
  splitRouteAchieved: boolean
  usesHeadphones?: boolean
  portType?: string
}

export interface BestTakeAudioPluginType {
  setHighQualityBluetoothMode(options: { enable: boolean }): Promise<AudioRouteSnapshot>
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
  getPlaybackOutputProfile(): Promise<AudioRouteSnapshot>
  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (data: AudioRouteSnapshot) => void,
  ): Promise<PluginListenerHandle>
}

const BestTakeAudioPlugin = registerPlugin<BestTakeAudioPluginType>('BestTakeAudioPlugin')

function logAudioRoute(label: string, snapshot: AudioRouteSnapshot): void {
  console.info(
    `[AudioRoute] ${label}`,
    `input=${snapshot.inputPort}`,
    `output=${snapshot.outputPort}`,
    `builtInMic=${snapshot.usesBuiltInMic}`,
    `btOut=${snapshot.usesBluetoothOutput}`,
    `a2dpOut=${snapshot.usesA2DPOutput}`,
    `splitRoute=${snapshot.splitRouteAchieved}`,
    `availableInputs=${snapshot.availableInputPorts.join(',') || 'none'}`,
  )
}

/** Route BT headphones for playback while keeping the device built-in mic (A2DP, not HFP). */
export async function applyUseIphoneMicForRecording(
  enabled: boolean,
): Promise<AudioRouteSnapshot | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    const snapshot = await BestTakeAudioPlugin.setHighQualityBluetoothMode({ enable: enabled })
    logAudioRoute(enabled ? 'Use device mic ON' : 'Use device mic OFF', snapshot)
    if (enabled && !snapshot.splitRouteAchieved) {
      console.warn(
        '[AudioRoute] Split route not achieved — iOS kept input/output coupled. ' +
          `input=${snapshot.inputPort} output=${snapshot.outputPort}`,
      )
    }
    return snapshot
  } catch (error) {
    console.warn('Failed to apply high-quality Bluetooth audio route:', error)
    return null
  }
}

export default BestTakeAudioPlugin
