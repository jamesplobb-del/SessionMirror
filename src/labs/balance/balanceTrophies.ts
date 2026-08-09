import type { BalanceCharacterId } from './balanceCharacters'
import type {
  BalanceRoutineResult,
  BalanceStoredDataV2,
  BalanceTrophyId,
} from './balanceTypes'

export interface BalanceTrophyDefinition {
  id: BalanceTrophyId
  title: string
  description: string
  characterReward: BalanceCharacterId | null
}

export const BALANCE_TROPHIES: readonly BalanceTrophyDefinition[] = [
  {
    id: 'first-crossing',
    title: 'First Crossing',
    description: 'Accumulate 5 seconds centered on one note.',
    characterReward: null,
  },
  {
    id: 'long-haul',
    title: 'Long Haul',
    description: 'Accumulate 10 seconds centered on one note.',
    characterReward: 'cat',
  },
  {
    id: 'rope-time',
    title: 'Rope Time',
    description: 'Accumulate 60 seconds of balanced time.',
    characterReward: 'robot',
  },
  {
    id: 'scale-walker',
    title: 'Scale Walker',
    description: 'Complete an entire scale routine.',
    characterReward: 'bird',
  },
  {
    id: 'center-stage',
    title: 'Center Stage',
    description: 'Complete a routine with at least 90% centered time.',
    characterReward: 'fox',
  },
  {
    id: 'precision-pilot',
    title: 'Precision Pilot',
    description: 'Complete a routine at Precision ±5¢.',
    characterReward: 'astronaut',
  },
  {
    id: 'made-to-measure',
    title: 'Made to Measure',
    description: 'Complete a saved custom routine.',
    characterReward: null,
  },
] as const

const TROPHY_IDS = new Set<BalanceTrophyId>(BALANCE_TROPHIES.map((trophy) => trophy.id))

export function isBalanceTrophyId(value: unknown): value is BalanceTrophyId {
  return typeof value === 'string' && TROPHY_IDS.has(value as BalanceTrophyId)
}

export function getBalanceTrophy(id: BalanceTrophyId): BalanceTrophyDefinition {
  return BALANCE_TROPHIES.find((trophy) => trophy.id === id) ?? BALANCE_TROPHIES[0]
}

export function trophyForCharacter(characterId: BalanceCharacterId): BalanceTrophyDefinition | null {
  return BALANCE_TROPHIES.find((trophy) => trophy.characterReward === characterId) ?? null
}

export function isBalanceCharacterUnlocked(
  characterId: BalanceCharacterId,
  unlockedCharacterIds: readonly BalanceCharacterId[],
): boolean {
  return unlockedCharacterIds.includes(characterId)
}

function earnedTrophyIds(summaries: readonly BalanceRoutineResult[]): Set<BalanceTrophyId> {
  const earned = new Set<BalanceTrophyId>()
  const notes = summaries.flatMap((summary) => summary.noteResults)
  const totalBalancedMs = summaries.reduce((total, summary) => total + summary.totalBalancedMs, 0)

  if (notes.some((note) => note.balancedMs >= 5_000)) earned.add('first-crossing')
  if (notes.some((note) => note.balancedMs >= 10_000)) earned.add('long-haul')
  if (totalBalancedMs >= 60_000) earned.add('rope-time')
  if (summaries.some((summary) => summary.completed && summary.routineType === 'scale')) {
    earned.add('scale-walker')
  }
  if (summaries.some((summary) => summary.completed && summary.centeredPercent >= 90)) {
    earned.add('center-stage')
  }
  if (
    summaries.some(
      (summary) =>
        summary.completed &&
        summary.noteResults.length > 0 &&
        summary.noteResults.every((note) => note.toleranceCents <= 5),
    )
  ) {
    earned.add('precision-pilot')
  }
  if (summaries.some((summary) => summary.completed && summary.routineType === 'custom')) {
    earned.add('made-to-measure')
  }

  return earned
}

export function awardBalanceTrophies(data: BalanceStoredDataV2): {
  data: BalanceStoredDataV2
  newlyUnlocked: BalanceTrophyId[]
} {
  const now = Date.now()
  const trophies = { ...data.trophies }
  const unlockedCharacterIds = new Set(data.unlockedCharacterIds)
  const newlyUnlocked: BalanceTrophyId[] = []

  for (const id of earnedTrophyIds(data.routineSummaries)) {
    if (!trophies[id]) {
      trophies[id] = { id, unlockedAt: now }
      newlyUnlocked.push(id)
    }
    const reward = getBalanceTrophy(id).characterReward
    if (reward) unlockedCharacterIds.add(reward)
  }

  return {
    data: {
      ...data,
      trophies,
      unlockedCharacterIds: [...unlockedCharacterIds],
    },
    newlyUnlocked,
  }
}
