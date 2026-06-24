import { Capacitor, registerPlugin } from '@capacitor/core'

export interface AudioSessionPluginType {
  setUseIphoneMicForRecording(options: { enabled: boolean }): Promise<void>
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

const AudioSessionPlugin = registerPlugin<AudioSessionPluginType>('AudioSessionPlugin')

/** Route BT headphones for playback while keeping the iPhone built-in mic (A2DP, not HFP). */
export async function applyUseIphoneMicForRecording(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await AudioSessionPlugin.setUseIphoneMicForRecording({ enabled })
}

export default AudioSessionPlugin
