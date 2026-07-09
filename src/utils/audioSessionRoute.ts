import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { MicInputPreference } from './appSettings'

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
  routeApplied?: boolean
  webPlaybackActive?: boolean
  recordingActive?: boolean
  cameraPreviewActive?: boolean
  playbackRouteActive?: boolean
  queued?: boolean
  fallbackReason?: string
  selectedMicPreference?: MicInputPreference
  preferredInput?: string
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
  /** `coexistent` = speaker override only (camera stays live); `full` = category/mode swap */
  playbackRouteStyle?: 'coexistent' | 'full' | 'unchanged'
}

export interface CameraSessionStateSnapshot {
  previewActive: boolean
  recordingActive: boolean
  playbackRouteActive?: boolean
  playbackSessionPrepared?: boolean
}

export interface NativeShareResult {
  success: boolean
  completed?: boolean
}

export interface NativeCreatorStudioRenderResult {
  success: boolean
  path: string
}

/**
 * Top-left-origin percent rect for multitrack grid compositing — distinct from
 * Creator Studio's center+scale `StudioTransform` convention. Do not conflate
 * the two when reading/writing native render payloads.
 */
export interface NativeRectPercent {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

export interface NativeMultitrackRenderResult {
  success: boolean
  path: string
}

export interface NativeTakeAlignmentResult {
  refinedOffsetMs: number
  residualMs: number
  confidence: number
  applied: boolean
}

export interface NativeWaveformPeaksResult {
  peaks: number[]
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
  nativeLoudnessProfile?: string
  selectedMicPreference?: MicInputPreference
  fallbackReason?: string
}

export interface BestTakeAudioPluginType {
  setHighQualityBluetoothMode(options: { enable: boolean }): Promise<{ success: boolean }>
  /** Gentle input-only switch: prefer the built-in mic without disrupting camera/output route. */
  setDeviceMicForRecording(options: {
    enable?: boolean
    preference?: MicInputPreference
  }): Promise<AudioRouteSnapshot>
  enableStereoPlayback(): Promise<AudioRouteSnapshot>
  enableRecordingRoute(): Promise<void>
  /** Read-only — reports the current output route without changing it. */
  getPlaybackOutputProfile(): Promise<AudioRouteSnapshot>
  /** Debug A/B — AVPlayer file playback, bypasses WKWebView Web Audio. iOS only. */
  startNativePlaybackTest(options: { url: string }): Promise<NativePlaybackTestStartResult>
  stopNativePlaybackTest(): Promise<void>
  startInlineTakeBoxPlayback(options: {
    ownerId?: string
    url: string
    x: number
    y: number
    width: number
    height: number
    cornerRadius?: number
    mirror?: boolean
    volume?: number
  }): Promise<NativePlaybackTestStartResult>
  stopInlineTakeBoxPlayback(options?: { notify?: boolean }): Promise<void>
  updateInlineTakeBoxPlaybackLayout(options: {
    x: number
    y: number
    width: number
    height: number
    cornerRadius?: number
  }): Promise<void>
  setInlineTakeBoxPlaybackVolume(options: { volume: number }): Promise<void>
  prepareCameraLikePlaybackSession(options?: {
    allowWithActivePreview?: boolean
  }): Promise<CameraLikePlaybackSessionSnapshot>
  setCameraSessionState(options: {
    previewActive: boolean
    recordingActive: boolean
    recordingMode?: 'video' | 'audio'
    youtubePlayAlongActive?: boolean
  }): Promise<CameraSessionStateSnapshot>
  getCameraSessionState(): Promise<CameraSessionStateSnapshot>
  setPlaybackRouteActive(options: { active: boolean }): Promise<CameraSessionStateSnapshot>
  restoreRecordingRouteAfterPlayback(): Promise<AudioRouteSnapshot>
  shareMediaFile(options: { path: string; title?: string; audioGain?: number }): Promise<NativeShareResult>
  saveVideoToPhotos(options: { path: string; audioGain?: number }): Promise<{ success: boolean }>
  renderCreatorStudioVideo(options: {
    sourcePath: string
    aspectRatio: string
    trimStartPercent?: number
    trimEndPercent?: number | null
    audioGain?: number
    objects: Array<Record<string, unknown>>
  }): Promise<NativeCreatorStudioRenderResult>
  /** Composites N synced videos into one grid + optional sheet-music overlay + mixed audio. */
  renderMultitrackVideo(options: {
    aspectRatio: string
    durationSeconds: number
    sources: Array<{
      id: string
      path: string
      rect: NativeRectPercent
      trimStartSec?: number
      trimEndSec?: number
    }>
    sheetMusic: { path: string; fileType: string; rect: NativeRectPercent } | null
    backingAudio: { path: string; gain: number } | null
  }): Promise<NativeMultitrackRenderResult>
  setNativeExperimentalAudioMode(options: {
    enabled: boolean
    selectedAudioEngine: string
    micInputPreference?: MicInputPreference
    recordingActive?: boolean
    playbackActive?: boolean
  }): Promise<NativeExperimentalAudioSnapshot>
  /** Debug A/B — AVCaptureSession camera+mic recording. iOS only. */
  startNativeCameraRecording(options?: {
    useFrontCamera?: boolean
    audioSessionProfile?: string
    micInputPreference?: MicInputPreference
  }): Promise<NativeCameraRecordingStartResult>
  startNativeCameraBridge(options?: {
    useFrontCamera?: boolean
    audioSessionProfile?: string
    micInputPreference?: MicInputPreference
  }): Promise<NativeCameraSessionDiagnostics>
  stopNativeCameraBridge(): Promise<void>
  startNativeCameraPreview(options?: {
    useFrontCamera?: boolean
    audioSessionProfile?: string
    micInputPreference?: MicInputPreference
  }): Promise<NativeCameraSessionDiagnostics>
  stopNativeCameraPreview(): Promise<void>
  setNativeCameraPassthrough(options: { enabled: boolean }): Promise<void>
  setNativeCameraFrameBridgeEnabled(options: { enabled: boolean }): Promise<void>
  setNativeCameraPreviewZoom(options: { zoom: number }): Promise<void>
  setNativeAudioTapEnabled(options: { enabled: boolean }): Promise<void>
  /** Cheap, idempotent resync: rebuilds/restarts the native capture session if it should be active but AVFoundation left it stopped/invalid. */
  ensureNativeCameraSessionHealthy(): Promise<CameraSessionStateSnapshot>
  enhanceTakeAudio(options: {
    url: string
    mediaType: 'video' | 'audio'
    params: Record<string, number>
  }): Promise<{ enhanced: boolean; duration: number }>
  stopNativeCameraRecording(options?: { trimStartMs?: number }): Promise<NativeCameraRecordingStopResult>
  getAudioHardwareRtl(): Promise<{ rtlMs: number }>
  getAudioOutputLatencyMs(): Promise<{ latencyMs: number }>
  computeTakeAlignment(options: {
    path: string
    bpm: number
    countInBeats: number
    deterministicOffsetMs: number
    searchMs?: number
  }): Promise<NativeTakeAlignmentResult>
  extractWaveformPeaks(options: { path: string; barCount: number }): Promise<NativeWaveformPeaksResult>
  playNativeCameraTestPostProcess(options: { url: string }): Promise<NativeCameraPostProcessPlaybackResult>
  stopNativeCameraTestPostProcess(): Promise<void>
  /** Native pre-warmed Taptic Engine impact. iOS only. */
  hapticImpact(options: { style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' }): Promise<void>
  /** Native pre-warmed Taptic Engine notification. iOS only. */
  hapticNotification(options: { type: 'success' | 'warning' | 'error' }): Promise<void>
  /** Re-prime the Taptic Engine so the next haptic fires instantly. iOS only. */
  prepareHaptics(): Promise<void>
  addListener(
    eventName: 'audioRouteChanged',
    listenerFunc: (data: AudioRouteSnapshot) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'playbackRouteEnded',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'inlineTakeBoxPlaybackEnded',
    listenerFunc: (data: { ownerId?: string }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nativeCameraPreviewFrame',
    listenerFunc: (data: { jpegBase64?: string; dataUrl?: string; width?: number; height?: number }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'nativeAudioPitchFrame',
    listenerFunc: (data: { pcmBase64?: string; sampleRate?: number; sampleCount?: number }) => void,
  ): Promise<PluginListenerHandle>
}

const BestTakeAudioPlugin = registerPlugin<BestTakeAudioPluginType>('BestTakeAudioPlugin')
let lastNativeExperimentalAudioModeKey: string | null = null
let inFlightNativeExperimentalAudioModeKey: string | null = null
let inFlightNativeExperimentalAudioModePromise: Promise<void> | null = null
let inFlightNativeExperimentalAudioModeToken = 0

/**
 * Use the phone's built-in mic for recording instead of the (worse) Bluetooth
 * headset mic, while keeping A2DP playback. Input-only change — never reacquires
 * the camera or reconfigures the session, so the live preview is undisturbed.
 */
export async function applyMicInputPreference(
  preference: MicInputPreference,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  // No playback-hold early return: native setDeviceMicForRecording is now safe
  // while playback/preview are live — it downgrades to an input-only
  // setPreferredInput switch that never touches the session category or
  // interrupts WebView (YouTube) audio.
  try {
    const snapshot = await BestTakeAudioPlugin.setDeviceMicForRecording({ preference })
    console.info('[AudioRoute] mic input preference', {
      selectedMicPreference: snapshot.selectedMicPreference ?? preference,
      preferredInput: snapshot.preferredInput,
      input: snapshot.inputPort,
      output: snapshot.outputPort,
      availableInputs: snapshot.availableInputPorts,
      queued: snapshot.queued,
      fallbackReason: snapshot.fallbackReason,
    })
  } catch (error) {
    console.warn('Failed to apply mic input preference:', error)
  }
}

/** @deprecated Use applyMicInputPreference. */
export async function applyUseIphoneMicForRecording(enabled: boolean): Promise<void> {
  await applyMicInputPreference(enabled ? 'iphone' : 'headphone')
}

export async function applyNativeExperimentalAudioMode(options: {
  enabled: boolean
  selectedAudioEngine: string
  micInputPreference?: MicInputPreference
  recordingActive?: boolean
  playbackActive?: boolean
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return

  const stateKey = JSON.stringify({
    enabled: options.enabled,
    selectedAudioEngine: options.selectedAudioEngine,
    micInputPreference: options.micInputPreference ?? null,
    recordingActive: options.recordingActive === true,
    playbackActive: options.playbackActive === true,
  })
  if (stateKey === lastNativeExperimentalAudioModeKey) return
  if (
    stateKey === inFlightNativeExperimentalAudioModeKey &&
    inFlightNativeExperimentalAudioModePromise
  ) {
    await inFlightNativeExperimentalAudioModePromise
    return
  }

  inFlightNativeExperimentalAudioModeKey = stateKey
  const requestToken = ++inFlightNativeExperimentalAudioModeToken
  const applyPromise = (async () => {
    try {
      const snapshot = await BestTakeAudioPlugin.setNativeExperimentalAudioMode(options)
      lastNativeExperimentalAudioModeKey = stateKey
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
        nativeLoudnessProfile: snapshot.nativeLoudnessProfile,
        selectedMicPreference: snapshot.selectedMicPreference,
        preferredInput: snapshot.preferredInput,
        fallbackReason: snapshot.fallbackReason,
      })
    } catch (error) {
      console.warn('[AudioEngine] Native Experimental failed:', error)
    } finally {
      if (
        inFlightNativeExperimentalAudioModeKey === stateKey &&
        inFlightNativeExperimentalAudioModeToken === requestToken
      ) {
        inFlightNativeExperimentalAudioModeKey = null
        inFlightNativeExperimentalAudioModePromise = null
      }
    }
  })()
  inFlightNativeExperimentalAudioModePromise = applyPromise
  await applyPromise
}

export default BestTakeAudioPlugin
