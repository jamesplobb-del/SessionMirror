import type { MetronomeSubdivision } from './metronomeTypes'

export type MetronomeMeter =
  | '2/4'
  | '3/4'
  | '4/4'
  | '5/4'
  | '6/4'
  | '7/4'
  | '2/2'
  | '3/2'
  | '4/2'
  | '5/2'
  | '6/2'
  | '7/2'
  | '6/8'
  | '9/8'
  | '12/8'
  | '15/8'
  | '5/8'
  | '7/8'
  | '8/8'
  | '10/8'
  | '11/8'
  | '3/16'
  | '5/16'
  | '7/16'
  | '9/16'
  | '11/16'
  | '13/16'
  | '15/16'
  | '16/16'

export type PulseUnit =
  | 'half'
  | 'dotted-half'
  | 'quarter'
  | 'dotted-quarter'
  | 'eighth'
  | 'sixteenth'

export type MetronomeAccentLevel = 'strong' | 'medium' | 'weak' | 'silent'

export interface BeatFeelOption {
  id: string
  label: string
  grouping: number[]
}

export interface TimeSignatureDefinition {
  label: MetronomeMeter
  numerator: number
  denominator: number
  /** Conducting pulses per bar — BPM always refers to this pulse. */
  pulseCount: number
  pulseUnit: PulseUnit
  pulseName: string
  compound: boolean
  defaultSubdivision: MetronomeSubdivision
  availableSubdivisions: MetronomeSubdivision[]
  /** Selectable beat groupings (Feel). Omitted when only one grouping applies. */
  feelOptions?: BeatFeelOption[]
  defaultFeelId?: string
  /** Default accent per conducting pulse before user overrides. */
  defaultAccentLevels: MetronomeAccentLevel[]
}

function feel(
  id: string,
  label: string,
  grouping: number[],
): BeatFeelOption {
  return { id, label, grouping }
}

function accentsFromGrouping(grouping: number[]): MetronomeAccentLevel[] {
  const levels: MetronomeAccentLevel[] = []
  for (let groupIndex = 0; groupIndex < grouping.length; groupIndex += 1) {
    const groupAccent: MetronomeAccentLevel = groupIndex === 0 ? 'strong' : 'medium'
    for (let beat = 0; beat < grouping[groupIndex]; beat += 1) {
      levels.push(beat === 0 ? groupAccent : 'weak')
    }
  }
  return levels
}

const SIMPLE_QUARTER_SUBDIVS: MetronomeSubdivision[] = ['off', '8ths', 'triplets', '16ths']
const COMPOUND_SUBDIVS: MetronomeSubdivision[] = ['off', '8ths', 'triplets', '16ths']
const HALF_PULSE_SUBDIVS: MetronomeSubdivision[] = ['off', '8ths', 'triplets', '16ths']
const EIGHTH_PULSE_SUBDIVS: MetronomeSubdivision[] = ['off', '8ths', 'triplets', '16ths']
const SIXTEENTH_PULSE_SUBDIVS: MetronomeSubdivision[] = ['off', '8ths', 'triplets', '16ths']

export const TIME_SIGNATURE_DEFINITIONS: Record<MetronomeMeter, TimeSignatureDefinition> = {
  '2/4': {
    label: '2/4',
    numerator: 2,
    denominator: 4,
    pulseCount: 2,
    pulseUnit: 'quarter',
    pulseName: 'Quarter',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIMPLE_QUARTER_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak'],
  },
  '3/4': {
    label: '3/4',
    numerator: 3,
    denominator: 4,
    pulseCount: 3,
    pulseUnit: 'quarter',
    pulseName: 'Quarter',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIMPLE_QUARTER_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  },
  '4/4': {
    label: '4/4',
    numerator: 4,
    denominator: 4,
    pulseCount: 4,
    pulseUnit: 'quarter',
    pulseName: 'Quarter',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIMPLE_QUARTER_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak'],
  },
  '5/4': {
    label: '5/4',
    numerator: 5,
    denominator: 4,
    pulseCount: 5,
    pulseUnit: 'quarter',
    pulseName: 'Quarter',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIMPLE_QUARTER_SUBDIVS,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2',
    defaultAccentLevels: accentsFromGrouping([3, 2]),
  },
  '6/4': {
    label: '6/4',
    numerator: 6,
    denominator: 4,
    pulseCount: 2,
    pulseUnit: 'dotted-half',
    pulseName: 'Dotted Half',
    compound: true,
    defaultSubdivision: '8ths',
    availableSubdivisions: ['off', '8ths', 'triplets', '16ths'],
    defaultAccentLevels: ['strong', 'medium'],
  },
  '7/4': {
    label: '7/4',
    numerator: 7,
    denominator: 4,
    pulseCount: 7,
    pulseUnit: 'quarter',
    pulseName: 'Quarter',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIMPLE_QUARTER_SUBDIVS,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
    ],
    defaultFeelId: '2+2+3',
    defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  },
  '2/2': {
    label: '2/2',
    numerator: 2,
    denominator: 2,
    pulseCount: 2,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak'],
  },
  '3/2': {
    label: '3/2',
    numerator: 3,
    denominator: 2,
    pulseCount: 3,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  },
  '4/2': {
    label: '4/2',
    numerator: 4,
    denominator: 2,
    pulseCount: 4,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak'],
  },
  '5/2': {
    label: '5/2',
    numerator: 5,
    denominator: 2,
    pulseCount: 5,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2',
    defaultAccentLevels: accentsFromGrouping([3, 2]),
  },
  '6/2': {
    label: '6/2',
    numerator: 6,
    denominator: 2,
    pulseCount: 6,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    feelOptions: [feel('3+3', '3+3', [3, 3])],
    defaultFeelId: '3+3',
    defaultAccentLevels: accentsFromGrouping([3, 3]),
  },
  '7/2': {
    label: '7/2',
    numerator: 7,
    denominator: 2,
    pulseCount: 7,
    pulseUnit: 'half',
    pulseName: 'Half',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: HALF_PULSE_SUBDIVS,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
    ],
    defaultFeelId: '2+2+3',
    defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  },
  '6/8': {
    label: '6/8',
    numerator: 6,
    denominator: 8,
    pulseCount: 2,
    pulseUnit: 'dotted-quarter',
    pulseName: 'Dotted Quarter',
    compound: true,
    defaultSubdivision: '8ths',
    availableSubdivisions: COMPOUND_SUBDIVS,
    defaultAccentLevels: ['strong', 'medium'],
  },
  '9/8': {
    label: '9/8',
    numerator: 9,
    denominator: 8,
    pulseCount: 3,
    pulseUnit: 'dotted-quarter',
    pulseName: 'Dotted Quarter',
    compound: true,
    defaultSubdivision: '8ths',
    availableSubdivisions: COMPOUND_SUBDIVS,
    feelOptions: [
      feel('3+3+3', '3+3+3', [3, 3, 3]),
      feel('2+2+2+3', '2+2+2+3', [2, 2, 2, 3]),
      feel('2+2+3+2', '2+2+3+2', [2, 2, 3, 2]),
      feel('2+3+2+2', '2+3+2+2', [2, 3, 2, 2]),
      feel('3+2+2+2', '3+2+2+2', [3, 2, 2, 2]),
    ],
    defaultFeelId: '3+3+3',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3]),
  },
  '12/8': {
    label: '12/8',
    numerator: 12,
    denominator: 8,
    pulseCount: 4,
    pulseUnit: 'dotted-quarter',
    pulseName: 'Dotted Quarter',
    compound: true,
    defaultSubdivision: '8ths',
    availableSubdivisions: COMPOUND_SUBDIVS,
    feelOptions: [
      feel('3+3+3+3', '3+3+3+3', [3, 3, 3, 3]),
      feel('2+2+2+2+2+2', '2+2+2+2+2+2', [2, 2, 2, 2, 2, 2]),
      feel('4+4+4', '4+4+4', [4, 4, 4]),
    ],
    defaultFeelId: '3+3+3+3',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3, 3]),
  },
  '15/8': {
    label: '15/8',
    numerator: 15,
    denominator: 8,
    pulseCount: 5,
    pulseUnit: 'dotted-quarter',
    pulseName: 'Dotted Quarter',
    compound: true,
    defaultSubdivision: '8ths',
    availableSubdivisions: COMPOUND_SUBDIVS,
    defaultAccentLevels: ['strong', 'medium', 'medium', 'medium', 'medium'],
  },
  '5/8': {
    label: '5/8',
    numerator: 5,
    denominator: 8,
    pulseCount: 5,
    pulseUnit: 'eighth',
    pulseName: 'Eighth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: EIGHTH_PULSE_SUBDIVS,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2',
    defaultAccentLevels: accentsFromGrouping([3, 2]),
  },
  '7/8': {
    label: '7/8',
    numerator: 7,
    denominator: 8,
    pulseCount: 7,
    pulseUnit: 'eighth',
    pulseName: 'Eighth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: EIGHTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
    ],
    defaultFeelId: '2+2+3',
    defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  },
  '8/8': {
    label: '8/8',
    numerator: 8,
    denominator: 8,
    pulseCount: 8,
    pulseUnit: 'eighth',
    pulseName: 'Eighth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: EIGHTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+2', '3+3+2', [3, 3, 2]),
      feel('2+3+3', '2+3+3', [2, 3, 3]),
      feel('3+2+3', '3+2+3', [3, 2, 3]),
      feel('2+2+2+2', '2+2+2+2', [2, 2, 2, 2]),
    ],
    defaultFeelId: '3+3+2',
    defaultAccentLevels: accentsFromGrouping([3, 3, 2]),
  },
  '10/8': {
    label: '10/8',
    numerator: 10,
    denominator: 8,
    pulseCount: 10,
    pulseUnit: 'eighth',
    pulseName: 'Eighth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: EIGHTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+2+2', '3+3+2+2', [3, 3, 2, 2]),
      feel('2+3+3+2', '2+3+3+2', [2, 3, 3, 2]),
      feel('3+2+3+2', '3+2+3+2', [3, 2, 3, 2]),
      feel('2+2+2+2+2', '2+2+2+2+2', [2, 2, 2, 2, 2]),
      feel('5+5', '5+5', [5, 5]),
      feel('2+2+3+3', '2+2+3+3', [2, 2, 3, 3]),
    ],
    defaultFeelId: '3+3+2+2',
    defaultAccentLevels: accentsFromGrouping([3, 3, 2, 2]),
  },
  '11/8': {
    label: '11/8',
    numerator: 11,
    denominator: 8,
    pulseCount: 11,
    pulseUnit: 'eighth',
    pulseName: 'Eighth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: EIGHTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+3+2', '3+3+3+2', [3, 3, 3, 2]),
      feel('3+3+2+3', '3+3+2+3', [3, 3, 2, 3]),
      feel('2+3+3+3', '2+3+3+3', [2, 3, 3, 3]),
      feel('3+2+3+3', '3+2+3+3', [3, 2, 3, 3]),
      feel('2+2+3+2+2', '2+2+3+2+2', [2, 2, 3, 2, 2]),
    ],
    defaultFeelId: '3+3+3+2',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2]),
  },
  '3/16': {
    label: '3/16',
    numerator: 3,
    denominator: 16,
    pulseCount: 3,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  },
  '5/16': {
    label: '5/16',
    numerator: 5,
    denominator: 16,
    pulseCount: 5,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2',
    defaultAccentLevels: accentsFromGrouping([3, 2]),
  },
  '7/16': {
    label: '7/16',
    numerator: 7,
    denominator: 16,
    pulseCount: 7,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
    ],
    defaultFeelId: '2+2+3',
    defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  },
  '9/16': {
    label: '9/16',
    numerator: 9,
    denominator: 16,
    pulseCount: 9,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+3', '3+3+3', [3, 3, 3]),
      feel('2+2+2+3', '2+2+2+3', [2, 2, 2, 3]),
    ],
    defaultFeelId: '3+3+3',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3]),
  },
  '11/16': {
    label: '11/16',
    numerator: 11,
    denominator: 16,
    pulseCount: 11,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+3+2', '3+3+3+2', [3, 3, 3, 2]),
      feel('2+3+3+3', '2+3+3+3', [2, 3, 3, 3]),
    ],
    defaultFeelId: '3+3+3+2',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2]),
  },
  '13/16': {
    label: '13/16',
    numerator: 13,
    denominator: 16,
    pulseCount: 13,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+3+2+2', '3+3+3+2+2', [3, 3, 3, 2, 2]),
      feel('2+3+3+3+2', '2+3+3+3+2', [2, 3, 3, 3, 2]),
    ],
    defaultFeelId: '3+3+3+2+2',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2, 2]),
  },
  '15/16': {
    label: '15/16',
    numerator: 15,
    denominator: 16,
    pulseCount: 15,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    feelOptions: [
      feel('3+3+3+3+3', '3+3+3+3+3', [3, 3, 3, 3, 3]),
      feel('2+2+3+2+2+2+2', '2+2+3+2+2+2+2', [2, 2, 3, 2, 2, 2, 2]),
    ],
    defaultFeelId: '3+3+3+3+3',
    defaultAccentLevels: accentsFromGrouping([3, 3, 3, 3, 3]),
  },
  '16/16': {
    label: '16/16',
    numerator: 16,
    denominator: 16,
    pulseCount: 16,
    pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth',
    compound: false,
    defaultSubdivision: 'off',
    availableSubdivisions: SIXTEENTH_PULSE_SUBDIVS,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak', 'medium', 'weak', 'medium', 'weak', 'medium', 'weak', 'medium', 'weak', 'medium', 'weak', 'medium', 'weak'],
  },
}

export function getTimeSignatureDefinition(meter: MetronomeMeter): TimeSignatureDefinition {
  return TIME_SIGNATURE_DEFINITIONS[meter]
}

export function getFeelOption(
  meter: MetronomeMeter,
  feelId: string | undefined,
): BeatFeelOption | undefined {
  const def = TIME_SIGNATURE_DEFINITIONS[meter]
  if (!def.feelOptions?.length) return undefined
  const resolvedId = feelId ?? def.defaultFeelId
  return def.feelOptions.find((option) => option.id === resolvedId) ?? def.feelOptions[0]
}

export function getDefaultFeelId(meter: MetronomeMeter): string | undefined {
  return TIME_SIGNATURE_DEFINITIONS[meter].defaultFeelId
}

export function getAccentLevelsForMeter(
  meter: MetronomeMeter,
  feelId?: string,
): MetronomeAccentLevel[] {
  const def = TIME_SIGNATURE_DEFINITIONS[meter]
  const feelOption = getFeelOption(meter, feelId)
  if (feelOption) {
    return accentsFromGrouping(feelOption.grouping)
  }
  return [...def.defaultAccentLevels]
}

export function getBeatGrouping(meter: MetronomeMeter, feelId?: string): number[] {
  const feelOption = getFeelOption(meter, feelId)
  if (feelOption) return feelOption.grouping
  const def = TIME_SIGNATURE_DEFINITIONS[meter]
  return Array.from({ length: def.pulseCount }, () => 1)
}
