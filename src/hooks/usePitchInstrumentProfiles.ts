import { useSyncExternalStore } from 'react'
import { loadPitchInstrumentProfiles, subscribePitchInstrumentProfiles } from '../utils/pitchInstrumentProfiles'

export function usePitchInstrumentProfiles() {
  const state = useSyncExternalStore(subscribePitchInstrumentProfiles, loadPitchInstrumentProfiles, loadPitchInstrumentProfiles)
  return { ...state, activeProfile: state.profiles.find(profile => profile.id === state.activeId) ?? null }
}
