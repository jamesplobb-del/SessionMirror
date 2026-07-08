import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin, { type NativePlaybackTestStartResult } from './audioSessionRoute'
import type { MicInputPreference } from './appSettings'
import {
  completePlaybackRouteRestore,
  preparePlaybackRoute,
} from './playbackRouteCoordinator'

export type NativeCameraAudioSessionProfile =
  | 'videoRecording'
  | 'playAndRecordDefault'
  | 'recordVideoRecording'

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

export interface NativeCameraRecordingStartResult extends NativeCameraSessionDiagnostics {
  filePath: string
  fileURL: string
  route: string
  inputRoute?: string
  width?: number
  height?: number
}

export interface NativeCameraRecordingStopResult extends NativeCameraSessionDiagnostics {
  filePath: string
  fileURL: string
  duration: number
  fileSize: number
  mimeType: string
  width: number
  height: number
  route: string
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

export function isNativeCameraTestAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** Start AVCaptureSession movie recording — debug A/B only, bypasses WKWebView. */
export async function startNativeCameraRecording(
  options: {
    useFrontCamera?: boolean
    audioSessionProfile?: NativeCameraAudioSessionProfile
    micInputPreference?: MicInputPreference
  } = {},
): Promise<NativeCameraRecordingStartResult | null> {
  if (!isNativeCameraTestAvailable()) {
    console.warn('[NativeCameraTest] iOS native only')
    return null
  }

  const useFrontCamera = options.useFrontCamera ?? true
  const audioSessionProfile = options.audioSessionProfile ?? 'videoRecording'
  const micInputPreference = options.micInputPreference

  try {
    const result = await BestTakeAudioPlugin.startNativeCameraRecording({
      useFrontCamera,
      audioSessionProfile,
      micInputPreference,
    })
    console.log('[NativeCameraTest] session started (JS)')
    console.log('audioSessionProfile =', result.audioSessionProfile ?? audioSessionProfile)
    console.log('category =', result.category)
    console.log('mode =', result.mode)
    console.log('inputRoute =', result.inputRoute)
    console.log('outputRoute =', result.outputRoute ?? result.route)
    console.log('sampleRate =', result.sampleRate)
    console.log('inputGain =', result.inputGain)
    console.log('isInputGainSettable =', result.isInputGainSettable)
    console.log('fileURL =', result.fileURL)
    return result
  } catch (error) {
    console.warn('[NativeCameraTest] start failed', error)
    return null
  }
}

export async function startNativeCameraBridge(
  options: {
    useFrontCamera?: boolean
    audioSessionProfile?: NativeCameraAudioSessionProfile
    micInputPreference?: MicInputPreference
  } = {},
): Promise<NativeCameraSessionDiagnostics | null> {
  if (!isNativeCameraTestAvailable()) return null

  const useFrontCamera = options.useFrontCamera ?? true
  const audioSessionProfile = options.audioSessionProfile ?? 'videoRecording'
  const micInputPreference = options.micInputPreference

  try {
    const result = await BestTakeAudioPlugin.startNativeCameraBridge({
      useFrontCamera,
      audioSessionProfile,
      micInputPreference,
    })
    console.log('[NativeCameraBridge] started')
    return result
  } catch (error) {
    console.warn('[NativeCameraBridge] start failed', error)
    return null
  }
}

export async function stopNativeCameraBridge(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.stopNativeCameraBridge()
    console.log('[NativeCameraBridge] stopped')
  } catch (error) {
    console.warn('[NativeCameraBridge] stop failed', error)
  }
}

export async function startNativeCameraPreview(
  options: {
    useFrontCamera?: boolean
    audioSessionProfile?: NativeCameraAudioSessionProfile
    micInputPreference?: MicInputPreference
  } = {},
): Promise<NativeCameraSessionDiagnostics | null> {
  if (!isNativeCameraTestAvailable()) return null

  const useFrontCamera = options.useFrontCamera ?? true
  const audioSessionProfile = options.audioSessionProfile ?? 'videoRecording'
  const micInputPreference = options.micInputPreference

  try {
    const result = await BestTakeAudioPlugin.startNativeCameraPreview({
      useFrontCamera,
      audioSessionProfile,
      micInputPreference,
    })
    console.log('[NativeCameraPreview] started')
    console.log('audioSessionProfile =', result.audioSessionProfile ?? audioSessionProfile)
    console.log('category =', result.category)
    console.log('mode =', result.mode)
    console.log('inputRoute =', result.inputRoute)
    console.log('outputRoute =', result.outputRoute)
    return result
  } catch (error) {
    console.warn('[NativeCameraPreview] start failed', error)
    return null
  }
}

/**
 * Cheap, idempotent resync for the native capture session. Rebuilds/restarts
 * it only if it should currently be active (preview/bridge/recording) but
 * AVFoundation left it stopped or invalid — safe to call defensively on every
 * foreground recovery, app-idle wake, or lifecycle swipe-in.
 */
export async function ensureNativeCameraSessionHealthy(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.ensureNativeCameraSessionHealthy()
  } catch (error) {
    console.warn('[NativeCameraRecovery] health check failed', error)
  }
}

export async function stopNativeCameraPreview(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.stopNativeCameraPreview()
    console.log('[NativeCameraPreview] stopped')
  } catch (error) {
    console.warn('[NativeCameraPreview] stop failed', error)
  }
}

/** Reveal or hide the native camera preview layer by toggling WebView transparency. */
export async function setNativeCameraPassthrough(enabled: boolean): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.setNativeCameraPassthrough({ enabled })
  } catch (error) {
    console.warn('[NativeCameraPreview] passthrough toggle failed', error)
  }
}

/**
 * Web-side half of passthrough: the CSS class makes html/body/.app-shell and the
 * camera background transparent so the native preview layer shows through.
 */
export function setNativeCameraPassthroughClass(enabled: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('native-camera-passthrough', enabled)
}

/**
 * On-demand JPEG frame pump while the layer preview is the display path
 * (multitrack stage canvas, thumbnail capture).
 */
export async function setNativeCameraFrameBridgeEnabled(enabled: boolean): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.setNativeCameraFrameBridgeEnabled({ enabled })
  } catch (error) {
    console.warn('[NativeCameraPreview] frame bridge toggle failed', error)
  }
}

/** Preview-only zoom on the native layer (recordings stay unzoomed). */
export async function setNativeCameraPreviewZoom(zoom: number): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.setNativeCameraPreviewZoom({ zoom })
  } catch (error) {
    console.warn('[NativeCameraPreview] zoom failed', error)
  }
}

export async function stopNativeCameraRecording(options?: { trimStartMs?: number }): Promise<NativeCameraRecordingStopResult | null> {
  if (!isNativeCameraTestAvailable()) return null

  try {
    const result = await BestTakeAudioPlugin.stopNativeCameraRecording(options)
    console.log('[NativeCameraTest] recording stopped (JS)')
    console.log('audioSessionProfile =', result.audioSessionProfile)
    console.log('category =', result.category)
    console.log('mode =', result.mode)
    console.log('inputRoute =', result.inputRoute)
    console.log('outputRoute =', result.outputRoute ?? result.route)
    console.log('sampleRate =', result.sampleRate)
    console.log('inputGain =', result.inputGain)
    console.log('isInputGainSettable =', result.isInputGainSettable)
    console.log('file saved =', result.fileURL)
    console.log('duration =', result.duration)
    console.log('fileSize =', result.fileSize)
    console.log('mimeType =', result.mimeType)
    console.log('width =', result.width)
    console.log('height =', result.height)
    console.log('recordedPeakDb =', result.recordedPeakDb)
    console.log('recordedRmsDb =', result.recordedRmsDb)
    console.log('recordedActiveRmsDb =', result.recordedActiveRmsDb)
    return result
  } catch (error) {
    console.warn('[NativeCameraTest] stop failed', error)
    return null
  }
}

export async function getAudioHardwareRtl(): Promise<number> {
  if (!isNativeCameraTestAvailable()) return 0
  try {
    const result = await BestTakeAudioPlugin.getAudioHardwareRtl()
    return result.rtlMs ?? 0
  } catch (error) {
    console.warn('[Playback] getAudioHardwareRtl failed', error)
    return 0
  }
}

/** Speaker output latency (no input path) — used to delay Web Audio clicks behind HTMLMediaElement reference. */
export async function getAudioOutputLatencyMs(): Promise<number> {
  if (!isNativeCameraTestAvailable()) return 40
  try {
    const result = await BestTakeAudioPlugin.getAudioOutputLatencyMs()
    return result.latencyMs ?? 40
  } catch (error) {
    console.warn('[Playback] getAudioOutputLatencyMs failed', error)
    return 40
  }
}


/** Play native camera test clip via dedicated post-process plugin method (AVPlayer). */
export async function playNativeCameraTestClipPostProcess(
  fileURL: string,
): Promise<NativeCameraPostProcessPlaybackResult | null> {
  console.log('[PostProcessButton] clicked')

  if (!isNativeCameraTestAvailable()) {
    console.error('[PostProcessButton] failure — iOS native only')
    return null
  }

  if (!fileURL || !fileURL.trim()) {
    console.error('[PostProcessButton] failure — no valid clip URL (record a native test clip first)')
    return null
  }

  console.log(`[PostProcessButton] url=${fileURL}`)

  try {
    await preparePlaybackRoute({ suspendCamera: true })
    const result = await BestTakeAudioPlugin.playNativeCameraTestPostProcess({ url: fileURL })
    console.log('[PostProcessButton] success')
    return result
  } catch (error) {
    console.error('[PostProcessButton] failure', error)
    await completePlaybackRouteRestore()
    return null
  }
}

/** Play the native camera test clip via AVPlayer (not Web Audio). */
export async function playNativeCameraTestClip(
  fileURL: string,
): Promise<NativePlaybackTestStartResult | null> {
  if (!isNativeCameraTestAvailable() || !fileURL) return null

  try {
    await preparePlaybackRoute({ suspendCamera: true })
    const result = await BestTakeAudioPlugin.startNativePlaybackTest({ url: fileURL })
    console.log('[NativeCameraTest] native playback started')
    console.log('fileURL =', result.fileURL)
    console.log('route =', result.route)
    console.log('systemVolume =', result.systemVolume)
    console.log('playerVolume =', result.playerVolume)
    return result
  } catch (error) {
    console.warn('[NativeCameraTest] playback failed', error)
    await completePlaybackRouteRestore()
    return null
  }
}

export async function stopNativeCameraTestPlayback(): Promise<void> {
  if (!isNativeCameraTestAvailable()) return
  try {
    await BestTakeAudioPlugin.stopNativePlaybackTest()
    await BestTakeAudioPlugin.stopNativeCameraTestPostProcess()
  } catch {
    /* ignore */
  }
}
