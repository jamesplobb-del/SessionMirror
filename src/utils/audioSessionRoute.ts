import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AudioSessionPluginType {
  setUseIphoneMicForRecording(options: { enabled: boolean }): Promise<void>
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

const AudioSessionPlugin = registerPlugin<AudioSessionPluginType>('AudioSessionPlugin')

/** Route BT headphones for playback while keeping the device built-in mic (A2DP, not HFP). */
export async function applyUseIphoneMicForRecording(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await AudioSessionPlugin.setUseIphoneMicForRecording({ enabled })
  } catch (error) {
    console.warn('Failed to apply device mic audio route:', error)
  }
}

export default AudioSessionPlugin
