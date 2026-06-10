import type { PitchSample } from '../types'
import {
  MAX_INSTRUMENT_HZ,
  MIN_INSTRUMENT_HZ,
  NOTE_HYSTERESIS_CENTS,
  PITCH_SMOOTH_ALPHA,
} from './pitchConfig'

const A4_HZ = 440
const MAX_DISPLAY_CENTS = 50

export interface PitchReadout {
  noteName: string
  cents: number
  frequencyHz: number
  midi: number
}

export type IntonationZone = 'green' | 'yellow' | 'red'

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const

export const TUNING_GREEN_CENTS = 5
export const TUNING_YELLOW_CENTS = 15

export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / A4_HZ)
}

export function frequencyToNearestMidi(frequencyHz: number): number {
  return Math.round(frequencyToMidi(frequencyHz))
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NOTE_NAMES[pitchClass]}${octave}`
}

export function centsFromMidi(frequencyHz: number, midi: number): number {
  const perfectHz = A4_HZ * 2 ** ((midi - 69) / 12)
  if (!Number.isFinite(perfectHz) || perfectHz <= 0 || frequencyHz <= 0) return 0
  return 1200 * Math.log2(frequencyHz / perfectHz)
}

/** Pick the octave whose cents offset is smallest (fixes harmonic/octave jumps). */
function bestMidiForFrequency(frequencyHz: number): { midi: number; cents: number } {
  const baseMidi = frequencyToNearestMidi(frequencyHz)
  let bestMidi = baseMidi
  let bestCents = centsFromMidi(frequencyHz, baseMidi)

  for (const shift of [-24, -12, 12, 24]) {
    const candidate = baseMidi + shift
    const cents = centsFromMidi(frequencyHz, candidate)
    if (Math.abs(cents) < Math.abs(bestCents)) {
      bestCents = cents
      bestMidi = candidate
    }
  }

  return { midi: bestMidi, cents: bestCents }
}

export function normalizeInstrumentFrequency(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return 0

  let normalized = frequencyHz
  let guard = 0
  while (normalized < MIN_INSTRUMENT_HZ && guard < 4) {
    normalized *= 2
    guard += 1
  }
  guard = 0
  while (normalized > MAX_INSTRUMENT_HZ && guard < 4) {
    normalized /= 2
    guard += 1
  }

  return normalized
}

export function frequencyToCentsOffset(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return 0
  return bestMidiForFrequency(frequencyHz).cents
}

export function frequencyToPitchReadout(frequencyHz: number): PitchReadout {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return { noteName: '—', cents: 0, frequencyHz: 0, midi: 0 }
  }

  const normalized = normalizeInstrumentFrequency(frequencyHz)
  if (!isFrequencyInInstrumentRange(normalized)) {
    return { noteName: '—', cents: 0, frequencyHz: 0, midi: 0 }
  }

  const { midi, cents } = bestMidiForFrequency(normalized)
  if (!Number.isFinite(cents) || Math.abs(cents) > MAX_DISPLAY_CENTS) {
    return { noteName: '—', cents: 0, frequencyHz: 0, midi: 0 }
  }

  return {
    noteName: midiToNoteName(midi),
    cents,
    frequencyHz: normalized,
    midi,
  }
}

export function stabilizePitchReadout(
  previous: PitchReadout | null,
  next: PitchReadout,
): PitchReadout {
  if (next.noteName === '—' || !previous || previous.noteName === '—') {
    return next
  }

  if (previous.noteName === next.noteName) return next

  const centsFromPrevious = centsFromMidi(next.frequencyHz, previous.midi)
  if (Math.abs(centsFromPrevious) <= NOTE_HYSTERESIS_CENTS) {
    return {
      ...next,
      noteName: previous.noteName,
      midi: previous.midi,
      cents: Math.max(-MAX_DISPLAY_CENTS, Math.min(MAX_DISPLAY_CENTS, centsFromPrevious)),
    }
  }

  return next
}

export function quantizeDisplayCents(cents: number, step: number): number {
  if (step <= 0) return cents
  return Math.round(cents / step) * step
}

/** Symmetric moving average — used for drawing smooth pitch curves. */
export function movingAverage(values: number[], radius: number): number[] {
  if (values.length === 0 || radius <= 0) return values

  return values.map((_, index) => {
    let sum = 0
    let count = 0
    for (
      let offset = Math.max(0, index - radius);
      offset <= Math.min(values.length - 1, index + radius);
      offset += 1
    ) {
      sum += values[offset]
      count += 1
    }
    return sum / count
  })
}

export function getIntonationZone(cents: number): IntonationZone {
  const abs = Math.abs(cents)
  if (abs <= TUNING_GREEN_CENTS) return 'green'
  if (abs <= TUNING_YELLOW_CENTS) return 'yellow'
  return 'red'
}

export function getIntonationColor(cents: number): string {
  const zone = getIntonationZone(cents)
  if (zone === 'green') return '#22c55e'
  if (zone === 'yellow') return '#f59e0b'
  return '#ef4444'
}

/** Vertical cents gradient for pitch trace (sharp top → in-tune center → flat bottom). */
export function createPitchVerticalGradient(
  ctx: CanvasRenderingContext2D,
  centsToY: (cents: number) => number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, centsToY(50), 0, centsToY(-50))
  gradient.addColorStop(0, '#ef4444')
  gradient.addColorStop(0.32, '#f59e0b')
  gradient.addColorStop(0.5, '#22c55e')
  gradient.addColorStop(0.68, '#f59e0b')
  gradient.addColorStop(1, '#ef4444')
  return gradient
}

export function glowColorForCents(cents: number): string {
  const zone = getIntonationZone(cents)
  if (zone === 'green') return 'rgba(34, 197, 94, 0.55)'
  if (zone === 'yellow') return 'rgba(245, 158, 11, 0.55)'
  return 'rgba(239, 68, 68, 0.55)'
}

export function formatFrequencyHz(frequencyHz: number): string {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return '— Hz'
  return `${frequencyHz.toFixed(1)} Hz`
}

export function isInTune(cents: number, tolerance = TUNING_GREEN_CENTS): boolean {
  return Math.abs(cents) <= tolerance
}

export function smoothFrequency(
  previous: number | null,
  next: number,
  alpha = PITCH_SMOOTH_ALPHA,
): number {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return next
  if (!Number.isFinite(next) || next <= 0) return previous
  return previous * (1 - alpha) + next * alpha
}

export function isFrequencyInInstrumentRange(frequencyHz: number): boolean {
  return (
    Number.isFinite(frequencyHz) &&
    frequencyHz >= MIN_INSTRUMENT_HZ &&
    frequencyHz <= MAX_INSTRUMENT_HZ
  )
}

export function interpolateFrequencyAtTime(
  samples: PitchSample[],
  time: number,
): number | null {
  if (samples.length === 0) return null
  if (time <= samples[0].time) return samples[0].frequencyHz
  if (time >= samples[samples.length - 1].time) {
    return samples[samples.length - 1].frequencyHz
  }

  for (let index = 0; index < samples.length - 1; index += 1) {
    const start = samples[index]
    const end = samples[index + 1]
    if (time >= start.time && time <= end.time) {
      const ratio = (time - start.time) / (end.time - start.time)
      return start.frequencyHz + ratio * (end.frequencyHz - start.frequencyHz)
    }
  }

  return null
}
