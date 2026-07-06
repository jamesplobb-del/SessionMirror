import type { MetronomeSubdivision } from './metronomeTypes'
import type { BeatFeelOption, MetronomeAccentLevel, MetronomeMeter, PulseUnit } from './timeSignatureDefinitions'

export interface PulseModeDefinition {
  id: string
  label: string
  /** Display symbol for BPM (e.g. ♩ = 120). */
  bpmSymbol: string
  pulseCount: number
  pulseUnit: PulseUnit
  pulseName: string
  compound: boolean
  defaultSubdivision: MetronomeSubdivision
  availableSubdivisions: MetronomeSubdivision[]
  feelOptions?: BeatFeelOption[]
  defaultFeelId?: string
  defaultAccentLevels: MetronomeAccentLevel[]
}

const Q_SUB = ['off', '8ths', 'triplets', '16ths'] as MetronomeSubdivision[]
const H_SUB = ['off', '8ths', 'triplets', '16ths'] as MetronomeSubdivision[]
const C_SUB = ['off', '8ths', 'triplets', '16ths'] as MetronomeSubdivision[]
const E_SUB = ['off', '8ths', 'triplets', '16ths'] as MetronomeSubdivision[]
const S_SUB = ['off', '8ths', 'triplets', '16ths'] as MetronomeSubdivision[]

function feel(id: string, label: string, grouping: number[]): BeatFeelOption {
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

function straightAccents(count: number): MetronomeAccentLevel[] {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return 'strong'
    if (index % 2 === 1) return 'weak'
    return 'medium'
  })
}

/** Canonical pulse modes per meter. First mode is always the default. */
export const METER_PULSE_MODES: Record<MetronomeMeter, PulseModeDefinition[]> = {
  '2/4': [{
    id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 2, pulseUnit: 'quarter', pulseName: 'Quarter',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
    defaultAccentLevels: ['strong', 'weak'],
  }],
  '3/4': [{
    id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 3, pulseUnit: 'quarter', pulseName: 'Quarter',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  }],
  '4/4': [{
    id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 4, pulseUnit: 'quarter', pulseName: 'Quarter',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak'],
  }],
  '5/4': [{
    id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 5, pulseUnit: 'quarter', pulseName: 'Quarter',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2', defaultAccentLevels: accentsFromGrouping([3, 2]),
  }],
  '6/4': [
    {
      id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 6, pulseUnit: 'quarter', pulseName: 'Quarter',
      compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
      feelOptions: [feel('3+3', '3+3', [3, 3])],
      defaultFeelId: '3+3', defaultAccentLevels: accentsFromGrouping([3, 3]),
    },
    {
      id: 'dotted-half', label: 'Dotted half', bpmSymbol: '𝅗𝅥·', pulseCount: 2, pulseUnit: 'dotted-half',
      pulseName: 'Dotted Half', compound: true, defaultSubdivision: '8ths', availableSubdivisions: Q_SUB,
      defaultAccentLevels: ['strong', 'medium'],
    },
  ],
  '7/4': [{
    id: 'default', label: 'Quarter', bpmSymbol: '♩', pulseCount: 7, pulseUnit: 'quarter', pulseName: 'Quarter',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: Q_SUB,
    feelOptions: [
      feel('4+3', '4+3', [4, 3]),
      feel('3+4', '3+4', [3, 4]),
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
    ],
    defaultFeelId: '4+3', defaultAccentLevels: accentsFromGrouping([4, 3]),
  }],
  '2/2': [{
    id: 'default', label: 'Half (cut time)', bpmSymbol: '𝅗𝅥', pulseCount: 2, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    defaultAccentLevels: ['strong', 'weak'],
  }],
  '3/2': [{
    id: 'default', label: 'Half', bpmSymbol: '𝅗𝅥', pulseCount: 3, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  }],
  '4/2': [{
    id: 'default', label: 'Half', bpmSymbol: '𝅗𝅥', pulseCount: 4, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak'],
  }],
  '5/2': [{
    id: 'default', label: 'Half', bpmSymbol: '𝅗𝅥', pulseCount: 5, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2', defaultAccentLevels: accentsFromGrouping([3, 2]),
  }],
  '6/2': [{
    id: 'default', label: 'Half', bpmSymbol: '𝅗𝅥', pulseCount: 6, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    feelOptions: [feel('3+3', '3+3', [3, 3])],
    defaultFeelId: '3+3', defaultAccentLevels: accentsFromGrouping([3, 3]),
  }],
  '7/2': [{
    id: 'default', label: 'Half', bpmSymbol: '𝅗𝅥', pulseCount: 7, pulseUnit: 'half', pulseName: 'Half',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: H_SUB,
    feelOptions: [
      feel('4+3', '4+3', [4, 3]),
      feel('3+4', '3+4', [3, 4]),
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
    ],
    defaultFeelId: '4+3', defaultAccentLevels: accentsFromGrouping([4, 3]),
  }],
  '3/8': [{
    id: 'default', label: 'Eighth', bpmSymbol: '♪', pulseCount: 3, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  }],
  '4/8': [{
    id: 'default', label: 'Eighth', bpmSymbol: '♪', pulseCount: 4, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    defaultAccentLevels: ['strong', 'weak', 'medium', 'weak'],
  }],
  '5/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 5, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2', defaultAccentLevels: accentsFromGrouping([3, 2]),
  }],
  '6/8': [
    {
      id: 'default', label: 'Dotted quarter', bpmSymbol: '♩·', pulseCount: 2, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      feelOptions: [feel('3+3', '3+3', [3, 3])],
      defaultFeelId: '3+3', defaultAccentLevels: accentsFromGrouping([3, 3]),
    },
    {
      id: 'simple-eighth', label: 'Simple eighth', bpmSymbol: '♪', pulseCount: 6, pulseUnit: 'eighth',
      pulseName: 'Eighth', compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
      feelOptions: [feel('3+3', '3+3', [3, 3])],
      defaultFeelId: '3+3', defaultAccentLevels: accentsFromGrouping([3, 3]),
    },
  ],
  '7/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 7, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
    ],
    defaultFeelId: '2+2+3', defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  }],
  '8/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 8, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [
      feel('3+3+2', '3+3+2', [3, 3, 2]),
      feel('2+3+3', '2+3+3', [2, 3, 3]),
      feel('3+2+3', '3+2+3', [3, 2, 3]),
      feel('2+2+2+2', '2+2+2+2', [2, 2, 2, 2]),
    ],
    defaultFeelId: '3+3+2', defaultAccentLevels: accentsFromGrouping([3, 3, 2]),
  }],
  '9/8': [
    {
      id: 'default', label: 'Dotted quarter', bpmSymbol: '♩·', pulseCount: 3, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      feelOptions: [feel('3+3+3', '3+3+3', [3, 3, 3])],
      defaultFeelId: '3+3+3', defaultAccentLevels: accentsFromGrouping([3, 3, 3]),
    },
    {
      id: 'grouped-eighth', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 9, pulseUnit: 'eighth',
      pulseName: 'Eighth', compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
      feelOptions: [
        feel('2+2+2+3', '2+2+2+3', [2, 2, 2, 3]),
        feel('2+2+3+2', '2+2+3+2', [2, 2, 3, 2]),
        feel('2+3+2+2', '2+3+2+2', [2, 3, 2, 2]),
        feel('3+2+2+2', '3+2+2+2', [3, 2, 2, 2]),
      ],
      defaultFeelId: '2+2+2+3', defaultAccentLevels: accentsFromGrouping([2, 2, 2, 3]),
    },
  ],
  '10/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 10, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [
      feel('3+3+2+2', '3+3+2+2', [3, 3, 2, 2]),
      feel('3+2+3+2', '3+2+3+2', [3, 2, 3, 2]),
      feel('2+3+3+2', '2+3+3+2', [2, 3, 3, 2]),
      feel('2+2+3+3', '2+2+3+3', [2, 2, 3, 3]),
      feel('5+5', '5+5', [5, 5]),
    ],
    defaultFeelId: '3+3+2+2', defaultAccentLevels: accentsFromGrouping([3, 3, 2, 2]),
  }],
  '11/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 11, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [
      feel('3+3+3+2', '3+3+3+2', [3, 3, 3, 2]),
      feel('3+3+2+3', '3+3+2+3', [3, 3, 2, 3]),
      feel('3+2+3+3', '3+2+3+3', [3, 2, 3, 3]),
      feel('2+3+3+3', '2+3+3+3', [2, 3, 3, 3]),
    ],
    defaultFeelId: '3+3+3+2', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2]),
  }],
  '12/8': [
    {
      id: 'default', label: 'Dotted quarter', bpmSymbol: '♩·', pulseCount: 4, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      feelOptions: [feel('3+3+3+3', '3+3+3+3', [3, 3, 3, 3])],
      defaultFeelId: '3+3+3+3', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 3]),
    },
    {
      id: 'six-groups', label: 'Six groups (2+2…)', bpmSymbol: '♪', pulseCount: 6, pulseUnit: 'eighth',
      pulseName: 'Grouped Eighth', compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
      feelOptions: [feel('2+2+2+2+2+2', '2+2+2+2+2+2', [2, 2, 2, 2, 2, 2])],
      defaultFeelId: '2+2+2+2+2+2', defaultAccentLevels: accentsFromGrouping([2, 2, 2, 2, 2, 2]),
    },
    {
      id: 'four-threes', label: 'Three groups (4+4+4)', bpmSymbol: '♩·', pulseCount: 3, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      feelOptions: [feel('4+4+4', '4+4+4', [4, 4, 4])],
      defaultFeelId: '4+4+4', defaultAccentLevels: accentsFromGrouping([4, 4, 4]),
    },
  ],
  '13/8': [{
    id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 13, pulseUnit: 'eighth', pulseName: 'Eighth',
    compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
    feelOptions: [
      feel('3+3+3+2', '3+3+3+2', [3, 3, 3, 2]),
      feel('3+3+2+2+3', '3+3+2+2+3', [3, 3, 2, 2, 3]),
      feel('2+2+3+3+3', '2+2+3+3+3', [2, 2, 3, 3, 3]),
    ],
    defaultFeelId: '3+3+3+2', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2]),
  }],
  '15/8': [
    {
      id: 'default', label: 'Grouped eighth', bpmSymbol: '♪', pulseCount: 15, pulseUnit: 'eighth', pulseName: 'Eighth',
      compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
      feelOptions: [
        feel('3+3+3+3+3', '3+3+3+3+3', [3, 3, 3, 3, 3]),
        feel('2+2+2+2+2+2+3', '2+2+2+2+2+2+3', [2, 2, 2, 2, 2, 2, 3]),
      ],
      defaultFeelId: '3+3+3+3+3', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 3, 3]),
    },
    {
      id: 'compound', label: 'Dotted quarter', bpmSymbol: '♩·', pulseCount: 5, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      defaultAccentLevels: ['strong', 'medium', 'medium', 'medium', 'medium'],
    },
  ],
  '16/8': [
    {
      id: 'default', label: 'Traditional (2+2…)', bpmSymbol: '♪', pulseCount: 8, pulseUnit: 'eighth',
      pulseName: 'Grouped Eighth', compound: false, defaultSubdivision: 'off', availableSubdivisions: E_SUB,
      feelOptions: [feel('2+2+2+2+2+2+2+2', '2+2+2+2+2+2+2+2', [2, 2, 2, 2, 2, 2, 2, 2])],
      defaultFeelId: '2+2+2+2+2+2+2+2', defaultAccentLevels: accentsFromGrouping([2, 2, 2, 2, 2, 2, 2, 2]),
    },
    {
      id: 'compound', label: 'Compound (4+4+4+4)', bpmSymbol: '♩·', pulseCount: 4, pulseUnit: 'dotted-quarter',
      pulseName: 'Dotted Quarter', compound: true, defaultSubdivision: '8ths', availableSubdivisions: C_SUB,
      feelOptions: [feel('4+4+4+4', '4+4+4+4', [4, 4, 4, 4])],
      defaultFeelId: '4+4+4+4', defaultAccentLevels: accentsFromGrouping([4, 4, 4, 4]),
    },
  ],
  '3/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 3, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    defaultAccentLevels: ['strong', 'weak', 'weak'],
  }],
  '5/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 5, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [feel('3+2', '3+2', [3, 2]), feel('2+3', '2+3', [2, 3])],
    defaultFeelId: '3+2', defaultAccentLevels: accentsFromGrouping([3, 2]),
  }],
  '7/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 7, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [
      feel('2+2+3', '2+2+3', [2, 2, 3]),
      feel('2+3+2', '2+3+2', [2, 3, 2]),
      feel('3+2+2', '3+2+2', [3, 2, 2]),
    ],
    defaultFeelId: '2+2+3', defaultAccentLevels: accentsFromGrouping([2, 2, 3]),
  }],
  '9/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 9, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [
      feel('3+3+3', '3+3+3', [3, 3, 3]),
      feel('2+2+2+3', '2+2+2+3', [2, 2, 2, 3]),
    ],
    defaultFeelId: '3+3+3', defaultAccentLevels: accentsFromGrouping([3, 3, 3]),
  }],
  '11/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 11, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [feel('3+3+3+2', '3+3+3+2', [3, 3, 3, 2])],
    defaultFeelId: '3+3+3+2', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2]),
  }],
  '13/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 13, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [feel('3+3+3+2+2', '3+3+3+2+2', [3, 3, 3, 2, 2])],
    defaultFeelId: '3+3+3+2+2', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 2, 2]),
  }],
  '15/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 15, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    feelOptions: [feel('3+3+3+3+3', '3+3+3+3+3', [3, 3, 3, 3, 3])],
    defaultFeelId: '3+3+3+3+3', defaultAccentLevels: accentsFromGrouping([3, 3, 3, 3, 3]),
  }],
  '16/16': [{
    id: 'default', label: 'Grouped sixteenth', bpmSymbol: '𝅘𝅥𝅯', pulseCount: 16, pulseUnit: 'sixteenth',
    pulseName: 'Sixteenth', compound: false, defaultSubdivision: 'off', availableSubdivisions: S_SUB,
    defaultAccentLevels: straightAccents(16),
  }],
}

export function getPulseModesForMeter(meter: MetronomeMeter): PulseModeDefinition[] {
  return METER_PULSE_MODES[meter]
}

export function getDefaultPulseMode(meter: MetronomeMeter): PulseModeDefinition {
  return METER_PULSE_MODES[meter][0]
}

export function getPulseModeById(meter: MetronomeMeter, pulseModeId?: string): PulseModeDefinition {
  const modes = METER_PULSE_MODES[meter]
  if (!pulseModeId) return modes[0]
  return modes.find((mode) => mode.id === pulseModeId) ?? modes[0]
}

export function meterHasPulseModeChoice(meter: MetronomeMeter): boolean {
  return METER_PULSE_MODES[meter].length > 1
}

export function accentsForPulseMode(
  mode: PulseModeDefinition,
  feelId?: string,
  beatGrouping?: number[],
): MetronomeAccentLevel[] {
  if (beatGrouping?.length) return accentsFromGrouping(beatGrouping)
  if (mode.feelOptions?.length) {
    const resolvedId = feelId ?? mode.defaultFeelId
    const feelOption = mode.feelOptions.find((option) => option.id === resolvedId) ?? mode.feelOptions[0]
    return accentsFromGrouping(feelOption.grouping)
  }
  return [...mode.defaultAccentLevels]
}

export function feelOptionsForPulseMode(mode: PulseModeDefinition): { id: string; label: string }[] {
  return mode.feelOptions?.map((option) => ({ id: option.id, label: option.label })) ?? []
}
