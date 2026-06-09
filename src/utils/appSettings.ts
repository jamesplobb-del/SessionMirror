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
  const maxLevel = 0.055
  const normalized = (t - 1) / 99
  const logMin = Math.log(minLevel)
  const logMax = Math.log(maxLevel)
  return Math.exp(logMin + normalized * (logMax - logMin))
}
