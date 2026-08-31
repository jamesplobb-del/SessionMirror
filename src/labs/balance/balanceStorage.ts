import { clampWrittenMidi, getBalanceInstrument } from './balanceMusic'
import { isBalanceCharacterId } from './balanceCharacters'
import { awardBalanceTrophies, isBalanceTrophyId } from './balanceTrophies'
import { balanceStarsForRun, getBalanceLevel } from './balanceLevels'
import { balanceCompleteDaily } from './balanceDaily'
import type {
  BalanceCustomRoutine,
  BalanceDailyProgress,
  BalanceLaunch,
  BalanceLevelProgress,
  BalanceNoteResult,
  BalanceRoutineResult,
  BalanceSettings,
  BalanceStoredDataV3,
  BalanceStoredPersonalBest,
  BalanceStoredTrophy,
} from './balanceTypes'

export const BALANCE_STORAGE_KEY = 'besttake:balance'
const MAX_ROUTINE_SUMMARIES = 30

export function createDefaultBalanceSettings(instrumentId: string): BalanceSettings {
  const instrument = getBalanceInstrument(instrumentId)
  const defaultMidi = clampWrittenMidi(72, instrument)
  return {
    routineType: 'single',
    instrumentId: instrument.id,
    characterId: 'balancer',
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
      // No volume control in the UI any more — the reference tone is either on
      // or it isn't, so it plays at full level.
      volume: 1,
      countIn: false,
      restDuration: 'matchGoal',
      autoAdvance: true,
    },
  }
}

const EMPTY_DAILY: BalanceDailyProgress = {
  lastCompletedDate: null,
  streak: 0,
  longestStreak: 0,
  totalCompleted: 0,
}

function createEmptyData(instrumentId: string): BalanceStoredDataV3 {
  return {
    version: 3,
    settings: createDefaultBalanceSettings(instrumentId),
    customRoutines: [],
    personalBests: {},
    routineSummaries: [],
    trophies: {},
    unlockedCharacterIds: ['balancer', 'trumpeter'],
    levels: {},
    daily: { ...EMPTY_DAILY },
  }
}

function normalizeLevels(value: unknown): Record<string, BalanceLevelProgress> {
  if (!value || typeof value !== 'object') return {}
  return Object.entries(value).reduce<Record<string, BalanceLevelProgress>>((result, [id, item]) => {
    if (!getBalanceLevel(id) || !item || typeof item !== 'object') return result
    const source = item as Partial<BalanceLevelProgress>
    const stars = Math.max(0, Math.min(3, Math.round(finiteNumber(source.stars, 0))))
    if (stars === 0) return result
    result[id] = {
      stars,
      bestCenteredPercent: Math.max(0, Math.min(100, finiteNumber(source.bestCenteredPercent, 0))),
      bestBalancedMs: Math.max(0, finiteNumber(source.bestBalancedMs, 0)),
      clearedAt: finiteNumber(source.clearedAt, Date.now()),
    }
    return result
  }, {})
}

function normalizeDaily(value: unknown): BalanceDailyProgress {
  if (!value || typeof value !== 'object') return { ...EMPTY_DAILY }
  const source = value as Partial<BalanceDailyProgress>
  const streak = Math.max(0, Math.round(finiteNumber(source.streak, 0)))
  return {
    lastCompletedDate:
      typeof source.lastCompletedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.lastCompletedDate)
        ? source.lastCompletedDate
        : null,
    streak,
    longestStreak: Math.max(streak, Math.round(finiteNumber(source.longestStreak, streak))),
    totalCompleted: Math.max(0, Math.round(finiteNumber(source.totalCompleted, 0))),
  }
}

function finiteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function normalizeSettings(value: unknown, instrumentId: string): BalanceSettings {
  const defaults = createDefaultBalanceSettings(instrumentId)
  if (!value || typeof value !== 'object') return defaults
  const source = value as Partial<BalanceSettings>
  const instrument = getBalanceInstrument(
    typeof source.instrumentId === 'string' ? source.instrumentId : defaults.instrumentId,
  )
  const single = source.single ?? defaults.single
  const scale = source.scale ?? defaults.scale
  const soundRest = source.soundRest ?? defaults.soundRest
  const goalSeconds = Math.max(3, Math.min(60, Math.round(finiteNumber(source.goalSeconds, defaults.goalSeconds))))
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
      // Ignore any stored value: the slider is gone, so migrate everyone to full.
      volume: 1,
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

function normalizeTrophies(value: unknown): BalanceStoredDataV3['trophies'] {
  if (!value || typeof value !== 'object') return {}
  return Object.entries(value).reduce<BalanceStoredDataV3['trophies']>((result, [key, item]) => {
    if (!isBalanceTrophyId(key) || !item || typeof item !== 'object') return result
    const source = item as Partial<BalanceStoredTrophy>
    result[key] = { id: key, unlockedAt: finiteNumber(source.unlockedAt, Date.now()) }
    return result
  }, {})
}

export function loadBalanceData(instrumentId: string): BalanceStoredDataV3 {
  const fallback = createEmptyData(instrumentId)
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(BALANCE_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) return fallback
    const settings = normalizeSettings(parsed.settings, instrumentId)
    const summaries: BalanceRoutineResult[] = Array.isArray(parsed.routineSummaries)
      ? (parsed.routineSummaries as BalanceRoutineResult[]).slice(0, MAX_ROUTINE_SUMMARIES).map((summary): BalanceRoutineResult => ({
          ...summary,
          routineType:
            summary.routineType === 'scale' || summary.routineType === 'custom'
              ? summary.routineType
              : 'single',
        }))
      : []
    const persistedUnlocked = Array.isArray(parsed.unlockedCharacterIds)
      ? parsed.unlockedCharacterIds.filter(isBalanceCharacterId)
      : []
    // Version 1 exposed every character. Preserve the player's current choice
    // when migrating so adding rewards never takes a cosmetic away.
    const unlockedCharacterIds = new Set([
      'balancer' as const,
      'trumpeter' as const,
      ...persistedUnlocked,
      ...(parsed.version === 1 ? [settings.characterId] : []),
    ])
    const base: BalanceStoredDataV3 = {
      version: 3,
      settings,
      customRoutines: Array.isArray(parsed.customRoutines)
        ? parsed.customRoutines.map(normalizeCustomRoutine).filter((item): item is BalanceCustomRoutine => item !== null)
        : [],
      personalBests: normalizePersonalBests(parsed.personalBests),
      routineSummaries: summaries,
      trophies: normalizeTrophies(parsed.trophies),
      unlockedCharacterIds: [...unlockedCharacterIds],
      levels: normalizeLevels(parsed.levels),
      daily: normalizeDaily(parsed.daily),
    }
    return awardBalanceTrophies(base).data
  } catch {
    return fallback
  }
}

export function saveBalanceData(data: BalanceStoredDataV3): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify({ ...data, version: 3 }))
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

/**
 * Fold a finished run into the trail: stars for a level, a tick for the day's
 * challenge. Stars only ever go up — replaying a level for a better score can
 * never take away the three you already earned.
 */
export function recordBalanceLaunch(
  data: BalanceStoredDataV3,
  launch: BalanceLaunch,
  result: BalanceRoutineResult,
): { data: BalanceStoredDataV3; earnedStars: number; previousStars: number } {
  if (launch.kind === 'level' && launch.id) {
    const level = getBalanceLevel(launch.id)
    if (!level) return { data, earnedStars: 0, previousStars: 0 }
    const earnedStars = balanceStarsForRun(level, result.completed, result.centeredPercent)
    const previous = data.levels[launch.id]
    const previousStars = previous?.stars ?? 0
    if (earnedStars === 0) return { data, earnedStars, previousStars }
    return {
      data: {
        ...data,
        levels: {
          ...data.levels,
          [launch.id]: {
            stars: Math.max(previousStars, earnedStars),
            bestCenteredPercent: Math.max(previous?.bestCenteredPercent ?? 0, result.centeredPercent),
            bestBalancedMs: Math.max(previous?.bestBalancedMs ?? 0, result.totalBalancedMs),
            clearedAt: previous?.clearedAt ?? Date.now(),
          },
        },
      },
      earnedStars,
      previousStars,
    }
  }

  if (launch.kind === 'daily' && launch.id && result.completed) {
    return {
      data: { ...data, daily: balanceCompleteDaily(data.daily, launch.id) },
      earnedStars: 0,
      previousStars: 0,
    }
  }

  return { data, earnedStars: 0, previousStars: 0 }
}

export function recordBalanceResult(
  data: BalanceStoredDataV3,
  result: BalanceRoutineResult,
): BalanceStoredDataV3 {
  const personalBests = { ...data.personalBests }
  for (const noteResult of result.noteResults) {
    if (noteResult.balancedMs <= 0) continue
    const key = personalBestKey(noteResult)
    const current = personalBests[key]?.balancedMs ?? 0
    if (noteResult.balancedMs > current) {
      personalBests[key] = { key, balancedMs: noteResult.balancedMs, updatedAt: Date.now() }
    }
  }
  const next: BalanceStoredDataV3 = {
    ...data,
    personalBests,
    routineSummaries: [result, ...data.routineSummaries].slice(0, MAX_ROUTINE_SUMMARIES),
  }
  return awardBalanceTrophies(next).data
}

export function getBalanceBestMs(data: BalanceStoredDataV3): number {
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
