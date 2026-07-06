import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  sharedMetronomeEngine,
  type SharedMetronomeSnapshot,
} from '../metronome/sharedMetronomeEngine'
import type { MetronomeMeter, MetronomeSubdivision, MetronomeAccentLevel } from '../utils/metronomeConfig'

export interface SharedMetronomeControls {
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

export type SharedMetronomeState = SharedMetronomeSnapshot & SharedMetronomeControls

const controls: SharedMetronomeControls = {
  setBpm: sharedMetronomeEngine.setBpm,
  setMeter: sharedMetronomeEngine.setMeter,
  setSubdivision: sharedMetronomeEngine.setSubdivision,
  setFeel: sharedMetronomeEngine.setFeel,
  setPulseMode: sharedMetronomeEngine.setPulseMode,
  setAccentLevels: sharedMetronomeEngine.setAccentLevels,
  setAccentPattern: sharedMetronomeEngine.setAccentPattern,
  toggleBeatAccent: sharedMetronomeEngine.toggleBeatAccent,
  setAccentFirstBeat: sharedMetronomeEngine.setAccentFirstBeat,
  setSoundId: sharedMetronomeEngine.setSoundId,
  togglePlay: sharedMetronomeEngine.togglePlay,
  stop: sharedMetronomeEngine.stop,
}

const MetronomeContext = createContext(false)

interface MetronomeProviderProps {
  children: ReactNode
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
}

export function MetronomeProvider({
  children,
  isTakePlaying = false,
  muteDuringPlayback = true,
}: MetronomeProviderProps) {
  useEffect(() => {
    sharedMetronomeEngine.attachLifecycle()
  }, [])

  useEffect(() => {
    sharedMetronomeEngine.setPlaybackMutePolicy(isTakePlaying, muteDuringPlayback)
  }, [isTakePlaying, muteDuringPlayback])

  return <MetronomeContext.Provider value={true}>{children}</MetronomeContext.Provider>
}

export function useSharedMetronome(): SharedMetronomeState {
  const mounted = useContext(MetronomeContext)
  if (!mounted) {
    throw new Error('useSharedMetronome must be used within MetronomeProvider')
  }

  const snapshot = useSyncExternalStore(
    sharedMetronomeEngine.subscribe,
    sharedMetronomeEngine.getSnapshot,
    sharedMetronomeEngine.getSnapshot,
  )

  return {
    ...snapshot,
    ...controls,
  }
}
