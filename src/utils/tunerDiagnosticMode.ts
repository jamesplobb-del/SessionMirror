// Opt-in investigation build only. Normal builds ignore even a saved test mode.
// No optional chaining: Vite only substitutes the literal `import.meta.env.VITE_*`
// form, so `import.meta.env?.` left this as a runtime check and shipped the whole
// diagnostic UI — strings, modes and picker — into release builds.
export const TUNER_DIAGNOSTICS_ENABLED = import.meta.env.VITE_TUNER_DIAGNOSTICS === '1'
export const TUNER_DIAGNOSTIC_MODES = ['normal', 'static-background', 'no-graph', 'no-insights', 'view-off'] as const
export type TunerDiagnosticMode = typeof TUNER_DIAGNOSTIC_MODES[number]
const STORAGE_KEY = 'besttake.tuner-diagnostic-mode.v1'

function readSavedMode(): TunerDiagnosticMode {
  if (!TUNER_DIAGNOSTICS_ENABLED) return 'normal'
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return TUNER_DIAGNOSTIC_MODES.find(mode => mode === value) ?? 'normal'
  } catch { return 'normal' }
}

let currentMode = readSavedMode()
export function getTunerDiagnosticMode(): TunerDiagnosticMode { return currentMode }

export function setTunerDiagnosticMode(mode: TunerDiagnosticMode) {
  if (!TUNER_DIAGNOSTICS_ENABLED) return
  currentMode = mode
  try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* storage may be unavailable */ }
}

export function isTunerDiagnosticMode(mode: TunerDiagnosticMode) {
  return TUNER_DIAGNOSTICS_ENABLED && getTunerDiagnosticMode() === mode
}
