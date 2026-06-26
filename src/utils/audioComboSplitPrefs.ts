const STORAGE_KEY = 'sessionmirror.audioComboSplit.v1'

export interface AudioComboSplitPrefs {
  tunerRatio: number
  takesRatio: number
}

const DEFAULT_PREFS: AudioComboSplitPrefs = {
  tunerRatio: 40,
  takesRatio: 30,
}

export const COMBO_TUNER_MIN_RATIO = 18
export const COMBO_TUNER_MAX_RATIO = 52
export const COMBO_TAKES_MIN_RATIO = 22
export const COMBO_TAKES_MAX_RATIO = 42
export const COMBO_MIDDLE_MIN_RATIO = 14

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function normalizeAudioComboSplit(prefs: AudioComboSplitPrefs): AudioComboSplitPrefs {
  const tunerRatio = clamp(prefs.tunerRatio, COMBO_TUNER_MIN_RATIO, COMBO_TUNER_MAX_RATIO)
  let takesRatio = clamp(prefs.takesRatio, COMBO_TAKES_MIN_RATIO, COMBO_TAKES_MAX_RATIO)
  const middle = 100 - tunerRatio - takesRatio
  if (middle < COMBO_MIDDLE_MIN_RATIO) {
    takesRatio = clamp(100 - tunerRatio - COMBO_MIDDLE_MIN_RATIO, COMBO_TAKES_MIN_RATIO, COMBO_TAKES_MAX_RATIO)
  }
  return { tunerRatio, takesRatio }
}

export function loadAudioComboSplitPrefs(): AudioComboSplitPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<AudioComboSplitPrefs>
    return normalizeAudioComboSplit({
      tunerRatio: parsed.tunerRatio ?? DEFAULT_PREFS.tunerRatio,
      takesRatio: parsed.takesRatio ?? DEFAULT_PREFS.takesRatio,
    })
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveAudioComboSplitPrefs(prefs: AudioComboSplitPrefs): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeAudioComboSplit(prefs)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}
