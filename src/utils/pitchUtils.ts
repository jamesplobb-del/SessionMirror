import type { PitchSample } from '../types'
import type { WaveformSample } from './pitchExtractor'

const A4_HZ = 440

export interface PitchReadout {
  noteName: string
  cents: number
  frequencyHz: number
  midi: number
}

export type IntonationZone = 'green' | 'yellow' | 'red'

export interface PitchTrackerStats {
  green: number
  yellow: number
  red: number
}

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

export const INTONATION_COLORS = {
  green: '#22c55e',
  yellow: '#f59e0b',
  red: '#ef4444',
  best: '#fbbf24',
  silent: 'rgba(255,255,255,0.15)',
} as const

export const TUNING_GREEN_CENTS = 5
export const TUNING_YELLOW_CENTS = 15

/** MIDI note number from frequency (A4 = 69 @ 440 Hz). */
export function frequencyToMidi(frequencyHz: number): number {
  return 69 + 12 * Math.log2(frequencyHz / A4_HZ)
}

/** Nearest MIDI note number. */
export function frequencyToNearestMidi(frequencyHz: number): number {
  return Math.round(frequencyToMidi(frequencyHz))
}

/** Standard tuner spelling (sharps for accidentals). */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NOTE_NAMES[pitchClass]}${octave}`
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

export function getIntonationZone(cents: number): IntonationZone {
  const abs = Math.abs(cents)
  if (abs <= TUNING_GREEN_CENTS) return 'green'
  if (abs <= TUNING_YELLOW_CENTS) return 'yellow'
  return 'red'
}

export function getIntonationColor(cents: number): string {
  return INTONATION_COLORS[getIntonationZone(cents)]
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

export function formatFrequencyHz(frequencyHz: number): string {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return '—'
  return `${frequencyHz.toFixed(1)} Hz`
}

export function isInTune(cents: number, tolerance = TUNING_GREEN_CENTS): boolean {
  return Math.abs(cents) <= tolerance
}

export function computePitchTrackerStats(
  series: PitchSample[],
): PitchTrackerStats {
  if (series.length === 0) {
    return { green: 0, yellow: 0, red: 0 }
  }

  let green = 0
  let yellow = 0
  let red = 0

  for (const sample of series) {
    const zone = getIntonationZone(frequencyToCentsOffset(sample.frequencyHz))
    if (zone === 'green') green += 1
    else if (zone === 'yellow') yellow += 1
    else red += 1
  }

  const total = series.length
  return {
    green: (green / total) * 100,
    yellow: (yellow / total) * 100,
    red: (red / total) * 100,
  }
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

function interpolateWaveformAtTime(
  samples: WaveformSample[],
  time: number,
): number {
  if (samples.length === 0) return 0
  if (time <= samples[0].time) return samples[0].amplitude
  if (time >= samples[samples.length - 1].time) {
    return samples[samples.length - 1].amplitude
  }

  for (let index = 0; index < samples.length - 1; index += 1) {
    const start = samples[index]
    const end = samples[index + 1]
    if (time >= start.time && time <= end.time) {
      const ratio = (time - start.time) / (end.time - start.time)
      return start.amplitude + ratio * (end.amplitude - start.amplitude)
    }
  }

  return 0
}

export interface PitchChartPoint {
  time: number
  bestCents?: number
  currentGreen?: number
  currentYellow?: number
  currentRed?: number
  bestFrequencyHz?: number
  currentFrequencyHz?: number
  waveUpper?: number
  waveLower?: number
}

function clampGraphCents(cents: number): number {
  return Math.max(-50, Math.min(50, cents))
}

export function buildPitchChartData(
  bestSeries: PitchSample[],
  currentSeries: PitchSample[],
  currentWaveform: WaveformSample[],
  durationSec: number,
): PitchChartPoint[] {
  const stepSec = 0.05
  const points: PitchChartPoint[] = []
  const end = Math.max(durationSec, 0.01)

  for (let time = 0; time <= end; time += stepSec) {
    const roundedTime = Number(time.toFixed(2))
    const bestHz = interpolateFrequencyAtTime(bestSeries, roundedTime)
    const currentHz = interpolateFrequencyAtTime(currentSeries, roundedTime)
    const waveAmp = interpolateWaveformAtTime(currentWaveform, roundedTime)
    const waveScope = waveAmp * 42

    const point: PitchChartPoint = {
      time: roundedTime,
      waveUpper: waveScope,
      waveLower: -waveScope,
      bestFrequencyHz: bestHz ?? undefined,
      currentFrequencyHz: currentHz ?? undefined,
    }

    if (bestHz != null) {
      point.bestCents = clampGraphCents(frequencyToCentsOffset(bestHz))
    }

    if (currentHz != null) {
      const cents = clampGraphCents(frequencyToCentsOffset(currentHz))
      const zone = getIntonationZone(cents)
      if (zone === 'green') point.currentGreen = cents
      if (zone === 'yellow') point.currentYellow = cents
      if (zone === 'red') point.currentRed = cents
    }

    const hasData =
      point.bestCents != null ||
      point.currentGreen != null ||
      point.currentYellow != null ||
      point.currentRed != null ||
      waveScope > 0.01

    if (hasData) points.push(point)
  }

  return points
}

/** Exponential smoothing for live tuner readout stability. */
export function smoothFrequency(
  previous: number | null,
  next: number,
  alpha = 0.35,
): number {
  if (previous == null || !Number.isFinite(previous)) return next
  return previous * (1 - alpha) + next * alpha
}
