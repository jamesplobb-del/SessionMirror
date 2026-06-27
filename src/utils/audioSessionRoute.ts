import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isPlaybackRouteHoldActive } from './playbackRouteCoordinator'

/** Read-only snapshot of the current AVAudioSession route. */
export interface AudioRouteSnapshot {
  success?: boolean
  inputPort?: string
  outputPort?: string
  usesBuiltInMic?: boolean
  usesBluetoothOutput?: boolean
  usesA2DPOutput?: boolean
  availableInputPorts?: string[]
  splitRouteAchieved?: boolean
  usesHeadphones?: boolean
  portType?: string
}

export interface NativePlaybackTestStartResult {
  fileURL: string
  duration: number
  route: string
  systemVolume: number
  playerVolume: number
}

export interface NativeCameraRecordingStartResult {
  filePath: string
  fileURL: string
  route: string
  inputRoute?: string
  width?: number
  height?: number
  audioSessionProfile?: string
  category?: string
  mode?: string
  outputRoute?: string
  sampleRate?: number
  inputGain?: number
  isInputGainSettable?: boolean
  captureInputGain?: number
  captureInputGainSettable?: boolean
}

export interface NativeCameraSessionDiagnostics {
  audioSessionProfile?: string
  category?: string
  mode?: string
  inputRoute?: string
  outputRoute?: string
  sampleRate?: number
  inputGain?: number
  isInputGainSettable?: boolean
  captureInputGain?: number
  captureInputGainSettable?: boolean
}

export interface NativeCameraRecordingStopResult {
  filePath: string
  fileURL: string
  duration: number
  fileSize: number
  mimeType: string
  width: number
  height: number
  route: string
  audioSessionProfile?: string
  category?: string
  mode?: string
  inputRoute?: string
  outputRoute?: string
  sampleRate?: number
  inputGain?: number
  isInputGainSettable?: boolean
  captureInputGain?: number
  captureInputGainSettable?: boolean
  recordedPeakDb?: number
  recordedRmsDb?: number
  recordedActiveRmsDb?: number
}

export interface NativeCameraPostProcessPlaybackResult {
  fileURL: string
  duration: number
  route: string
  systemVolume: number
  playerVolume: number
  postProcess: boolean
}

export interface CameraLikePlaybackSessionSnapshot {
  category: string
  mode: string
  inputRoute: string
  outputRoute: string
}

export interface CameraSessionStateSnapshot {
  previewActive: boolean
  recordingActive: boolean
  playbackRouteActive?: boolean
  playbackSessionPrepared?: boolean
}

export interface NativeExperimentalAudioSnapshot extends AudioRouteSnapshot {
  selectedAudioEngine: string
  enabled: boolean
  category?: string
  mode?: string
  options?: string[]
  currentInputRoute?: string
  currentOutputRoute?: string
  availableInputs?: string[]
  recordingActive?: boolean
  playbackActive?: boolean
  sampleRate?: number
  ioBufferDuration?: number
  outputVolume?: number
  fallbackReason?: string
}

export interface BestTakeAudioPluginType {
  setHighQualityBluetoothMode(options: { enable: boolean }): Promise<{ success: boolean }>
  /** Gentle input-only switch: prefer the built-in mic without disrupting camera/output route. */
  setDeviceMicForRecording(options: { enable: boolean }): Promise<AudioRouteSnapshot>
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
  /** Read-only — reports the current output route without changing it. */
  getPlaybackOutputProfile(): Promise<AudioRouteSnapshot>
  /** Debug A/B — AVPlayer file playback, bypasses WKWebView Web Audio. iOS only. */
  startNativePlaybackTest(options: { url: string }): Promise<NativePlaybackTestStartResult>
  stopNativePlaybackTest(): Promise<void>
  prepareCameraLikePlaybackSession(options?: {
    allowWithActivePreview?: boolean
  }): Promise<CameraLikePlaybackSessionSnapshot>
  setCameraSessionState(options: {
    previewActive: boolean
    recordingActive: boolean
  }): Promise<CameraSessionStateSnapshot>
  getCameraSessionState(): Promise<CameraSessionStateSnapshot>
  setPlaybackRouteActive(options: { active: boolean }): Promise<CameraSessionStateSnapshot>
  restoreRecordingRouteAfterPlayback(): Promise<AudioRouteSnapshot>
  setNativeExperimentalAudioMode(options: {
    enabled: boolean
    selectedAudioEngine: string
    recordingActive?: boolean
    playbackActive?: boolean
  }): Promise<NativeExperimentalAudioSnapshot>
  /** Debug A/B — AVCaptureSession camera+mic recording. iOS only. */
  startNativeCameraRecording(options?: {
    useFrontCamera?: boolean
    audioSessionProfile?: string
  }): Promise<NativeCameraRecordingStartResult>
  startNativeCameraPreview(options?: {
    useFrontCamera?: boolean
    audioSessionProfile?: string
  }): Promise<NativeCameraSessionDiagnostics>
  stopNativeCameraPreview(): Promise<void>
  stopNativeCameraRecording(): Promise<NativeCameraRecordingStopResult>
  playNativeCameraTestPostProcess(options: { url: string }): Promise<NativeCameraPostProcessPlaybackResult>
  stopNativeCameraTestPostProcess(): Promise<void>
  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (data: AudioRouteSnapshot) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'playbackRouteEnded',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
}

const BestTakeAudioPlugin = registerPlugin<BestTakeAudioPluginType>('BestTakeAudioPlugin')

/**
 * Use the phone's built-in mic for recording instead of the (worse) Bluetooth
 * headset mic, while keeping A2DP playback. Input-only change — never reacquires
 * the camera or reconfigures the session, so the live preview is undisturbed.
 */
export async function applyUseIphoneMicForRecording(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (isPlaybackRouteHoldActive()) return
  try {
    const snapshot = await BestTakeAudioPlugin.setDeviceMicForRecording({ enable: enabled })
    console.info(
      `[AudioRoute] device mic ${enabled ? 'ON' : 'OFF'}`,
      `input=${snapshot.inputPort ?? 'unknown'}`,
      `output=${snapshot.outputPort ?? 'unknown'}`,
    )
  } catch (error) {
    console.warn('Failed to apply device mic routing:', error)
  }
}

export async function applyNativeExperimentalAudioMode(options: {
  enabled: boolean
  selectedAudioEngine: string
  recordingActive?: boolean
  playbackActive?: boolean
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return

  try {
    const snapshot = await BestTakeAudioPlugin.setNativeExperimentalAudioMode(options)
    console.info('[AudioEngine] Native Experimental diagnostics', {
      selectedAudioEngine: snapshot.selectedAudioEngine,
      enabled: snapshot.enabled,
      category: snapshot.category,
      mode: snapshot.mode,
      options: snapshot.options,
      currentInputRoute: snapshot.currentInputRoute ?? snapshot.inputPort,
      currentOutputRoute: snapshot.currentOutputRoute ?? snapshot.outputPort,
      availableInputs: snapshot.availableInputs ?? snapshot.availableInputPorts,
      recordingActive: snapshot.recordingActive,
      playbackActive: snapshot.playbackActive,
      fallbackReason: snapshot.fallbackReason,
    })
  } catch (error) {
    console.warn('[AudioEngine] Native Experimental failed:', error)
  }
}

export default BestTakeAudioPlugin
