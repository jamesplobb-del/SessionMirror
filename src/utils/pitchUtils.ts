import type { PitchSample } from '../types'

const A4_HZ = 440

export interface PitchReadout {
  noteName: string
  cents: number
  frequencyHz: number
  midi: number
}

const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

/** MIDI note number from frequency (A4 = 69 @ 440 Hz). */
export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / A4_HZ)
}

/** Nearest MIDI note number. */
export function frequencyToNearestMidi(frequencyHz: number): number {
  return Math.round(frequencyToMidi(frequencyHz))
}

/** Map MIDI note to label like C4, F#5, Bb4. */
export function midiToNoteName(midi: number, preferFlats = true): string {
  const rounded = Math.round(midi)
  const names = preferFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${names[pitchClass]}${octave}`
}

/** Cent deviation from equal-tempered A440 for the nearest note. */
export function frequencyToCentsOffset(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return 0

  const nearestMidi = frequencyToNearestMidi(frequencyHz)
  const perfectHz = A4_HZ * 2 ** ((nearestMidi - 69) / 12)
  return 1200 * Math.log2(frequencyHz / perfectHz)
}

export function frequencyToPitchReadout(frequencyHz: number): PitchReadout {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return { noteName: '—', cents: 0, frequencyHz: 0, midi: 0 }
  }

  const midi = frequencyToNearestMidi(frequencyHz)
  const cents = frequencyToCentsOffset(frequencyHz)

  return {
    noteName: midiToNoteName(midi),
    cents,
    frequencyHz,
    midi,
  }
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents)
  if (rounded === 0) return '0¢'
  return `${rounded > 0 ? '+' : ''}${rounded}¢`
}

export function formatPitchReadout(readout: PitchReadout): string {
  if (readout.noteName === '—') return '—'
  return `${readout.noteName} ${formatCents(readout.cents)}`
}

export function isInTune(cents: number, tolerance = 5): boolean {
  return Math.abs(cents) <= tolerance
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

export interface PitchChartPoint {
  time: number
  bestCents?: number
  currentCents?: number
  bestFrequencyHz?: number
  currentFrequencyHz?: number
}

/** Clamp cents for graph display within ±50. */
function clampGraphCents(cents: number): number {
  return Math.max(-50, Math.min(50, cents))
}

export function buildPitchChartData(
  bestSeries: PitchSample[],
  currentSeries: PitchSample[],
): PitchChartPoint[] {
  const timeSet = new Set<number>()
  for (const sample of bestSeries) timeSet.add(sample.time)
  for (const sample of currentSeries) timeSet.add(sample.time)

  return [...timeSet]
    .sort((a, b) => a - b)
    .map((time) => {
      const bestHz = interpolateFrequencyAtTime(bestSeries, time)
      const currentHz = interpolateFrequencyAtTime(currentSeries, time)

      return {
        time,
        bestCents:
          bestHz != null ? clampGraphCents(frequencyToCentsOffset(bestHz)) : undefined,
        currentCents:
          currentHz != null
            ? clampGraphCents(frequencyToCentsOffset(currentHz))
            : undefined,
        bestFrequencyHz: bestHz ?? undefined,
        currentFrequencyHz: currentHz ?? undefined,
      }
    })
}

/** Placeholder pitch contour until offline analysis is wired to takes. */
export function createDemoPitchSeries(
  durationSec: number,
  seed = 0,
): PitchSample[] {
  if (durationSec <= 0) return []

  const samples: PitchSample[] = []
  const stepSec = 0.05
  const baseNotesHz = [440, 466.16, 493.88, 523.25, 587.33, 659.25]

  for (let time = 0; time <= durationSec; time += stepSec) {
    const segment = Math.floor(time / Math.max(durationSec / baseNotesHz.length, 0.25))
    const baseHz = baseNotesHz[(segment + seed) % baseNotesHz.length]
    const wobbleCents = Math.sin(time * 2.4 + seed) * 18
    const frequencyHz = baseHz * 2 ** (wobbleCents / 1200)
    samples.push({ time: Number(time.toFixed(2)), frequencyHz })
  }

  return samples
}

export function resolvePitchSeries(
  takeId: string,
  stored: PitchSample[] | undefined,
  durationSec: number,
): PitchSample[] {
  if (stored?.length) return stored
  if (durationSec <= 0) return []

  const seed = takeId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5
  return createDemoPitchSeries(durationSec, seed)
}
