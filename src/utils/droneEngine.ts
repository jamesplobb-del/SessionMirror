import { Capacitor, registerPlugin } from '@capacitor/core'

export type DroneWaveform = 'sine' | 'triangle' | 'organ' | 'warmSynth'

export interface DroneState {
  activeNotes: number[]
  octave: number
  volume: number
  waveform: DroneWaveform
  enabled: boolean
}

export interface DroneToggleResult extends DroneState {
  pitchClass?: number
  noteActive?: boolean
}

interface DronePluginType {
  start(): Promise<DroneState>
  stop(): Promise<DroneState>
  toggleNote(options: { pitchClass: number }): Promise<DroneToggleResult>
  soloNote(options: { pitchClass: number }): Promise<DroneToggleResult>
  setOctave(options: { octave: number }): Promise<DroneState>
  setVolume(options: { volume: number }): Promise<DroneState>
  setWaveform(options: { waveform: DroneWaveform }): Promise<DroneState>
  getState(): Promise<DroneState>
  restoreState(options: {
    activeNotes: number[]
    octave: number
    volume: number
    waveform: DroneWaveform
  }): Promise<DroneState>
}

const DronePlugin = registerPlugin<DronePluginType>('DronePlugin')

export const DRONE_WAVEFORM_OPTIONS: { value: DroneWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'organ', label: 'Organ' },
  { value: 'warmSynth', label: 'Warm Synth' },
]

export const DRONE_NOTE_STRIP: { pitchClass: number; label: string }[] = [
  { pitchClass: 0, label: 'C' },
  { pitchClass: 1, label: 'C#/Db' },
  { pitchClass: 2, label: 'D' },
  { pitchClass: 3, label: 'Eb' },
  { pitchClass: 4, label: 'E' },
  { pitchClass: 5, label: 'F' },
  { pitchClass: 6, label: 'F#' },
  { pitchClass: 7, label: 'G' },
  { pitchClass: 8, label: 'Ab' },
  { pitchClass: 9, label: 'A' },
  { pitchClass: 10, label: 'Bb' },
  { pitchClass: 11, label: 'B' },
]

function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** In-memory fallback for web dev — silent no-op. */
const webStub: DronePluginType = {
  async start() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async stop() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async toggleNote() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async soloNote(options: { pitchClass: number }) {
    return {
      activeNotes: [options.pitchClass],
      octave: 4,
      volume: 0.75,
      waveform: 'sine' as const,
      enabled: true,
      pitchClass: options.pitchClass,
      noteActive: true,
    }
  },
  async setOctave() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async setVolume() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async setWaveform() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async getState() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
  async restoreState() {
    return { activeNotes: [], octave: 4, volume: 0.75, waveform: 'sine', enabled: false }
  },
}

function plugin(): DronePluginType {
  return isNativeIos() ? DronePlugin : webStub
}

export async function droneStart(): Promise<DroneState> {
  return plugin().start()
}

export async function droneStop(): Promise<DroneState> {
  return plugin().stop()
}

export async function droneToggleNote(pitchClass: number): Promise<DroneToggleResult> {
  return plugin().toggleNote({ pitchClass })
}

export async function droneSoloNote(pitchClass: number): Promise<DroneToggleResult> {
  return plugin().soloNote({ pitchClass })
}

export async function droneSetOctave(octave: number): Promise<DroneState> {
  return plugin().setOctave({ octave })
}

export async function droneSetVolume(volume: number): Promise<DroneState> {
  return plugin().setVolume({ volume })
}

export async function droneSetWaveform(waveform: DroneWaveform): Promise<DroneState> {
  return plugin().setWaveform({ waveform })
}

export async function droneGetState(): Promise<DroneState> {
  return plugin().getState()
}

export async function droneRestoreState(state: {
  activeNotes: number[]
  octave: number
  volume: number
  waveform: DroneWaveform
}): Promise<DroneState> {
  return plugin().restoreState(state)
}

export function isDroneNativeAvailable(): boolean {
  return isNativeIos()
}
