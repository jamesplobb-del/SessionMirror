import {
  getAccentLevelsForMeter,
  getBeatGrouping,
  getDefaultFeelId,
  getFeelOption,
  getTimeSignatureDefinition,
  TIME_SIGNATURE_DEFINITIONS,
  type MetronomeAccentLevel,
  type MetronomeMeter,
} from '../metronome/timeSignatureDefinitions'
import { getPulseModeById, METER_PULSE_MODES } from '../metronome/pulseModes'
import { resolvePulseTiming } from '../metronome/pulseResolution'
import {
  accentLevelsToLegacyPattern,
  getPulseLabel,
  getSubdivisionLabel,
  isSubdivisionAvailable,
  legacyPatternToAccentLevels,
  resolveClickTier,
  secondsPerSchedulerTick,
  suggestSubdivisionForMeterChange,
  subTicksPerPulse,
  ticksPerBar,
  ticksPerPulse,
} from '../metronome/metronomeTiming'
import type { MetronomeClickTier, MetronomeSubdivision } from '../metronome/metronomeTypes'

export type { MetronomeMeter, MetronomeAccentLevel } from '../metronome/timeSignatureDefinitions'
export type { MetronomeClickTier, MetronomeSubdivision } from '../metronome/metronomeTypes'

export {
  getAccentLevelsForMeter,
  getBeatGrouping,
  getDefaultFeelId,
  getFeelOption,
  getTimeSignatureDefinition,
  TIME_SIGNATURE_DEFINITIONS,
}

export {
  accentLevelsToLegacyPattern,
  getPulseLabel,
  getSubdivisionLabel,
  isSubdivisionAvailable,
  legacyPatternToAccentLevels,
  resolveClickTier,
  secondsPerSchedulerTick,
  suggestSubdivisionForMeterChange,
  subTicksPerPulse,
  ticksPerBar,
  ticksPerPulse,
}

export type MetronomeMeterGroup = 'simple' | 'compound' | 'odd' | 'sixteenth' | 'cut-time'

export interface MetronomeMeterDef {
  label: string
  numerator: number
  denominator: number
  beatsPerBar: number
  group: MetronomeMeterGroup
  pulseName: string
  compound: boolean
}

function meterGroup(meter: MetronomeMeter): MetronomeMeterGroup {
  const def = getTimeSignatureDefinition(meter)
  if (def.compound) return 'compound'
  if (def.denominator === 16) return 'sixteenth'
  if (def.denominator === 8 && def.pulseUnit === 'eighth') return 'odd'
  if (def.denominator === 2) return 'cut-time'
  return 'simple'
}

export const METRONOME_METERS: Record<MetronomeMeter, MetronomeMeterDef> = Object.fromEntries(
  (Object.keys(TIME_SIGNATURE_DEFINITIONS) as MetronomeMeter[]).map((meter) => {
    const def = TIME_SIGNATURE_DEFINITIONS[meter]
    return [
      meter,
      {
        label: def.label,
        numerator: def.numerator,
        denominator: def.denominator,
        beatsPerBar: def.pulseCount,
        group: meterGroup(meter),
        pulseName: def.pulseName,
        compound: def.compound,
      },
    ]
  }),
) as Record<MetronomeMeter, MetronomeMeterDef>

export const SIMPLE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4']
export const COMPOUND_METERS: MetronomeMeter[] = ['6/8', '9/8', '12/8']
export const AUDIO_STAGE_METERS: MetronomeMeter[] = ['2/4', '3/4', '4/4', '5/4', '6/8']

export const MIN_BPM = 1
export const MAX_BPM = 400
export const DEFAULT_BPM = 120
export const DEFAULT_METER: MetronomeMeter = '4/4'
export const DEFAULT_SUBDIVISION: MetronomeSubdivision = 'off'

export const METRONOME_SUBDIVISIONS: { value: MetronomeSubdivision; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '8ths', label: '8ths' },
  { value: 'triplets', label: 'Triplets' },
  { value: '16ths', label: '16ths' },
]

export const STAGE_SUBDIVISIONS: { value: MetronomeSubdivision; label: string }[] = [
  { value: 'off', label: 'Pulse' },
  { value: '8ths', label: 'Eighth Notes' },
  { value: 'triplets', label: 'Triplets' },
  { value: '16ths', label: 'Sixteenth Notes' },
]

export const AUDIO_STAGE_METRONOME_SOUNDS = [{ id: 'classic', label: 'Classic' }] as const

const STORAGE_KEY = 'sessionmirror:metronome-prefs'

export interface MetronomePrefs {
  bpm: number
  meter: MetronomeMeter
  subdivision: MetronomeSubdivision
  feelId?: string
  pulseModeId?: string
  accentLevels: MetronomeAccentLevel[]
  /** @deprecated Migrated to accentLevels on load. */
  accentPattern?: boolean[]
  soundId: string
}

const DEFAULT_SOUND_ID = 'classic'

const VALID_SUBDIVISIONS = new Set<MetronomeSubdivision>([
  'off',
  '8ths',
  'triplets',
  '16ths',
  'dotted',
  'quints',
  'septuplets',
])

function defaultMetronomePrefs(): MetronomePrefs {
  const defaults = getMeterDefaults(DEFAULT_METER)
  return {
    bpm: DEFAULT_BPM,
    meter: DEFAULT_METER,
    subdivision: defaults.subdivision,
    feelId: defaults.feelId,
    pulseModeId: defaults.pulseModeId,
    accentLevels: getAccentLevelsForMeter(DEFAULT_METER, defaults.feelId, defaults.pulseModeId),
    soundId: DEFAULT_SOUND_ID,
  }
}

export function getDefaultAccentLevels(
  meter: MetronomeMeter,
  feelId?: string,
  pulseModeId?: string,
): MetronomeAccentLevel[] {
  return getAccentLevelsForMeter(meter, feelId, pulseModeId)
}

/** @deprecated Use getDefaultAccentLevels */
export function getDefaultAccentPattern(meter: MetronomeMeter, feelId?: string): boolean[] {
  return accentLevelsToLegacyPattern(getDefaultAccentLevels(meter, feelId))
}

export function normalizeAccentLevels(
  meter: MetronomeMeter,
  levels: MetronomeAccentLevel[],
  feelId?: string,
  pulseModeId?: string,
): MetronomeAccentLevel[] {
  const pulseCount = getBeatsPerBar(meter, pulseModeId)
  const defaults = getDefaultAccentLevels(meter, feelId, pulseModeId)
  return Array.from({ length: pulseCount }, (_, index) => levels[index] ?? defaults[index] ?? 'weak')
}

/** @deprecated Use normalizeAccentLevels */
export function normalizeAccentPattern(meter: MetronomeMeter, pattern: boolean[]): boolean[] {
  const levels = legacyPatternToAccentLevels(meter, pattern)
  return accentLevelsToLegacyPattern(levels)
}

function parseAccentLevels(
  meter: MetronomeMeter,
  feelId: string | undefined,
  pulseModeId: string | undefined,
  parsed: Partial<MetronomePrefs> & { accentFirstBeat?: boolean },
): MetronomeAccentLevel[] {
  if (Array.isArray(parsed.accentLevels) && parsed.accentLevels.length > 0) {
    return normalizeAccentLevels(meter, parsed.accentLevels, feelId, pulseModeId)
  }
  if (Array.isArray(parsed.accentPattern)) {
    return legacyPatternToAccentLevels(meter, parsed.accentPattern, feelId)
  }
  const defaults = getDefaultAccentLevels(meter, feelId, pulseModeId)
  if (typeof parsed.accentFirstBeat === 'boolean' && defaults.length > 0) {
    defaults[0] = parsed.accentFirstBeat ? 'strong' : 'weak'
  }
  return defaults
}

function parsePulseModeId(meter: MetronomeMeter, value: unknown): string {
  const modes = METER_PULSE_MODES[meter]
  if (typeof value === 'string' && modes.some((mode) => mode.id === value)) {
    return value
  }
  return getMeterDefaults(meter).pulseModeId
}

export function clampBpm(value: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)))
}

function parseMeter(value: unknown): MetronomeMeter {
  if (typeof value === 'string' && value in TIME_SIGNATURE_DEFINITIONS) {
    return value as MetronomeMeter
  }
  return DEFAULT_METER
}

function parseSubdivision(
  value: unknown,
  meter: MetronomeMeter,
  pulseModeId?: string,
): MetronomeSubdivision {
  if (typeof value === 'string' && VALID_SUBDIVISIONS.has(value as MetronomeSubdivision)) {
    const subdivision = value as MetronomeSubdivision
    if (isSubdivisionAvailable(meter, subdivision, getAvailableSubdivisions(meter, pulseModeId))) {
      return subdivision
    }
  }
  return getPulseModeById(meter, pulseModeId).defaultSubdivision
}

function parseFeelId(
  meter: MetronomeMeter,
  value: unknown,
  pulseModeId?: string,
): string | undefined {
  const mode = getPulseModeById(meter, pulseModeId)
  if (!mode.feelOptions?.length) return undefined
  if (typeof value === 'string' && mode.feelOptions.some((option) => option.id === value)) {
    return value
  }
  return mode.defaultFeelId
}

export function subdivisionsPerBeat(subdivision: MetronomeSubdivision): number {
  switch (subdivision) {
    case '8ths':
      return 2
    case 'triplets':
    case 'dotted':
      return 3
    case '16ths':
      return 4
    case 'quints':
      return 5
    case 'septuplets':
      return 7
    default:
      return 1
  }
}

export function loadMetronomePrefs(): MetronomePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultMetronomePrefs()
    }
    const parsed = JSON.parse(raw) as Partial<MetronomePrefs> & { accentFirstBeat?: boolean }
    const meter = parseMeter(parsed.meter)
    const pulseModeId = parsePulseModeId(meter, parsed.pulseModeId)
    const feelId = parseFeelId(meter, parsed.feelId, pulseModeId)
    return {
      bpm: clampBpm(Number(parsed.bpm) || DEFAULT_BPM),
      meter,
      subdivision: parseSubdivision(parsed.subdivision, meter, pulseModeId),
      feelId,
      pulseModeId,
      accentLevels: parseAccentLevels(meter, feelId, pulseModeId, parsed),
      soundId:
        typeof parsed.soundId === 'string' && parsed.soundId.length > 0
          ? parsed.soundId
          : DEFAULT_SOUND_ID,
    }
  } catch {
    return defaultMetronomePrefs()
  }
}

export function saveMetronomePrefs(prefs: MetronomePrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        bpm: clampBpm(prefs.bpm),
        meter: prefs.meter,
        subdivision: prefs.subdivision,
        feelId: prefs.feelId,
        pulseModeId: prefs.pulseModeId ?? getMeterDefaults(prefs.meter).pulseModeId,
        accentLevels: normalizeAccentLevels(
          prefs.meter,
          prefs.accentLevels,
          prefs.feelId,
          prefs.pulseModeId,
        ),
        soundId: prefs.soundId,
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

export function getMeterDef(meter: MetronomeMeter): MetronomeMeterDef {
  return METRONOME_METERS[meter]
}

export function getBeatsPerBar(meter: MetronomeMeter, pulseModeId?: string): number {
  return getPulseModeById(meter, pulseModeId).pulseCount
}

export function isCompoundMeter(meter: MetronomeMeter, pulseModeId?: string): boolean {
  return getPulseModeById(meter, pulseModeId).compound
}

/** Odd /8 meters (5/8, 7/8, …) — natural pulse is eighth notes. */
export function isSimpleEighthMeter(meter: MetronomeMeter): boolean {
  const def = getTimeSignatureDefinition(meter)
  return def.denominator === 8 && def.pulseUnit === 'eighth'
}

export function isSixteenthMeter(meter: MetronomeMeter): boolean {
  return getTimeSignatureDefinition(meter).denominator === 16
}

/** @deprecated Timing is data-driven via metronomeTiming. */
export function naturalPulseDivisor(meter: MetronomeMeter): number {
  return ticksPerPulse(meter, 'off')
}

export function getEighthNotesPerBar(meter: MetronomeMeter): number {
  const def = getTimeSignatureDefinition(meter)
  return def.numerator * (8 / def.denominator)
}

export function getCompoundGroupSize(meter: MetronomeMeter): number {
  const def = getTimeSignatureDefinition(meter)
  if (!def.compound) return 1
  return ticksPerPulse(meter, '8ths')
}

export function getAvailableSubdivisions(
  meter: MetronomeMeter,
  pulseModeId?: string,
): MetronomeSubdivision[] {
  return getPulseModeById(meter, pulseModeId).availableSubdivisions
}

export function hasFeelOptions(meter: MetronomeMeter, pulseModeId?: string): boolean {
  const mode = getPulseModeById(meter, pulseModeId)
  return Boolean(mode.feelOptions?.length)
}

export function resolveClickTierWithAccents(
  meter: MetronomeMeter,
  tickIndexInBar: number,
  subdivision: MetronomeSubdivision,
  accentLevels: MetronomeAccentLevel[],
  pulseCount?: number,
): MetronomeClickTier | null {
  const count = pulseCount ?? getBeatsPerBar(meter)
  return resolveClickTier({ meter, subdivision, accentLevels, pulseCount: count }, tickIndexInBar)
}

/** @deprecated Use resolveClickTierWithAccents with accentLevels */
export function getAccentedMainBeatTier(
  beatIndexInBar: number,
  accentPattern: boolean[],
): MetronomeClickTier {
  if (!accentPattern[beatIndexInBar]) return 'subdivision'
  return beatIndexInBar === 0 ? 'downbeat' : 'macro'
}

/** @deprecated Compound click tiers are resolved via resolveClickTier */
export function getCompoundClickTier(_eighthIndexInBar: number): MetronomeClickTier {
  return 'subdivision'
}

/** @deprecated */
export function getSimpleClickTier(beatIndexInBar: number): MetronomeClickTier {
  return beatIndexInBar === 0 ? 'downbeat' : 'subdivision'
}

export function getMeterDefaults(
  meter: MetronomeMeter,
  pulseModeId?: string,
): {
  subdivision: MetronomeSubdivision
  feelId?: string
  accentLevels: MetronomeAccentLevel[]
  pulseModeId: string
} {
  const mode = getPulseModeById(meter, pulseModeId)
  const feelId = mode.defaultFeelId
  return {
    subdivision: mode.defaultSubdivision,
    feelId,
    accentLevels: getAccentLevelsForMeter(meter, feelId, mode.id),
    pulseModeId: mode.id,
  }
}

export function resolveMeterTiming(
  meter: MetronomeMeter,
  options?: {
    pulseModeId?: string
    feelId?: string
    beatGrouping?: number[]
    customAccents?: MetronomeAccentLevel[]
  },
) {
  return resolvePulseTiming({
    meter,
    pulseModeId: options?.pulseModeId,
    feelId: options?.feelId,
    beatGrouping: options?.beatGrouping,
    customAccents: options?.customAccents,
  })
}
