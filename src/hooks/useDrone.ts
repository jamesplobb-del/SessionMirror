import { useCallback, useEffect, useRef, useState } from 'react'
import {
  droneGetState,
  droneRestoreState,
  droneSetOctave,
  droneSetVolume,
  droneSetWaveform,
  droneStop,
  droneToggleNote,
  isDroneNativeAvailable,
  type DroneWaveform,
} from '../utils/droneEngine'
import { loadDronePrefs, saveDronePrefs, type DronePrefs } from '../utils/dronePrefs'
import { triggerLightHaptic } from '../utils/haptics'

export interface UseDroneOptions {
  volume: number
  waveform: DroneWaveform
  hapticFeedback?: boolean
}

export interface UseDroneResult {
  activeNotes: number[]
  octave: number
  enabled: boolean
  nativeAvailable: boolean
  toggleNote: (pitchClass: number) => void
  incrementOctave: () => void
  decrementOctave: () => void
}

export function useDrone({
  volume,
  waveform,
  hapticFeedback = true,
}: UseDroneOptions): UseDroneResult {
  const [prefs, setPrefs] = useState<DronePrefs>(() => loadDronePrefs())
  const restoredRef = useRef(false)

  useEffect(() => {
    if (!isDroneNativeAvailable() || restoredRef.current) return
    restoredRef.current = true
    const saved = loadDronePrefs()
    void droneRestoreState({
      activeNotes: saved.activeNotes,
      octave: saved.octave,
      volume,
      waveform,
    }).then((state) => {
      const next: DronePrefs = {
        activeNotes: state.activeNotes,
        octave: state.octave,
        enabled: state.enabled,
        volume: state.volume,
        waveform: state.waveform,
      }
      setPrefs(next)
      saveDronePrefs(next)
    })
  }, [volume, waveform])

  useEffect(() => {
    if (!isDroneNativeAvailable()) return
    void droneSetVolume(volume)
    setPrefs((current) => {
      const next = { ...current, volume }
      saveDronePrefs(next)
      return next
    })
  }, [volume])

  useEffect(() => {
    if (!isDroneNativeAvailable()) return
    void droneSetWaveform(waveform)
    setPrefs((current) => {
      const next = { ...current, waveform }
      saveDronePrefs(next)
      return next
    })
  }, [waveform])

  const syncFromNative = useCallback(async () => {
    if (!isDroneNativeAvailable()) return
    const state = await droneGetState()
    setPrefs((current) => {
      const next: DronePrefs = {
        ...current,
        activeNotes: state.activeNotes,
        octave: state.octave,
        enabled: state.enabled,
        volume: state.volume,
        waveform: state.waveform,
      }
      saveDronePrefs(next)
      return next
    })
  }, [])

  const toggleNote = useCallback(
    (pitchClass: number) => {
      void triggerLightHaptic(hapticFeedback)
      if (!isDroneNativeAvailable()) {
        setPrefs((current) => {
          const has = current.activeNotes.includes(pitchClass)
          const activeNotes = has
            ? current.activeNotes.filter((note) => note !== pitchClass)
            : [...current.activeNotes, pitchClass].sort((a, b) => a - b)
          const next = { ...current, activeNotes, enabled: activeNotes.length > 0 }
          saveDronePrefs(next)
          return next
        })
        return
      }

      void droneToggleNote(pitchClass)
        .then((result) => {
          setPrefs((current) => {
            const next: DronePrefs = {
              ...current,
              activeNotes: result.activeNotes,
              octave: result.octave,
              enabled: result.enabled,
              volume: result.volume,
              waveform: result.waveform,
            }
            saveDronePrefs(next)
            return next
          })
        })
        .catch(() => {
          void syncFromNative()
        })
    },
    [hapticFeedback, syncFromNative],
  )

  const setOctave = useCallback(
    (octave: number) => {
      const clamped = Math.min(8, Math.max(0, octave))
      if (!isDroneNativeAvailable()) {
        setPrefs((current) => {
          const next = { ...current, octave: clamped }
          saveDronePrefs(next)
          return next
        })
        return
      }

      void droneSetOctave(clamped).then((state) => {
        setPrefs((current) => {
          const next: DronePrefs = {
            ...current,
            activeNotes: state.activeNotes,
            octave: state.octave,
            enabled: state.enabled,
          }
          saveDronePrefs(next)
          return next
        })
      })
    },
    [],
  )

  const incrementOctave = useCallback(() => {
    setPrefs((current) => {
      if (current.octave >= 8) return current
      void setOctave(current.octave + 1)
      return { ...current, octave: current.octave + 1 }
    })
  }, [setOctave])

  const decrementOctave = useCallback(() => {
    setPrefs((current) => {
      if (current.octave <= 0) return current
      void setOctave(current.octave - 1)
      return { ...current, octave: current.octave - 1 }
    })
  }, [setOctave])

  useEffect(() => {
    return () => {
      if (!isDroneNativeAvailable()) return
      void droneStop().then((state) => {
        const next: DronePrefs = {
          activeNotes: state.activeNotes,
          octave: state.octave,
          enabled: state.enabled,
          volume: state.volume,
          waveform: state.waveform,
        }
        saveDronePrefs(next)
      })
    }
  }, [])

  return {
    activeNotes: prefs.activeNotes,
    octave: prefs.octave,
    enabled: prefs.enabled,
    nativeAvailable: isDroneNativeAvailable(),
    toggleNote,
    incrementOctave,
    decrementOctave,
  }
}
