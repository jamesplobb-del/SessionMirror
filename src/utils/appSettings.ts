export interface AppSettings {
  /** Audio mode: auto-start/stop recording from mic levels. */
  autoSoundRecording: boolean
  /** Seconds of silence before auto-stop (0.5–6). */
  soundSilenceSeconds: number
  /** Loudness required to start (1 = sensitive, 100 = loud only). */
  soundVolumeThreshold: number
  /** Short vibration on long-press drag arm. */
  hapticFeedback: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSoundRecording: false,
  soundSilenceSeconds: 2,
  soundVolumeThreshold: 20,
  hapticFeedback: true,
}

const STORAGE_KEY = 'sessionmirror:settings'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APP_SETTINGS }

    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
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
    }
  } catch {
    return { ...DEFAULT_APP_SETTINGS }
  }
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
  /** Peak weight in combined gate level (loud mode uses higher for brass). */
  peakWeight?: number
}

/** Per-slider detection profile — loud mode rejects peak-only spikes; sensitive mode triggers fast. */
export function getAutoRecordProfile(sliderValue: number): AutoRecordProfile {
  const gate = volumeThresholdToLevel(sliderValue)
  const t = clamp(sliderValue, 1, 100)

  if (t >= 75) {
    return {
      gate,
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
      gate,
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
    gate,
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
