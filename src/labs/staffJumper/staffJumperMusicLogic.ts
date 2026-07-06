import type { PitchReadout } from '../../utils/pitchUtils'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { getStaffPositionForMidi } from './staffNotationMap'

export const STAFF_JUMPER_MAJOR_KEYS = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const

export const STAFF_JUMPER_MINOR_KEYS = [
  'A',
  'Bb',
  'B',
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
] as const

export type StaffJumperMajorKey = (typeof STAFF_JUMPER_MAJOR_KEYS)[number]
export type StaffJumperMinorKey = (typeof STAFF_JUMPER_MINOR_KEYS)[number]
export type StaffJumperKey = StaffJumperMajorKey | StaffJumperMinorKey

export type StaffJumperScaleMode = 'major' | 'minor'

export const STAFF_JUMPER_RANGES = ['1-octave', '2-octaves'] as const
export type StaffJumperRange = (typeof STAFF_JUMPER_RANGES)[number]

export const SCALE_MODE_LABELS: Record<StaffJumperScaleMode, string> = {
  major: 'Major',
  minor: 'Natural Minor',
}

export const RANGE_LABELS: Record<StaffJumperRange, string> = {
  '1-octave': '1 Octave',
  '2-octaves': '2 Octaves',
}

export const STAFF_JUMPER_BEST_SCORE_KEY = 'sessionmirror:staff-jumper-best'

const KEY_TO_PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const FLAT_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const SHARP_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const MAJOR_PATTERN = [0, 2, 4, 5, 7, 9, 11] as const
const MINOR_PATTERN = [0, 2, 3, 5, 7, 8, 10] as const

export type StaffJumperPhase = 'setup' | 'playing' | 'gameover'

export type StaffJumperFeedback = 'good' | 'wrong' | 'timeout' | null

export interface StaffJumperConfig {
  key: StaffJumperKey
  scaleMode: StaffJumperScaleMode
  range: StaffJumperRange
  tunerInstrument: TunerInstrument
}

export interface StaffJumperState {
  phase: StaffJumperPhase
  config: StaffJumperConfig | null
  sequenceStep: number
  targetPitchClass: number
  score: number
  streak: number
  bestStreak: number
  hearts: number
  correctCount: number
  missCount: number
  bestScore: number
  advanceToken: number
  missToken: number
  feedback: StaffJumperFeedback
  feedbackToken: number
  isFalling: boolean
  startedAtMs: number | null
}

export interface TargetNote {
  sequenceIndex: number
  midi: number
  pitchClass: number
  noteLabel: string
  yPx: number
}

export function keysForScaleMode(scaleMode: StaffJumperScaleMode): readonly StaffJumperKey[] {
  return scaleMode === 'major' ? STAFF_JUMPER_MAJOR_KEYS : STAFF_JUMPER_MINOR_KEYS
}

export function scaleDisplayName(key: StaffJumperKey, scaleMode: StaffJumperScaleMode): string {
  return `${key} ${SCALE_MODE_LABELS[scaleMode]}`
}

function prefersFlatSpelling(key: StaffJumperKey): boolean {
  return key.includes('b') || key === 'F' || key === 'Db' || key === 'Gb' || key === 'Ab' || key === 'Eb'
}

function keyPitchClass(key: StaffJumperKey): number {
  return KEY_TO_PITCH_CLASS[key] ?? 0
}

function scalePattern(scaleMode: StaffJumperScaleMode): readonly number[] {
  return scaleMode === 'major' ? MAJOR_PATTERN : MINOR_PATTERN
}

export function pitchClassLabel(pitchClass: number, key: StaffJumperKey): string {
  const normalized = ((pitchClass % 12) + 12) % 12
  return prefersFlatSpelling(key) ? FLAT_LABELS[normalized]! : SHARP_LABELS[normalized]!
}

function midiForScaleDegree(
  key: StaffJumperKey,
  scaleMode: StaffJumperScaleMode,
  degreeIndex: number,
  baseOctave = 4,
): number {
  const pattern = scalePattern(scaleMode)
  const rootPc = keyPitchClass(key)
  const octaveOffset = Math.floor(degreeIndex / 7)
  const degreeInOctave = degreeIndex % 7
  const semitoneFromRoot = pattern[degreeInOctave]! + octaveOffset * 12
  const rootMidi = (baseOctave + 1) * 12 + rootPc
  return rootMidi + semitoneFromRoot
}

/** Ascending scale through configured range — loops for endless play. */
export function buildScaleMidiSequence(config: Pick<StaffJumperConfig, 'key' | 'scaleMode' | 'range'>): number[] {
  const topDegree = config.range === '1-octave' ? 7 : 14
  return Array.from({ length: topDegree + 1 }, (_, degree) =>
    midiForScaleDegree(config.key, config.scaleMode, degree),
  )
}

function midiAtStep(config: StaffJumperConfig, sequenceStep: number): number {
  const sequence = buildScaleMidiSequence(config)
  return sequence[sequenceStep % sequence.length]!
}

/**
 * Single source of truth for the note sequence.
 * HUD target, platform label, staff Y, and pitch check all derive from here.
 */
export function getTargetNoteAtStep(config: StaffJumperConfig, sequenceStep: number): TargetNote {
  const midi = midiAtStep(config, sequenceStep)
  const pitchClass = ((midi % 12) + 12) % 12
  const staff = getStaffPositionForMidi(midi)
  return {
    sequenceIndex: sequenceStep,
    midi,
    pitchClass,
    noteLabel: pitchClassLabel(pitchClass, config.key),
    yPx: staff.yPx,
  }
}

export interface PlatformSlot {
  step: number
  note: TargetNote
  role: 'landed' | 'target' | 'future'
  opacity: number
}

export function getVisiblePlatforms(
  config: StaffJumperConfig,
  sequenceStep: number,
  visibleCount = 6,
): PlatformSlot[] {
  const slots: PlatformSlot[] = []
  const startStep = sequenceStep === 0 ? 0 : sequenceStep - 1

  for (let index = 0; index < visibleCount; index += 1) {
    const step = startStep + index
    const note = getTargetNoteAtStep(config, step)

    let role: PlatformSlot['role']
    if (sequenceStep === 0) {
      role = index === 0 ? 'target' : 'future'
    } else if (index === 0) {
      role = 'landed'
    } else if (index === 1) {
      role = 'target'
    } else {
      role = 'future'
    }

    const distance = role === 'target' || role === 'landed' ? 0 : index - (sequenceStep === 0 ? 0 : 1)
    const opacity = role === 'target' ? 1 : role === 'landed' ? 1 : Math.max(0.35, 1 - distance * 0.18)

    slots.push({ step, note, role, opacity })
  }

  return slots
}

export function pitchClassesMatch(detected: number, target: number): boolean {
  return ((detected % 12) + 12) % 12 === ((target % 12) + 12) % 12
}

const MIN_GAMEPLAY_HZ = 70
const MAX_GAMEPLAY_HZ = 1400

export function readoutToConcertPitchClass(readout: PitchReadout): number | null {
  if (!Number.isFinite(readout.frequencyHz) || readout.frequencyHz < MIN_GAMEPLAY_HZ) return null
  if (readout.frequencyHz > MAX_GAMEPLAY_HZ) return null
  if (!readout.noteName || readout.noteName === '—') return null
  return ((Math.round(readout.midi) % 12) + 12) % 12
}

export function getDetectedPitchClass(readout: PitchReadout): number | null {
  return readoutToConcertPitchClass(readout)
}

export function isReadoutCorrectPitch(readout: PitchReadout, targetPitchClass: number): boolean {
  const detected = getDetectedPitchClass(readout)
  if (detected == null) return false
  return pitchClassesMatch(detected, targetPitchClass)
}

export function isReadoutWrongPitch(readout: PitchReadout, targetPitchClass: number): boolean {
  const detected = getDetectedPitchClass(readout)
  if (detected == null) return false
  return !pitchClassesMatch(detected, targetPitchClass)
}

export function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(STAFF_JUMPER_BEST_SCORE_KEY)
    const parsed = raw ? Number.parseInt(raw, 10) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

export function saveBestScore(score: number): number {
  const current = loadBestScore()
  const next = Math.max(current, score)
  try {
    localStorage.setItem(STAFF_JUMPER_BEST_SCORE_KEY, String(next))
  } catch {
    // labs prototype
  }
  return next
}

export function computeAccuracy(correct: number, misses: number): number {
  const total = correct + misses
  if (total === 0) return 100
  return Math.round((correct / total) * 1000) / 10
}
