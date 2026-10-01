import { safeRandomUUID } from './uuid'
import { TUNER_TRANSPOSITION_OPTIONS, getTunerKeyOption, type TunerTranspositionId } from './tunerTransposition'
import type { PitchObservation } from '../db/pitchInsightsRepository'

const STORAGE_KEY = 'besttake:pitch-instrument-profiles:v1'
export const PITCH_PROFILES_CHANGED = 'besttake:pitch-instrument-profiles-changed'
export interface PitchInstrumentProfile { id: string; name: string; transpositionId: TunerTranspositionId }
export interface PitchProfilesState { profiles: PitchInstrumentProfile[]; activeId: string | null }
const empty: PitchProfilesState = { profiles: [], activeId: null }
let cachedRaw: string | null | undefined
let cachedState = empty

export function loadPitchInstrumentProfiles(): PitchProfilesState {
  let raw: string | null
  try { raw = localStorage.getItem(STORAGE_KEY) } catch { return cachedState }
  if (raw === cachedRaw) return cachedState
  cachedRaw = raw
  try {
    const parsed = JSON.parse(raw ?? 'null')
    const seen = new Set<string>()
    const profiles: PitchInstrumentProfile[] = Array.isArray(parsed?.profiles) ? parsed.profiles.filter((profile: PitchInstrumentProfile) => {
      if (!profile || typeof profile.id !== 'string' || !profile.id || seen.has(profile.id) ||
        typeof profile.name !== 'string' || !profile.name.trim() ||
        !TUNER_TRANSPOSITION_OPTIONS.some(option => option.id === profile.transpositionId)) return false
      seen.add(profile.id); return true
    }).map((profile: PitchInstrumentProfile) => ({ id: profile.id, name: profile.name.trim().slice(0, 60), transpositionId: profile.transpositionId })) : []
    cachedState = { profiles, activeId: profiles.some(profile => profile.id === parsed?.activeId) ? parsed.activeId : null }
  } catch { cachedState = empty }
  return cachedState
}

function persist(state: PitchProfilesState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PITCH_PROFILES_CHANGED))
}
export function createPitchInstrumentProfile(name: string, transpositionId: TunerTranspositionId): PitchInstrumentProfile {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) throw new Error('Give this instrument a name.')
  if (!TUNER_TRANSPOSITION_OPTIONS.some(option => option.id === transpositionId)) throw new Error('Choose an instrument key.')
  const profile = { id: safeRandomUUID(), name: trimmed, transpositionId }
  const state = loadPitchInstrumentProfiles()
  persist({ profiles: [...state.profiles, profile], activeId: profile.id })
  return profile
}
export function selectPitchInstrumentProfile(id: string | null): void {
  const state = loadPitchInstrumentProfiles()
  if (id && !state.profiles.some(profile => profile.id === id)) throw new Error('This instrument profile is unavailable.')
  persist({ ...state, activeId: id })
}
/** Persist deselection before changing the key; a failed write leaves capture intact. */
export function changePitchInstrumentKey(key: TunerTranspositionId, persistKey?: (key: TunerTranspositionId) => void, currentDefaultKey?: TunerTranspositionId): void {
  const state = loadPitchInstrumentProfiles()
  const activeProfile = state.profiles.find(profile => profile.id === state.activeId)
  if (activeProfile && key === activeProfile.transpositionId) return
  if (!activeProfile && key === currentDefaultKey) return
  if (activeProfile) selectPitchInstrumentProfile(null)
  persistKey?.(key)
}
export function subscribePitchInstrumentProfiles(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(PITCH_PROFILES_CHANGED, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(PITCH_PROFILES_CHANGED, listener); window.removeEventListener('storage', listener) }
}
export const pitchSourceId = (profileId: string | null | undefined, key: string): string => JSON.stringify([profileId ?? null, key])
export function filterPitchProfileObservations(observations: PitchObservation[], sourceId: string): PitchObservation[] {
  return observations.filter(observation => pitchSourceId(observation.instrumentProfileId, observation.transpositionId) === sourceId)
}
export function pitchProfileSources(profiles: PitchInstrumentProfile[], observations: PitchObservation[], defaultKey: TunerTranspositionId) {
  const sources = new Map<string, { id: string; profileId: string | null; transpositionId: TunerTranspositionId; label: string }>()
  const add = (profileId: string | null, name: string, key: TunerTranspositionId) => {
    const id = pitchSourceId(profileId, key)
    if (!sources.has(id)) sources.set(id, { id, profileId, transpositionId: key, label: `${name} · ${getTunerKeyOption(key).keyLabel}` })
  }
  add(null, 'Legacy/default', defaultKey)
  profiles.forEach(profile => add(profile.id, profile.name, profile.transpositionId))
  observations.forEach(observation => add(observation.instrumentProfileId ?? null, observation.instrumentProfileId ? observation.instrumentProfileName ?? 'Instrument' : 'Legacy/default', observation.transpositionId as TunerTranspositionId))
  return [...sources.values()]
}
