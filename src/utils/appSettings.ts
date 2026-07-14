import type { TunerInstrument } from './pitchConfig'
import type { DroneWaveform } from './droneEngine'
import {
  DEFAULT_AUDIO_ENHANCER_SETTINGS,
  parseAudioEnhancerSettings,
  type AudioEnhancerSettings,
} from './audioEnhancer'
import {
  parseSpeakerLoudnessPreset,
  type SpeakerLoudnessPreset,
} from './speakerLoudnessMastering'
import { parseCaptureProfile, type CaptureProfile } from './audioCapture'

export type MicInputPreference = 'auto' | 'headphone' | 'iphone'

export interface AppSettings {
  /** App appearance: use dark materials where the UI is not camera-backed. */
  darkMode: boolean
  /** Audio mode: auto-start/stop recording from mic levels. */
  autoSoundRecording: boolean
  /** Seconds of silence before auto-stop (0.5–6). */
  soundSilenceSeconds: number
  /** Loudness required to start (1 = sensitive, 100 = loud only). */
  soundVolumeThreshold: number
  /** Short vibration on long-press drag arm. */
  hapticFeedback: boolean
  /** Audio mode playback: show live A440 pitch tracker instead of a blank screen. */
  pitchTrackerEnabled: boolean
  /** Audio mode idle: listen to the mic for a live tuner when playback is paused. */
  liveMicTunerEnabled: boolean
  /** Pitch detection profile — voice, strings, or winds. */
  tunerInstrument: TunerInstrument
  /** Reference drone output level (0–100). */
  droneVolume: number
  /** Reference drone waveform timbre. */
  droneWaveform: DroneWaveform
  /** Show Best Take and Current Take cards on the main HUD. */
  showTakeCards: boolean
  /** Floating metronome widget on the main camera/audio HUD. */
  showMetronome: boolean
  /** Silence metronome clicks while a take is playing; internal clock keeps running. */
  muteMetronomeDuringPlayback: boolean
  /** Scale factor for Best Take / Current Take cards (85–125). */
  takeCardScale: number
  /** Dolby On-style playback enhancer (EQ, compression, reverb). */
  audioEnhancerEnabled: boolean
  /** iOS-only AVAudioSession path for native input/output routing. */
  nativeExperimentalAudioEnabled: boolean
  /** Persisted enhancer preset and slider values. */
  audioEnhancerSettings: AudioEnhancerSettings
  /** Speaker-only loudness mastering preset for built-in iPhone speakers. */
  speakerLoudnessPreset: SpeakerLoudnessPreset
  /** Pause YouTube and enable mic echo cancellation while recording to reduce bleed. */
  excludeYoutubeFromRecording: boolean
  /** Native iOS mic input preference when headphones are connected. */
  micInputPreference: MicInputPreference
  /** Mic capture profile — Natural preserves prior behavior; Loud Camera-like enables AGC. */
  captureProfile: CaptureProfile
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  darkMode: false,
  autoSoundRecording: false,
  soundSilenceSeconds: 2,
  soundVolumeThreshold: 20,
  hapticFeedback: true,
  pitchTrackerEnabled: false,
  liveMicTunerEnabled: true,
  tunerInstrument: 'voice',
  droneVolume: 75,
  droneWaveform: 'sine',
  showTakeCards: true,
  showMetronome: false,
  muteMetronomeDuringPlayback: true,
  takeCardScale: 105,
  audioEnhancerEnabled: false,
  nativeExperimentalAudioEnabled: true,
  audioEnhancerSettings: { ...DEFAULT_AUDIO_ENHANCER_SETTINGS },
  speakerLoudnessPreset: 'phone',
  excludeYoutubeFromRecording: false,
  micInputPreference: 'iphone',
  captureProfile: 'natural',
}

/** Transient recording controls and floating widgets — forced off on each cold app start. */
const SESSION_START_TRANSIENT_OFF: Pick<AppSettings, 'autoSoundRecording' | 'pitchTrackerEnabled' | 'showMetronome'> = {
  autoSoundRecording: false,
  pitchTrackerEnabled: false,
  showMetronome: false,
}

function parseDroneWaveform(value: unknown): DroneWaveform {
  if (value === 'triangle' || value === 'organ' || value === 'warmSynth') return value
  return DEFAULT_APP_SETTINGS.droneWaveform
}

function parseTunerInstrument(value: unknown): TunerInstrument {
  if (value === 'brass') return 'winds'
  if (value === 'strings' || value === 'winds' || value === 'voice') {
    return value
  }
  return DEFAULT_APP_SETTINGS.tunerInstrument
}

function parseMicInputPreference(
  value: unknown,
  legacyUseIphoneMic?: unknown,
): MicInputPreference {
  if (value === 'iphone') {
    return value
  }
  if (value === 'auto' || value === 'headphone') return 'headphone'
  if (legacyUseIphoneMic === true) return 'iphone'
  return 'headphone'
}

const STORAGE_KEY = 'sessionmirror:settings'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS }

    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      useIphoneMicForRecording?: boolean
    }
    return {
      darkMode:
        parsed.darkMode !== undefined
          ? Boolean(parsed.darkMode)
          : DEFAULT_APP_SETTINGS.darkMode,
      autoSoundRecording: Boolean(parsed.autoSoundRecording),
      soundSilenceSeconds: clamp(
        Number(parsed.soundSilenceSeconds) || DEFAULT_APP_SETTINGS.soundSilenceSeconds,
        0.5,
        6,
      ),
      soundVolumeThreshold: clamp(
        Number(parsed.soundVolumeThreshold) || DEFAULT_APP_SETTINGS.soundVolumeThreshold,
        1,
        100,
      ),
      hapticFeedback:
        parsed.hapticFeedback !== undefined
          ? Boolean(parsed.hapticFeedback)
          : DEFAULT_APP_SETTINGS.hapticFeedback,
      pitchTrackerEnabled:
        parsed.pitchTrackerEnabled !== undefined
          ? Boolean(parsed.pitchTrackerEnabled)
          : DEFAULT_APP_SETTINGS.pitchTrackerEnabled,
      liveMicTunerEnabled:
        parsed.liveMicTunerEnabled !== undefined
          ? Boolean(parsed.liveMicTunerEnabled)
          : DEFAULT_APP_SETTINGS.liveMicTunerEnabled,
      tunerInstrument: parseTunerInstrument(parsed.tunerInstrument),
      droneVolume:
        parsed.droneVolume === undefined || Number(parsed.droneVolume) <= 55
          ? DEFAULT_APP_SETTINGS.droneVolume
          : clamp(Number(parsed.droneVolume) || DEFAULT_APP_SETTINGS.droneVolume, 0, 100),
      droneWaveform: parseDroneWaveform(parsed.droneWaveform),
      showTakeCards:
        parsed.showTakeCards !== undefined
          ? Boolean(parsed.showTakeCards)
          : DEFAULT_APP_SETTINGS.showTakeCards,
      showMetronome:
        parsed.showMetronome !== undefined
          ? Boolean(parsed.showMetronome)
          : DEFAULT_APP_SETTINGS.showMetronome,
      muteMetronomeDuringPlayback:
        parsed.muteMetronomeDuringPlayback !== undefined
          ? Boolean(parsed.muteMetronomeDuringPlayback)
          : DEFAULT_APP_SETTINGS.muteMetronomeDuringPlayback,
      takeCardScale: clamp(
        Number(parsed.takeCardScale) || DEFAULT_APP_SETTINGS.takeCardScale,
        85,
        125,
      ),
      audioEnhancerEnabled:
        parsed.audioEnhancerEnabled !== undefined
          ? Boolean(parsed.audioEnhancerEnabled)
          : DEFAULT_APP_SETTINGS.audioEnhancerEnabled,
      nativeExperimentalAudioEnabled: true,
      audioEnhancerSettings: parseAudioEnhancerSettings(
        parsed.audioEnhancerSettings ?? DEFAULT_APP_SETTINGS.audioEnhancerSettings,
      ),
      speakerLoudnessPreset:
        parsed.speakerLoudnessPreset === undefined || parsed.speakerLoudnessPreset === 'loud'
          ? DEFAULT_APP_SETTINGS.speakerLoudnessPreset
          : parseSpeakerLoudnessPreset(parsed.speakerLoudnessPreset),
      excludeYoutubeFromRecording:
        parsed.excludeYoutubeFromRecording !== undefined
          ? Boolean(parsed.excludeYoutubeFromRecording)
          : DEFAULT_APP_SETTINGS.excludeYoutubeFromRecording,
      micInputPreference: parseMicInputPreference(
        parsed.micInputPreference,
        parsed.useIphoneMicForRecording,
      ),
      captureProfile: parseCaptureProfile(
        parsed.captureProfile ?? DEFAULT_APP_SETTINGS.captureProfile,
      ),
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
}

/** Load persisted prefs but start with floating widgets hidden. */
export function loadAppSettingsForSessionStart(): AppSettings {
  const loaded = loadAppSettings()
  const sessionStart = { ...loaded, ...SESSION_START_TRANSIENT_OFF }
  saveAppSettings(sessionStart)
  return sessionStart
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Map slider 1–100 to RMS gate (lower slider = more sensitive). Log scale — most usable range on the left. */
export function volumeThresholdToLevel(sliderValue: number): number {
  const t = clamp(sliderValue, 1, 100)
  const minLevel = 0.0006
  const maxLevel = 0.042
  const normalized = (t - 1) / 99
  const logMin = Math.log(minLevel)
  const logMax = Math.log(maxLevel)
  return Math.exp(logMin + normalized * (logMax - logMin))
}

export interface AutoRecordProfile {
  /** User-configured minimum loudness (RMS scale). */
  gate: number
  /** Peak contributes to start detection — disabled for loud-only mode. */
  usePeak: boolean
  /** Sustained-above-gate hold before starting (ms). */
  holdMs: number
  /** Fast attack path hold when peak clearly exceeds gate (ms). 0 = disabled. */
  attackHoldMs: number
  /** Multiplier over tracked ambient noise floor. */
  noiseHeadroom: number
  /** Absolute floor added above ambient noise. */
  noiseMargin: number
  /** Peak must exceed effective gate by this factor for attack path. */
  attackPeakRatio: number
  /** Cap adaptive gate relative to user gate — prevents runaway sensitivity loss. */
  gateCapMultiplier: number
  /** Silence stop threshold as fraction of user gate. */
  stopGateRatio: number
  /** Peak weight in combined gate level (loud mode uses higher for piercing attacks). */
  peakWeight?: number
}

/** Per-slider detection profile — loud mode rejects peak-only spikes; sensitive mode triggers fast. */
export function getAutoRecordProfile(sliderValue: number): AutoRecordProfile {
  const baseGate = volumeThresholdToLevel(sliderValue)
  const t = clamp(sliderValue, 1, 100)

  // Keep this boundary aligned with the Settings label ("Loud only" at 70+).
  // A small lift prevents the loud preset from starting on borderline room noise
  // or an isolated transient while retaining the same silence-stop behavior.
  if (t >= 70) {
    return {
      gate: baseGate * 1.12,
      usePeak: true,
      holdMs: 36,
      attackHoldMs: 14,
      noiseHeadroom: 1.45,
      noiseMargin: 0.00008,
      attackPeakRatio: 1.35,
      gateCapMultiplier: 1.55,
      stopGateRatio: 0.4,
      peakWeight: 0.58,
    }
  }

  if (t <= 25) {
    return {
      gate: baseGate,
      usePeak: true,
      holdMs: 24,
      attackHoldMs: 12,
      noiseHeadroom: 1.8,
      noiseMargin: 0.0001,
      attackPeakRatio: 1.6,
      gateCapMultiplier: 4,
      stopGateRatio: 0.38,
    }
  }

  return {
    gate: baseGate,
    usePeak: true,
    holdMs: 36,
    attackHoldMs: 16,
    noiseHeadroom: 2,
    noiseMargin: 0.0002,
    attackPeakRatio: 1.75,
    gateCapMultiplier: 3,
    stopGateRatio: 0.42,
  }
}
