import { registerPlugin } from '@capacitor/core'

export interface AudioSessionPluginType {
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

const AudioSessionPlugin = registerPlugin<AudioSessionPluginType>('AudioSessionPlugin')

export default AudioSessionPlugin
