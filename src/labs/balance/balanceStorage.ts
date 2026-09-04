import { clampWrittenMidi, getBalanceInstrument } from './balanceMusic'
import { isBalanceCharacterId, type BalanceCharacterId } from './balanceCharacters'
import type {
  BalanceCustomRoutine,
  BalanceNoteResult,
  BalanceRoutineResult,
  BalanceSettings,
  BalanceStoredDataV1,
  BalanceStoredPersonalBest,
} from './balanceTypes'

export const BALANCE_STORAGE_KEY = 'besttake:balance'
const MAX_ROUTINE_SUMMARIES = 30

export function createDefaultBalanceSettings(
  instrumentId: string,
  /** The character chosen on the Games menu, when the player has picked one. */
  characterId: BalanceCharacterId = 'balancer',
): BalanceSettings {
  const instrument = getBalanceInstrument(instrumentId)
  const defaultMidi = clampWrittenMidi(72, instrument)
  return {
    routineType: 'single',
    instrumentId: instrument.id,
    characterId,
    single: { writtenMidi: defaultMidi, repetitions: 3 },
    scale: {
      rootWrittenMidi: defaultMidi,
      scaleType: 'major',
      direction: 'ascending',
      octaveRange: 1,
      repetitions: 1,
    },
    selectedCustomRoutineId: null,
    goalMode: 'fixed',
    goalSeconds: 10,
    tolerancePreset: 'standard',
    customToleranceCents: 10,
    soundRest: {
      referencePitch: true,
      continuousDrone: false,
      volume: 0.6,
      countIn: false,
      restDuration: 'matchGoal',
      autoAdvance: true,
    },
  }
}

function createEmptyData(instrumentId: string, characterId?: BalanceCharacterId): BalanceStoredDataV1 {
  return {
    version: 1,
    settings: createDefaultBalanceSettings(instrumentId, characterId),
    customRoutines: [],
    personalBests: {},
    routineSummaries: [],
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function normalizeSettings(
  value: unknown,
  instrumentId: string,
  characterId?: BalanceCharacterId,
): BalanceSettings {
  const defaults = createDefaultBalanceSettings(instrumentId, characterId)
  if (!value || typeof value !== 'object') return defaults
  const source = value as Partial<BalanceSettings>
  const instrument = getBalanceInstrument(
    typeof source.instrumentId === 'string' ? source.instrumentId : defaults.instrumentId,
  )
  const single = source.single ?? defaults.single
  const scale = source.scale ?? defaults.scale
  const soundRest = source.soundRest ?? defaults.soundRest
  const goalSeconds = [5, 8, 10, 15].includes(Number(source.goalSeconds))
    ? (Number(source.goalSeconds) as 5 | 8 | 10 | 15)
    : defaults.goalSeconds
  const restDuration =
    soundRest.restDuration === 'matchGoal' ||
    soundRest.restDuration === 'manual' ||
    soundRest.restDuration === 5 ||
    soundRest.restDuration === 10
      ? soundRest.restDuration
      : defaults.soundRest.restDuration
  const octaveRange = scale.octaveRange === 2 ? 2 : 1
  const maxScaleRoot = Math.max(
    instrument.minWrittenMidi,
    instrument.maxWrittenMidi - octaveRange * 12,
  )

  return {
    routineType:
      source.routineType === 'scale' || source.routineType === 'custom'
        ? source.routineType
        : 'single',
    instrumentId: instrument.id,
    characterId: isBalanceCharacterId(source.characterId) ? source.characterId : defaults.characterId,
    single: {
      writtenMidi: clampWrittenMidi(finiteNumber(single.writtenMidi, defaults.single.writtenMidi), instrument),
      repetitions: Math.max(1, Math.min(12, Math.round(finiteNumber(single.repetitions, 3)))),
    },
    scale: {
      rootWrittenMidi: Math.min(
        clampWrittenMidi(finiteNumber(scale.rootWrittenMidi, defaults.scale.rootWrittenMidi), instrument),
        maxScaleRoot,
      ),
      scaleType:
        scale.scaleType === 'naturalMinor' ||
        scale.scaleType === 'harmonicMinor' ||
        scale.scaleType === 'melodicMinor' ||
        scale.scaleType === 'chromatic'
          ? scale.scaleType
          : 'major',
      direction:
        scale.direction === 'descending' || scale.direction === 'upDown'
          ? scale.direction
          : 'ascending',
      octaveRange,
      repetitions: Math.max(1, Math.min(6, Math.round(finiteNumber(scale.repetitions, 1)))),
    },
    selectedCustomRoutineId:
      typeof source.selectedCustomRoutineId === 'string' ? source.selectedCustomRoutineId : null,
    goalMode: source.goalMode === 'personalBest' ? 'personalBest' : 'fixed',
    goalSeconds,
    tolerancePreset:
      source.tolerancePreset === 'beginner' ||
      source.tolerancePreset === 'precision' ||
      source.tolerancePreset === 'custom'
        ? source.tolerancePreset
        : 'standard',
    customToleranceCents: Math.max(3, Math.min(30, finiteNumber(source.customToleranceCents, 10))),
    soundRest: {
      referencePitch: soundRest.referencePitch !== false,
      continuousDrone: soundRest.continuousDrone === true,
      volume: Math.max(0.05, Math.min(1, finiteNumber(soundRest.volume, 0.6))),
      countIn: soundRest.countIn === true,
      restDuration,
      autoAdvance: soundRest.autoAdvance !== false,
    },
  }
}

function normalizeCustomRoutine(value: unknown): BalanceCustomRoutine | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<BalanceCustomRoutine>
  if (typeof source.id !== 'string' || typeof source.name !== 'string' || !Array.isArray(source.notes)) {
    return null
  }
  const notes = source.notes
    .map((note, index) => {
      if (!note || typeof note !== 'object') return null
      const item = note as { id?: unknown; writtenMidi?: unknown }
      const writtenMidi = Number(item.writtenMidi)
      if (!Number.isFinite(writtenMidi)) return null
      return {
        id: typeof item.id === 'string' ? item.id : `${source.id}-note-${index}`,
        writtenMidi: Math.round(writtenMidi),
      }
    })
    .filter((note): note is NonNullable<typeof note> => note !== null)
  if (notes.length === 0) return null
  return {
    id: source.id,
    name: source.name.trim() || 'Custom routine',
    notes,
    createdAt: finiteNumber(source.createdAt, Date.now()),
    updatedAt: finiteNumber(source.updatedAt, Date.now()),
  }
}

function normalizePersonalBests(value: unknown): Record<string, BalanceStoredPersonalBest> {
  if (!value || typeof value !== 'object') return {}
  return Object.entries(value).reduce<Record<string, BalanceStoredPersonalBest>>((result, [key, item]) => {
    if (!item || typeof item !== 'object') return result
    const source = item as Partial<BalanceStoredPersonalBest>
    const balancedMs = Number(source.balancedMs)
    if (!Number.isFinite(balancedMs) || balancedMs <= 0) return result
    result[key] = {
      key,
      balancedMs,
      updatedAt: finiteNumber(source.updatedAt, Date.now()),
    }
    return result
  }, {})
}

export function loadBalanceData(
  instrumentId: string,
  characterId?: BalanceCharacterId,
): BalanceStoredDataV1 {
  const fallback = createEmptyData(instrumentId, characterId)
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(BALANCE_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<BalanceStoredDataV1>
    if (parsed.version !== 1) return fallback
    return {
      version: 1,
      settings: normalizeSettings(parsed.settings, instrumentId, characterId),
      customRoutines: Array.isArray(parsed.customRoutines)
        ? parsed.customRoutines.map(normalizeCustomRoutine).filter((item): item is BalanceCustomRoutine => item !== null)
        : [],
      personalBests: normalizePersonalBests(parsed.personalBests),
      routineSummaries: Array.isArray(parsed.routineSummaries)
        ? parsed.routineSummaries.slice(0, MAX_ROUTINE_SUMMARIES)
        : [],
    }
  } catch {
    return fallback
  }
}

export function saveBalanceData(data: BalanceStoredDataV1): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify({ ...data, version: 1 }))
  } catch {
    /* Private browsing and quota errors must never block play. */
  }
}

/**
 * Follow the character chosen on the Games menu.
 *
 * Only rewrites settings that already exist: writing a fresh blob here would
 * also stamp in a default instrument, and Balance's instrument comes from the
 * tuner rather than from this file. With no saved settings there is nothing to
 * correct anyway — the menu's character is passed in as the default instead.
 */
export function applyBalanceCharacter(characterId: BalanceCharacterId): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(BALANCE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<BalanceStoredDataV1>
    if (parsed.version !== 1 || !parsed.settings) return
    localStorage.setItem(
      BALANCE_STORAGE_KEY,
      JSON.stringify({ ...parsed, settings: { ...parsed.settings, characterId } }),
    )
  } catch {
    /* Private browsing and quota errors must never block play. */
  }
}

export function toleranceCentsForSettings(settings: BalanceSettings): number {
  if (settings.tolerancePreset === 'beginner') return 15
  if (settings.tolerancePreset === 'precision') return 5
  if (settings.tolerancePreset === 'custom') return settings.customToleranceCents
  return 10
}

export function personalBestKey(result: Pick<BalanceNoteResult, 'target' | 'toleranceCents'>): string {
  return `${result.target.instrumentId}:${result.target.writtenMidi}:${result.target.concertMidi}:${result.toleranceCents}`
}

export function recordBalanceResult(
  data: BalanceStoredDataV1,
  result: BalanceRoutineResult,
): BalanceStoredDataV1 {
  const personalBests = { ...data.personalBests }
  for (const noteResult of result.noteResults) {
    if (noteResult.balancedMs <= 0) continue
    const key = personalBestKey(noteResult)
    const current = personalBests[key]?.balancedMs ?? 0
    if (noteResult.balancedMs > current) {
      personalBests[key] = { key, balancedMs: noteResult.balancedMs, updatedAt: Date.now() }
    }
  }
  return {
    ...data,
    personalBests,
    routineSummaries: [result, ...data.routineSummaries].slice(0, MAX_ROUTINE_SUMMARIES),
  }
}

export function getBalanceBestMs(data: BalanceStoredDataV1): number {
  return Math.max(0, ...Object.values(data.personalBests).map((best) => best.balancedMs))
}

export function formatBalanceDuration(ms: number, tenths = true): string {
  const seconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  if (minutes === 0) return tenths ? `${remainder.toFixed(1)}s` : `${Math.round(remainder)}s`
  return `${minutes}:${remainder.toFixed(tenths ? 1 : 0).padStart(tenths ? 4 : 2, '0')}`
}

export function loadBalanceBestMs(): number {
  return getBalanceBestMs(loadBalanceData('concert'))
}
