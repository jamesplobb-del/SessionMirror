import { useSyncExternalStore } from 'react'

/**
 * Which visual the metronome stage draws. All three read tempo from motion
 * alone, so the beat stays followable with the sound muted or with the phone
 * across the room.
 *
 * Purely presentational — deliberately kept out of the shared audio engine's
 * snapshot so changing it never touches click scheduling.
 */
export type MetronomeVisualStyle = 'bars' | 'pendulum' | 'orbit'

export const METRONOME_VISUAL_STYLES = [
  { id: 'bars', label: 'Bars' },
  { id: 'pendulum', label: 'Pendulum' },
  { id: 'orbit', label: 'Orbit' },
] as const satisfies ReadonlyArray<{ id: MetronomeVisualStyle; label: string }>

const STORAGE_KEY = 'besttake.metronome.visualStyle'
const DEFAULT_STYLE: MetronomeVisualStyle = 'bars'

function parse(value: string | null): MetronomeVisualStyle {
  return value === 'pendulum' || value === 'orbit' || value === 'bars' ? value : DEFAULT_STYLE
}

let current: MetronomeVisualStyle = DEFAULT_STYLE
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  try {
    current = parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    /* private mode — keep the default */
  }
}

export function getMetronomeVisualStyle(): MetronomeVisualStyle {
  hydrate()
  return current
}

export function setMetronomeVisualStyle(style: MetronomeVisualStyle): void {
  hydrate()
  if (current === style) return
  current = style
  try {
    localStorage.setItem(STORAGE_KEY, style)
  } catch {
    /* private mode / quota — the in-memory value still applies this session */
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shared across every metronome surface, so the picker and the stage agree. */
export function useMetronomeVisualStyle(): MetronomeVisualStyle {
  return useSyncExternalStore(subscribe, getMetronomeVisualStyle, () => DEFAULT_STYLE)
}
