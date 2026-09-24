const STORAGE_KEY = 'besttake:pitch-insights-ensemble-mode'

export function loadEnsemblePitchMode(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true' }
  catch { return false }
}

export function saveEnsemblePitchMode(enabled: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(enabled)) }
  catch { /* Private browsing can make storage unavailable. */ }
}
