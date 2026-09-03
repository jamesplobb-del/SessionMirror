import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  droneGetState,
  droneRestoreState,
  droneSetOctave,
  droneSetVolume,
  droneSetWaveform,
  droneSoloNote,
  droneStart,
  droneStop,
  droneToggleNote,
  isDroneNativeAvailable,
  type DroneState,
  type DroneWaveform,
} from '../utils/droneEngine'
import { APP_INTERACTIVE_MEDIA_RECOVERY_EVENT } from '../utils/appForeground'
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
  /** Last pitch class held — what the desk widget reopens on. */
  lastPitchClass: number | null
  nativeAvailable: boolean
  toggleNote: (pitchClass: number) => void
  soloNote: (pitchClass: number) => void
  glissNote: (pitchClass: number, octave: number) => void
  setNotes: (pitchClasses: number[]) => void
  /** Silence the drone but keep its note so it can be brought straight back. */
  silence: () => void
  incrementOctave: () => void
  decrementOctave: () => void
}

/*
 * One drone for the whole app.
 *
 * The native engine is a singleton, so the state that mirrors it has to be
 * one as well. Before this the Tuner tab and anything else that wanted a
 * drone each held a private copy, and whichever unmounted first silenced the
 * other. Now every subscriber reads the same store; the engine is only
 * stopped when the last subscriber leaves. That is what lets a drone started
 * on the Tuner tab keep sounding under the desk widget on Camera.
 */

let prefs: DronePrefs = loadDronePrefs()
const listeners = new Set<() => void>()
let subscriberCount = 0
let commandSequence = 0
let restored = false
let recoveryListenerAttached = false
let pendingStopTimer: number | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function commit(next: DronePrefs, persist = true): void {
  prefs = next
  if (persist) saveDronePrefs(next)
  emit()
}

function fromNative(state: DroneState, base: DronePrefs = prefs): DronePrefs {
  return {
    ...base,
    activeNotes: state.activeNotes,
    octave: state.octave,
    enabled: state.enabled,
    volume: state.volume,
    waveform: state.waveform,
    lastPitchClass: state.activeNotes[0] ?? base.lastPitchClass,
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): DronePrefs {
  return prefs
}

async function syncFromNative(): Promise<void> {
  if (!isDroneNativeAvailable()) return
  const state = await droneGetState()
  commit(fromNative(state))
}

function runNative<T extends DroneState>(
  optimistic: DronePrefs,
  command: () => Promise<T>,
): void {
  const sequence = ++commandSequence
  commit(optimistic, !isDroneNativeAvailable())
  if (!isDroneNativeAvailable()) return
  void command()
    .then((state) => {
      if (sequence !== commandSequence) return
      commit(fromNative(state))
    })
    .catch(() => {
      if (sequence === commandSequence) void syncFromNative()
    })
}

function toggleNote(pitchClass: number, hapticFeedback: boolean): void {
  void triggerLightHaptic(hapticFeedback)
  const has = prefs.activeNotes.includes(pitchClass)
  const activeNotes = has
    ? prefs.activeNotes.filter((note) => note !== pitchClass)
    : [...prefs.activeNotes, pitchClass].sort((a, b) => a - b)
  runNative(
    {
      ...prefs,
      activeNotes,
      enabled: activeNotes.length > 0,
      lastPitchClass: has ? prefs.lastPitchClass : pitchClass,
    },
    () => droneToggleNote(pitchClass),
  )
}

function soloNote(pitchClass: number): void {
  runNative(
    { ...prefs, activeNotes: [pitchClass], enabled: true, lastPitchClass: pitchClass },
    () => droneSoloNote(pitchClass),
  )
}

function glissNote(pitchClass: number, octave: number): void {
  const clampedOctave = Math.min(8, Math.max(0, Math.round(octave)))
  runNative(
    {
      ...prefs,
      activeNotes: [pitchClass],
      octave: clampedOctave,
      enabled: true,
      lastPitchClass: pitchClass,
    },
    () => droneSoloNote(pitchClass, clampedOctave),
  )
}

function setNotes(pitchClasses: number[], hapticFeedback: boolean): void {
  const activeNotes = Array.from(
    new Set(pitchClasses.filter((note) => Number.isInteger(note) && note >= 0 && note <= 11)),
  ).sort((a, b) => a - b)
  void triggerLightHaptic(hapticFeedback)
  const snapshot = prefs
  runNative(
    {
      ...snapshot,
      activeNotes,
      enabled: activeNotes.length > 0,
      lastPitchClass: activeNotes[0] ?? snapshot.lastPitchClass,
    },
    () =>
      droneRestoreState({
        activeNotes,
        octave: snapshot.octave,
        volume: snapshot.volume,
        waveform: snapshot.waveform,
      }),
  )
}

function silence(): void {
  if (prefs.activeNotes.length === 0 && !prefs.enabled) return
  runNative({ ...prefs, activeNotes: [], enabled: false }, () => droneStop())
}

function setOctave(octave: number): void {
  const clamped = Math.min(8, Math.max(0, octave))
  runNative({ ...prefs, octave: clamped }, () => droneSetOctave(clamped))
}

function stepOctave(delta: 1 | -1, hapticFeedback: boolean): void {
  const next = prefs.octave + delta
  if (next < 0 || next > 8) return
  void triggerLightHaptic(hapticFeedback)
  setOctave(next)
}

function attachRecoveryListener(): void {
  if (recoveryListenerAttached || typeof window === 'undefined') return
  recoveryListenerAttached = true
  window.addEventListener(APP_INTERACTIVE_MEDIA_RECOVERY_EVENT, () => {
    if (!isDroneNativeAvailable() || prefs.activeNotes.length === 0) return
    void droneStart()
      .then(() => syncFromNative())
      .catch(() => {})
  })
}

function restoreOnce(volume: number, waveform: DroneWaveform): void {
  if (restored || !isDroneNativeAvailable()) return
  restored = true
  const saved = loadDronePrefs()
  void droneRestoreState({
    activeNotes: [],
    octave: saved.octave,
    volume,
    waveform,
  }).then((state) => {
    commit(fromNative(state, { ...prefs, lastPitchClass: saved.lastPitchClass }))
  })
}

function retain(): void {
  subscriberCount += 1
  // A drone started in the Tuner tab has to survive the crossing to Camera:
  // the tab unmounts a beat before the desk widget mounts, and stopping on
  // that gap would cut the pitch the player is tuning to.
  if (pendingStopTimer !== null) {
    window.clearTimeout(pendingStopTimer)
    pendingStopTimer = null
  }
  attachRecoveryListener()
}

function release(): void {
  subscriberCount = Math.max(0, subscriberCount - 1)
  if (subscriberCount > 0 || !isDroneNativeAvailable()) return
  if (pendingStopTimer !== null) window.clearTimeout(pendingStopTimer)
  // Nothing on screen can show the drone any more — stop it, unless another
  // surface picks it up within the handoff window.
  pendingStopTimer = window.setTimeout(() => {
    pendingStopTimer = null
    if (subscriberCount > 0) return
    void droneStop().then((state) => {
      commit({ ...fromNative(state), activeNotes: [], enabled: false })
    })
  }, 600)
}

export function useDrone({
  volume,
  waveform,
  hapticFeedback = true,
}: UseDroneOptions): UseDroneResult {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    retain()
    restoreOnce(volume, waveform)
    return release
    // Retain/release exactly once per mount; volume and waveform have their own effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (prefs.volume === volume) return
    runNative({ ...prefs, volume }, () => droneSetVolume(volume))
  }, [volume])

  useEffect(() => {
    if (prefs.waveform === waveform) return
    runNative({ ...prefs, waveform }, () => droneSetWaveform(waveform))
  }, [waveform])

  const toggle = useCallback(
    (pitchClass: number) => toggleNote(pitchClass, hapticFeedback),
    [hapticFeedback],
  )
  const setAll = useCallback(
    (pitchClasses: number[]) => setNotes(pitchClasses, hapticFeedback),
    [hapticFeedback],
  )
  const incrementOctave = useCallback(() => stepOctave(1, hapticFeedback), [hapticFeedback])
  const decrementOctave = useCallback(() => stepOctave(-1, hapticFeedback), [hapticFeedback])

  return {
    activeNotes: state.activeNotes,
    octave: state.octave,
    enabled: state.enabled,
    lastPitchClass: state.lastPitchClass,
    nativeAvailable: isDroneNativeAvailable(),
    toggleNote: toggle,
    soloNote,
    glissNote,
    setNotes: setAll,
    silence,
    incrementOctave,
    decrementOctave,
  }
}

/** Read the live drone state outside React (desk snapshots). */
export function readDroneState(): DronePrefs {
  return prefs
}

/** Subscribe to the drone store outside the widget (desk chips watch it). */
export const subscribeDrone = subscribe
export const getDroneSnapshot = getSnapshot

/**
 * Restore a desk's drone: the note sounds when the desk had one, otherwise
 * the drone goes quiet. Octave is applied either way so the widget reopens
 * where the desk left it.
 */
export function applyDroneFromDesk(pitchClass: number | null, octave: number): void {
  const clampedOctave = Math.min(8, Math.max(0, Math.round(octave)))
  if (pitchClass === null) {
    if (prefs.octave !== clampedOctave) setOctave(clampedOctave)
    silence()
    return
  }
  glissNote(pitchClass, clampedOctave)
}
