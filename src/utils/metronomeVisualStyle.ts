import { useSyncExternalStore } from 'react'

/**
 * Which visual the metronome stage draws. All four read tempo from motion
 * alone, so the beat stays followable with the sound muted or with the phone
 * across the room.
 *
 * Purely presentational — deliberately kept out of the shared audio engine's
 * snapshot so changing it never touches click scheduling.
 */
export type MetronomeVisualStyle = 'ribbon' | 'vertical' | 'horizontal' | 'columns'

export const METRONOME_VISUAL_STYLES = [
  { id: 'ribbon', label: 'Pulse Ribbon' },
  { id: 'vertical', label: 'Vertical Bounce' },
  { id: 'horizontal', label: 'Horizontal Bounce' },
  { id: 'columns', label: 'Pulse Columns' },
] as const satisfies ReadonlyArray<{ id: MetronomeVisualStyle; label: string }>

const STORAGE_KEY = 'besttake.metronome.visualStyle'
const DEFAULT_STYLE: MetronomeVisualStyle = 'ribbon'

function parse(value: string | null): MetronomeVisualStyle {
  if (value === 'ribbon' || value === 'vertical' || value === 'horizontal' || value === 'columns') {
    return value
  }
  // Preserve the nearest equivalent for existing installs. The retired bars
  // view becomes Pulse Columns; Orbit and Pendulum return to the new default.
  return value === 'bars' ? 'columns' : DEFAULT_STYLE
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
