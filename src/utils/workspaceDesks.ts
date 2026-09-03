import type { RecordingMode } from '../types'
import type { MetronomeMeter, MetronomeSubdivision } from './metronomeConfig'
import { getWrittenPitchLabel, type TunerTranspositionId } from './tunerTransposition'

/**
 * A desk is the whole room set up for one kind of practice: which overlays
 * are on, the click, the drone note, the hands-free gap, and which surface
 * it lives on. Saving one turns four toggles into one tap. Up to three live
 * as chips at the top of the Workspace tray — never a gallery.
 */
export interface WorkspaceDesk {
  id: string
  name: string
  mode: RecordingMode
  pitchTrackerEnabled: boolean
  showMetronome: boolean
  showDrone: boolean
  showTakeCards: boolean
  autoSoundRecording: boolean
  audioEnhancerEnabled: boolean
  metronome: {
    bpm: number
    meter: MetronomeMeter
    subdivision: MetronomeSubdivision
  }
  drone: {
    pitchClass: number | null
    octave: number
  }
  soundSilenceSeconds: number
  savedAt: number
}

/** Everything a desk captures, minus identity. */
export type DeskSnapshot = Omit<WorkspaceDesk, 'id' | 'name' | 'savedAt'>

export const MAX_WORKSPACE_DESKS = 3

const STORAGE_KEY = 'sessionmirror:workspace-desks'
const FOCUS_DESK_PREFIX = 'sessionmirror:focus-desk:'

function isMode(value: unknown): value is RecordingMode {
  return value === 'video' || value === 'audio'
}

function parseDesk(value: unknown): WorkspaceDesk | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !isMode(raw.mode)) {
    return null
  }
  const metronome = (raw.metronome ?? {}) as Record<string, unknown>
  const drone = (raw.drone ?? {}) as Record<string, unknown>
  const pitchClass = Number(drone.pitchClass)
  return {
    id: raw.id,
    name: raw.name.trim().slice(0, 24) || 'Desk',
    mode: raw.mode,
    pitchTrackerEnabled: Boolean(raw.pitchTrackerEnabled),
    showMetronome: Boolean(raw.showMetronome),
    showDrone: Boolean(raw.showDrone),
    showTakeCards: raw.showTakeCards === undefined ? true : Boolean(raw.showTakeCards),
    autoSoundRecording: Boolean(raw.autoSoundRecording),
    audioEnhancerEnabled: Boolean(raw.audioEnhancerEnabled),
    metronome: {
      bpm: Number.isFinite(Number(metronome.bpm)) ? Number(metronome.bpm) : 120,
      meter: (typeof metronome.meter === 'string' ? metronome.meter : '4/4') as MetronomeMeter,
      subdivision: (typeof metronome.subdivision === 'string'
        ? metronome.subdivision
        : 'off') as MetronomeSubdivision,
    },
    drone: {
      pitchClass:
        Number.isInteger(pitchClass) && pitchClass >= 0 && pitchClass <= 11 ? pitchClass : null,
      octave: Number.isFinite(Number(drone.octave)) ? Number(drone.octave) : 4,
    },
    soundSilenceSeconds: Number.isFinite(Number(raw.soundSilenceSeconds))
      ? Number(raw.soundSilenceSeconds)
      : 2,
    savedAt: Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : 0,
  }
}

export function loadWorkspaceDesks(): WorkspaceDesk[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(parseDesk)
      .filter((desk): desk is WorkspaceDesk => desk !== null)
      .slice(0, MAX_WORKSPACE_DESKS)
  } catch {
    return []
  }
}

export function saveWorkspaceDesks(desks: WorkspaceDesk[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(desks.slice(0, MAX_WORKSPACE_DESKS)))
  } catch {
    /* private mode / quota */
  }
}

export function createDesk(name: string, snapshot: DeskSnapshot): WorkspaceDesk {
  return {
    ...snapshot,
    id: `desk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 24) || 'Desk',
    savedAt: Date.now(),
  }
}

/** True when the live desk still matches what was saved — the chip stays lit. */
export function deskMatchesSnapshot(desk: WorkspaceDesk, live: DeskSnapshot): boolean {
  return (
    desk.mode === live.mode &&
    desk.pitchTrackerEnabled === live.pitchTrackerEnabled &&
    desk.showMetronome === live.showMetronome &&
    desk.showDrone === live.showDrone &&
    desk.showTakeCards === live.showTakeCards &&
    desk.autoSoundRecording === live.autoSoundRecording &&
    desk.audioEnhancerEnabled === live.audioEnhancerEnabled &&
    (!desk.showMetronome ||
      (desk.metronome.bpm === live.metronome.bpm &&
        desk.metronome.meter === live.metronome.meter &&
        desk.metronome.subdivision === live.metronome.subdivision)) &&
    (!desk.showDrone ||
      (desk.drone.pitchClass === live.drone.pitchClass &&
        desk.drone.octave === live.drone.octave)) &&
    (!desk.autoSoundRecording || desk.soundSilenceSeconds === live.soundSilenceSeconds)
  )
}

/** One literal line: what is on, at what value, on which surface. */
export function summarizeDesk(
  desk: DeskSnapshot,
  transposition: TunerTranspositionId,
): string {
  const parts: string[] = []
  if (desk.showMetronome) parts.push(`♩${Math.round(desk.metronome.bpm)}`)
  if (desk.showDrone && desk.drone.pitchClass !== null) {
    parts.push(
      `Drone ${getWrittenPitchLabel(desk.drone.pitchClass, desk.drone.octave, transposition).noteName}`,
    )
  } else if (desk.showDrone) {
    parts.push('Drone')
  }
  if (desk.pitchTrackerEnabled) parts.push('Pitch')
  if (desk.autoSoundRecording) parts.push(`Hands-free ${desk.soundSilenceSeconds}s`)
  if (desk.audioEnhancerEnabled) parts.push('Enhancer')
  if (desk.mode === 'video' && !desk.showTakeCards) parts.push('Cards off')
  parts.push(desk.mode === 'video' ? 'Camera' : 'Audio')
  return parts.join(' · ')
}

/* ---- Focus sessions remember their own desk ---------------------------- */

export function loadFocusDesk(projectId: string): DeskSnapshot | null {
  try {
    const raw = localStorage.getItem(`${FOCUS_DESK_PREFIX}${projectId}`)
    if (!raw) return null
    const parsed = parseDesk({ ...(JSON.parse(raw) as object), id: 'focus', name: 'Focus' })
    if (!parsed) return null
    const { id: _id, name: _name, savedAt: _savedAt, ...snapshot } = parsed
    return snapshot
  } catch {
    return null
  }
}

export function saveFocusDesk(projectId: string, snapshot: DeskSnapshot): void {
  try {
    localStorage.setItem(`${FOCUS_DESK_PREFIX}${projectId}`, JSON.stringify(snapshot))
  } catch {
    /* private mode / quota */
  }
}
