import { useSharedMetronome } from '../context/MetronomeContext'
import type { MetronomeMeter, MetronomeSubdivision } from '../utils/metronomeConfig'

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
  accentFirstBeat: boolean
  soundId: string
  playing: boolean
  beatIndex: number
  beatPulseId: number
  setBpm: (value: number) => void
  setMeter: (meter: MetronomeMeter) => void
  setSubdivision: (subdivision: MetronomeSubdivision) => void
  setAccentFirstBeat: (accentFirstBeat: boolean) => void
  setSoundId: (soundId: string) => void
  togglePlay: () => void
  stop: () => void
}

/** Shared global metronome — same engine for Audio tab, Metronome tab, and Camera widget. */
export function useMetronome(_options: UseMetronomeOptions = {}): UseMetronomeResult {
  return useSharedMetronome()
}
