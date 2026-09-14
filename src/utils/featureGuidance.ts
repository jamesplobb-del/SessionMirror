/** First-use help has its own history; skipping Welcome does not dismiss it. */
export type FeatureGuideId = 'best-take' | 'workspace' | 'hands-free'
export type FeatureAction = 'take-saved' | 'best-take-pinned' | 'current-take-pinned'
  | 'overlays-opened' | 'overlays-closed' | 'branch-widget-selected'
  | 'hands-free-enabled' | 'hands-free-disabled' | 'hands-free-settings-opened'
  | 'hands-free-recorded' | 'take-card-transfer-completed'

export const CONFIRMATION_EVENT = 'besttake:action-confirmed'
export function confirmFeatureAction(text: string): void {
  window.dispatchEvent(new CustomEvent(CONFIRMATION_EVENT, { detail: text }))
}

export const GUIDANCE_EVENT = 'besttake:feature-action'
export const GUIDANCE_PREFERENCES_EVENT = 'besttake:feature-help-preferences'
const STORAGE_KEY = 'besttake:feature-help:v1'
export const GUIDE_COOLDOWN_MS = 45_000
export const GUIDE_EXPIRY_MS = 120_000
export const GUIDE_SESSION_LIMIT = 2

export interface GuidancePreferences { enabled: boolean; seen: FeatureGuideId[] }
let fallback: GuidancePreferences = { enabled: true, seen: [] }
const ids: FeatureGuideId[] = ['best-take', 'workspace', 'hands-free']

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
  'best-take': [
    { title: 'Keep your best take', body: 'Tap the pin to keep this take beside your next recording.',
      selector: '[data-tutorial="pin-current-as-best"]', action: 'current-take-pinned' },
    { title: 'Hear the difference', body: 'Your Best Take stays here. Record another take, then listen to each to compare.',
      selector: '[data-tutorial="best-take-box"]' },
  ],
  workspace: [
    { title: 'Choose your tools', body: 'Tap a tool to add it to your practice screen.',
      selector: '[data-guidance="workspace-tools"]', action: 'branch-widget-selected' },
    { title: 'Keep what you need', body: 'Tap a selected tool to hide it. Tap outside Workspace when you’re finished.',
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
}
export function createGuidanceState(preferences = readGuidancePreferences()): GuidanceState {
  return { preferences, active: null, pending: [], shown: 0, lastEnded: null }
}

type GuidanceUpdate =
  | { type: 'request'; id: FeatureGuideId; now: number }
  | { type: 'start'; id: FeatureGuideId; now: number }
  | { type: 'expire'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'dismiss'; now: number }
  | { type: 'learned'; id: FeatureGuideId; now: number }
  | { type: 'preferences'; preferences: GuidancePreferences; reset: boolean }

function finish(state: GuidanceState, id: FeatureGuideId, now: number): GuidanceState {
  const wasActive = state.active?.id === id
  return {
    ...state,
    preferences: { ...state.preferences, seen: [...new Set([...state.preferences.seen, id])] },
    active: wasActive ? null : state.active,
    pending: state.pending.filter(item => item.id !== id),
    lastEnded: wasActive ? now : state.lastEnded,
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
  if (update.type === 'dismiss') return state.active ? finish(state, state.active.id, update.now) : state
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
    (state.lastEnded !== null && update.now - state.lastEnded < GUIDE_COOLDOWN_MS)) return state
  const pending = state.pending.find(item => item.id === update.id && item.expires > update.now)
  if (!pending) return state
  return { ...state, active: { id: update.id, step: 0, expires: pending.expires },
    pending: state.pending.filter(item => item.id !== update.id), shown: state.shown + 1 }
}
