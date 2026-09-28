/** First-use help has its own history; skipping Welcome does not dismiss it. */
export type FeatureGuideId = 'best-take' | 'workspace' | 'hands-free' | 'recording' | 'navigation' | 'take-library' | 'music-tools' | 'multitrack' | 'tuner-quiet' | 'tuner-loud'
export type FeatureAction = 'take-saved' | 'best-take-pinned' | 'current-take-pinned'
  | 'overlays-opened' | 'overlays-closed' | 'branch-widget-selected'
  | 'hands-free-enabled' | 'hands-free-disabled' | 'hands-free-settings-opened'
  | 'hands-free-recorded' | 'take-card-transfer-completed' | 'widget-expanded' | 'take-library-opened' | 'tuner-input-quiet' | 'tuner-input-loud'

export const CONFIRMATION_EVENT = 'besttake:action-confirmed'
export function confirmFeatureAction(text: string): void {
  window.dispatchEvent(new CustomEvent(CONFIRMATION_EVENT, { detail: text }))
}

export const GUIDANCE_EVENT = 'besttake:feature-action'
export const GUIDANCE_PREFERENCES_EVENT = 'besttake:feature-help-preferences'
const STORAGE_KEY = 'besttake:feature-help:v1'
export const GUIDE_SKIP_COOLDOWN_MS = 25_000
export const GUIDE_CONTINUE_GAP_MS = 250
export const GUIDE_EXPIRY_MS = 120_000
export const GUIDE_SESSION_LIMIT = 4

export interface GuidancePreferences { enabled: boolean; seen: FeatureGuideId[] }
let fallback: GuidancePreferences = { enabled: true, seen: [] }
const ids: FeatureGuideId[] = ['best-take', 'workspace', 'hands-free', 'recording', 'navigation', 'take-library', 'music-tools', 'multitrack', 'tuner-quiet', 'tuner-loud']

export function readGuidancePreferences(): GuidancePreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const value = JSON.parse(raw)
      fallback = {
        enabled: value.enabled !== false,
        seen: Array.isArray(value.seen) ? ids.filter(id => value.seen.includes(id)) : [],
      }
    }
  } catch { /* Keep dismissals in memory when storage is unavailable. */ }
  return { ...fallback, seen: [...fallback.seen] }
}

export function writeGuidancePreferences(preferences: GuidancePreferences): void {
  fallback = { ...preferences, seen: [...preferences.seen] }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback)) } catch { /* In-memory fallback. */ }
}

export function setFeatureTipsEnabled(enabled: boolean): void {
  writeGuidancePreferences({ ...readGuidancePreferences(), enabled })
  window.dispatchEvent(new CustomEvent(GUIDANCE_PREFERENCES_EVENT))
}

export function resetFeatureGuides(): void {
  writeGuidancePreferences({ enabled: true, seen: [] })
  window.dispatchEvent(new CustomEvent(GUIDANCE_PREFERENCES_EVENT, { detail: 'reset' }))
}

// A few existing controls already publish tutorial actions. Ignore unrelated ones.
export function reportFeatureAction(action: string): void {
  window.dispatchEvent(new CustomEvent(GUIDANCE_EVENT, { detail: action }))
}

export interface GuideStep {
  title: string
  body: string
  selector: string
  action?: FeatureAction
}
export const FEATURE_GUIDES: Record<FeatureGuideId, GuideStep[]> = {
  'tuner-quiet': [{ title: 'A little more input may help', body: 'The tuner is hearing a quiet note. Check Voice, Strings or Winds here first, then try moving closer to the mic.', selector: '[data-guidance="tuner-settings"]' }],
  'tuner-loud': [{ title: 'Give the mic a little space', body: 'The input is very loud. Move back a little, or lower the gain if you’re using an external mic.', selector: '[data-guidance="tuner-settings"]' }],
  recording: [{ title: 'One tap to record', body: 'Tap Record to start, then tap again to stop. Your take saves automatically.', selector: '[data-tutorial="record-controls"]' }],
  navigation: [{ title: 'Find your practice tools', body: 'Use these tabs for the metronome, tuner and games. Tap Compare in the bottom controls to get back to your takes.', selector: '[data-tutorial="audio-mode-tabs"]' }],
  'take-library': [{ title: 'Your recordings are here', body: 'Open the Take library to listen, rename or share a recording. Clearing a take from the screen keeps it here.', selector: '[data-guidance="take-library"]', action: 'take-library-opened' }],
  'music-tools': [{ title: 'Bring your tools onto the page', body: 'Open Workspace for Takes, References, Pitch, Metronome or Drone. The Music widget separates Read from Mark up; More options holds file controls.', selector: '[data-guidance="music-workspace"], [data-tutorial="overlays-button"]' }],
  multitrack: [{ title: 'Record a part over another', body: 'Multitrack lets you build a performance one part at a time. Use headphones to hear earlier parts as you record.', selector: '[data-tutorial="multitrack-button"]' }],
  'best-take': [
    { title: 'Your new take', body: 'Each recording appears in Current Take. Tap it to play before deciding what to keep.',
      selector: '[data-tutorial="challenger-card"]' },
    { title: 'Keep your best take', body: 'Tap the pin to keep this take beside your next recording.',
      selector: '[data-tutorial="pin-current-as-best"]', action: 'current-take-pinned' },
    { title: 'Compare and improve', body: 'Best Take stays here as you record again. Play either take to compare. In Camera, drag one take label onto the other to swap them.',
      selector: '[data-tutorial="best-take-box"]' },
  ],
  workspace: [
    { title: 'Choose your tools', body: 'Choose a tool here. Close Workspace, then tap its small circle to expand it.',
      selector: '[data-guidance="workspace-tools"]', action: 'branch-widget-selected' },
    { title: 'Tap the circle to open it', body: 'Close Workspace, then tap the tool’s circle to expand it. Drag it wherever it’s comfortable.',
      selector: '[data-guidance="workspace-tools"]', action: 'overlays-closed' },
  ],
  'hands-free': [
    { title: 'Play to record', body: 'Recording starts when you play and stops after a quiet pause. Your take then plays back.',
      selector: '[data-tutorial="record-controls"]' },
    { title: 'Set your own pace', body: 'Tap the hands-free panel to adjust the start level and quiet pause. Long-press Record to turn hands-free off.',
      selector: '[data-tutorial="record-controls"]', action: 'hands-free-settings-opened' },
  ],
}

export interface GuidanceState {
  preferences: GuidancePreferences
  active: { id: FeatureGuideId; step: number; expires: number } | null
  pending: { id: FeatureGuideId; expires: number }[]
  shown: number
  lastEnded: number | null
  lastEndDelay: number
}
export function createGuidanceState(preferences = readGuidancePreferences()): GuidanceState {
  return { preferences, active: null, pending: [], shown: 0, lastEnded: null, lastEndDelay: 0 }
}

type GuidanceUpdate =
  | { type: 'request'; id: FeatureGuideId; now: number }
  | { type: 'start'; id: FeatureGuideId; now: number }
  | { type: 'expire'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'dismiss'; now: number }
  | { type: 'learned'; id: FeatureGuideId; now: number }
  | { type: 'preferences'; preferences: GuidancePreferences; reset: boolean }

function finish(state: GuidanceState, id: FeatureGuideId, now: number, delay = GUIDE_CONTINUE_GAP_MS): GuidanceState {
  const wasActive = state.active?.id === id
  return {
    ...state,
    preferences: { ...state.preferences, seen: [...new Set([...state.preferences.seen, id])] },
    active: wasActive ? null : state.active,
    pending: state.pending.filter(item => item.id !== id),
    lastEnded: wasActive ? now : state.lastEnded,
    lastEndDelay: wasActive ? delay : state.lastEndDelay,
  }
}

export function guidanceReducer(state: GuidanceState, update: GuidanceUpdate): GuidanceState {
  if (update.type === 'preferences') {
    if (update.reset) return createGuidanceState(update.preferences)
    return { ...state, preferences: update.preferences,
      active: update.preferences.enabled ? state.active : null,
      pending: update.preferences.enabled ? state.pending : [] }
  }
  if (update.type === 'expire') {
    const pending = state.pending.filter(item => item.expires > update.now)
    return pending.length === state.pending.length ? state : { ...state, pending }
  }
  if (update.type === 'learned') return finish(state, update.id, update.now)
  if (update.type === 'dismiss') return state.active ? finish(state, state.active.id, update.now, GUIDE_SKIP_COOLDOWN_MS) : state
  if (update.type === 'advance') {
    if (!state.active) return state
    if (state.active.step + 1 >= FEATURE_GUIDES[state.active.id].length) return finish(state, state.active.id, update.now)
    return { ...state, active: { ...state.active, step: state.active.step + 1 } }
  }
  if (!state.preferences.enabled || state.preferences.seen.includes(update.id)) return state
  if (update.type === 'request') {
    if (state.active?.id === update.id || state.shown >= GUIDE_SESSION_LIMIT) return state
    return { ...state, pending: [...state.pending.filter(item => item.id !== update.id && item.expires > update.now),
      { id: update.id, expires: update.now + GUIDE_EXPIRY_MS }] }
  }
  if (state.active || state.shown >= GUIDE_SESSION_LIMIT ||
    (state.lastEnded !== null && update.now - state.lastEnded < state.lastEndDelay)) return state
  const pending = state.pending.find(item => item.id === update.id && item.expires > update.now)
  if (!pending) return state
  return { ...state, preferences: { ...state.preferences, seen: [...state.preferences.seen, update.id] }, active: { id: update.id, step: 0, expires: pending.expires },
    pending: state.pending.filter(item => item.id !== update.id), shown: state.shown + 1 }
}
