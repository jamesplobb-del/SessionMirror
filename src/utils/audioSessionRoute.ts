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

const PLUGIN_NAME = 'BestTakeAudioPlugin'

function bestTakeNativeBridge() {
  return Capacitor as typeof Capacitor & {
    nativePromise: <O, T>(pluginName: string, method: string, opts?: O) => Promise<T>
    nativeCallback: <O>(
      pluginName: string,
      method: string,
      opts: O,
      callback: (data: AudioRouteSnapshot) => void,
    ) => string
  }
}

/**
 * iOS fallback: @capacitor/core throws UNIMPLEMENTED when PluginHeaders lacks this
 * plugin at registerPlugin() time. nativePromise still reaches the native bridge once
 * registerPluginInstance() has run in PortraitBridgeViewController.capacitorDidLoad().
 */
const iosBestTakeAudioPlugin: BestTakeAudioPluginType = {
  setHighQualityBluetoothMode: (options) =>
    bestTakeNativeBridge().nativePromise(PLUGIN_NAME, 'setHighQualityBluetoothMode', options),
  enableStereoPlayback: () => bestTakeNativeBridge().nativePromise(PLUGIN_NAME, 'enableStereoPlayback'),
  enableRecordingRoute: () => bestTakeNativeBridge().nativePromise(PLUGIN_NAME, 'enableRecordingRoute'),
  getPlaybackOutputProfile: () =>
    bestTakeNativeBridge().nativePromise(PLUGIN_NAME, 'getPlaybackOutputProfile'),
  addListener: (eventName, listenerFunc) => {
    const cap = bestTakeNativeBridge()
    const callbackId = cap.nativeCallback(PLUGIN_NAME, 'addListener', { eventName }, listenerFunc)
    const handle = Promise.resolve({
      remove: async () => {
        await cap.nativePromise(PLUGIN_NAME, 'removeListener', { eventName, callbackId })
      },
    })
    return handle
  },
}
const BestTakeAudioPlugin = registerPlugin<BestTakeAudioPluginType>(PLUGIN_NAME, {
  ios: iosBestTakeAudioPlugin,
})

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
