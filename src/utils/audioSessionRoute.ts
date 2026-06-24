import { Capacitor, registerPlugin } from '@capacitor/core'

export interface BestTakeAudioPluginType {
  setHighQualityBluetoothMode(options: { enable: boolean }): Promise<{ success: boolean }>
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
  getPlaybackOutputProfile(): Promise<{ usesHeadphones: boolean; portType: string }>
}

const BestTakeAudioPlugin = registerPlugin<BestTakeAudioPluginType>('BestTakeAudioPlugin')

/** Route BT headphones for playback while keeping the device built-in mic (A2DP, not HFP). */
export async function applyUseIphoneMicForRecording(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BestTakeAudioPlugin.setHighQualityBluetoothMode({ enable: enabled })
  } catch (error) {
    console.warn('Failed to apply high-quality Bluetooth audio route:', error)
  }
}

export default BestTakeAudioPlugin
