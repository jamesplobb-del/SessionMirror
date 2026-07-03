import { useSharedMetronome } from '../context/MetronomeContext'
import {
  accentLevelsToLegacyPattern,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

export interface UseMetronomeOptions {
  /** @deprecated Playback mute policy is set on MetronomeProvider. */
  isTakePlaying?: boolean
  /** @deprecated Playback mute policy is set on MetronomeProvider. */
  muteDuringPlayback?: boolean
  /** @deprecated Use shared engine logs ([SharedMetronome]). */
  debugLabel?: string
  /** @deprecated Lifecycle is handled globally by the shared engine. */
  pauseOnAppHidden?: boolean
}

export interface UseMetronomeResult {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  feelId?: string
  pulseModeId: string
  pulseCount: number
  compound: boolean
  bpmSymbol: string
  pulseName: string
  accentLevels: MetronomeAccentLevel[]
  accentPattern: boolean[]
  accentFirstBeat: boolean
  soundId: string
  playing: boolean
  beatIndex: number
  subTickIndex: number
  beatPulseId: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  setSubdivision: (subdivision: MetronomeSubdivision) => void
  setFeel: (feelId: string) => void
  setPulseMode: (pulseModeId: string) => void
  setAccentLevels: (accentLevels: MetronomeAccentLevel[]) => void
  setAccentPattern: (accentPattern: boolean[]) => void
  toggleBeatAccent: (beatIndex: number) => void
  setAccentFirstBeat: (accentFirstBeat: boolean) => void
  setSoundId: (soundId: string) => void
  togglePlay: () => void
  stop: () => void
}

/** Shared global metronome — same engine for Audio tab, Metronome tab, and Camera widget. */
export function useMetronome(_options: UseMetronomeOptions = {}): UseMetronomeResult {
  const state = useSharedMetronome()
  return {
    ...state,
    accentPattern: accentLevelsToLegacyPattern(state.accentLevels),
    accentFirstBeat: state.accentLevels[0] !== 'weak',
  }
}
