import { clampWrittenMidi, getBalanceInstrument, midiToBalanceNoteName } from './balanceMusic'
import type { BalanceInstrument, BalanceLaunch, BalanceLevelProgress } from './balanceTypes'

/**
 * The Sky Trail ladder.
 *
 * Levels are written as semitone offsets from the instrument's own starting
 * note (`homeWrittenMidi`), never as absolute pitches — one ladder has to work
 * for a tuba and a flute, and a level that asked both of them for C4 would be
 * unplayable for one of them. Offsets are clamped into the instrument's range
 * at build time, so a wide interval collapses toward home rather than falling
 * off the end of the horn.
 *
 * The progression is the one every long-tone page in a method book uses:
 * hold one note comfortably, hold it longer, hold it more accurately, then
 * carry that steadiness through a moving line.
 */

export type BalanceWorldId = 'first-steps' | 'long-haul' | 'fine-tune' | 'scale-trail'

export interface BalanceWorld {
  id: BalanceWorldId
  index: number
  name: string
  tagline: string
  /** Node and banner colour for this stretch of the trail. */
  accent: string
  accentDark: string
}

export interface BalanceLevel {
  id: string
  worldId: BalanceWorldId
  /** 1-based position within its world. */
  index: number
  /** 1-based position on the whole trail. */
  number: number
  name: string
  /** Semitone offsets from the instrument's home note, one per held note. */
  offsets: readonly number[]
  goalSeconds: number
  toleranceCents: number
  /** Centered-percent needed for the 2nd and 3rd star. Clearing earns the 1st. */
  twoStarPercent: number
  threeStarPercent: number
  /** Worlds end on a marked level; the trail draws these bigger. */
  isBoss: boolean
}

export const BALANCE_WORLDS: readonly BalanceWorld[] = [
  {
    id: 'first-steps',
    index: 1,
    name: 'First Steps',
    tagline: 'Find the note and stay on it',
    accent: '#4da3e8',
    accentDark: '#2b6fae',
  },
  {
    id: 'long-haul',
    index: 2,
    name: 'Long Haul',
    tagline: 'Hold it far longer than feels natural',
    accent: '#4bb98a',
    accentDark: '#2c8460',
  },
  {
    id: 'fine-tune',
    index: 3,
    name: 'Fine Tune',
    tagline: 'The rope narrows — centre it exactly',
    accent: '#b07ae0',
    accentDark: '#7a4bab',
  },
  {
    id: 'scale-trail',
    index: 4,
    name: 'Scale Trail',
    tagline: 'Carry that steadiness through a line',
    accent: '#ef9227',
    accentDark: '#c06c10',
  },
] as const

interface LevelSeed {
  name: string
  offsets: readonly number[]
  goalSeconds: number
  toleranceCents: number
  twoStarPercent?: number
  threeStarPercent?: number
}

const MAJOR_UP = [0, 2, 4, 5, 7, 9, 11, 12] as const
const MINOR_UP = [0, 2, 3, 5, 7, 8, 10, 12] as const

const WORLD_SEEDS: Record<BalanceWorldId, readonly LevelSeed[]> = {
  'first-steps': [
    { name: 'Steady Start', offsets: [0], goalSeconds: 4, toleranceCents: 15 },
    { name: 'Hold It', offsets: [0], goalSeconds: 5, toleranceCents: 15 },
    { name: 'Second Wind', offsets: [0, 0], goalSeconds: 5, toleranceCents: 15 },
    { name: 'Step Up', offsets: [2], goalSeconds: 5, toleranceCents: 15 },
    { name: 'Step Down', offsets: [-2], goalSeconds: 5, toleranceCents: 15 },
    { name: 'Neighbours', offsets: [-2, 0, 2], goalSeconds: 4, toleranceCents: 15 },
    { name: 'Longer Line', offsets: [0], goalSeconds: 7, toleranceCents: 15 },
    { name: 'Two Peaks', offsets: [0, 4], goalSeconds: 5, toleranceCents: 15 },
    { name: 'First Crossing', offsets: [0, 2, 4], goalSeconds: 5, toleranceCents: 15 },
  ],
  'long-haul': [
    { name: 'Deep Breath', offsets: [0], goalSeconds: 8, toleranceCents: 12 },
    { name: 'Eight and Eight', offsets: [0, 0], goalSeconds: 8, toleranceCents: 12 },
    { name: 'Ten Steady', offsets: [0], goalSeconds: 10, toleranceCents: 12 },
    { name: 'Upper Air', offsets: [5], goalSeconds: 8, toleranceCents: 12 },
    { name: 'Lower Air', offsets: [-5], goalSeconds: 8, toleranceCents: 12 },
    { name: 'Twelve', offsets: [0], goalSeconds: 12, toleranceCents: 12 },
    { name: 'Three Pillars', offsets: [0, 4, 7], goalSeconds: 8, toleranceCents: 12 },
    { name: 'Fifteen', offsets: [0], goalSeconds: 15, toleranceCents: 12 },
    { name: 'The Long Haul', offsets: [0, 7], goalSeconds: 12, toleranceCents: 12 },
  ],
  'fine-tune': [
    { name: 'Tighten Up', offsets: [0], goalSeconds: 6, toleranceCents: 8 },
    { name: 'Narrow Path', offsets: [2], goalSeconds: 6, toleranceCents: 8 },
    { name: 'Fine Line', offsets: [0], goalSeconds: 8, toleranceCents: 8 },
    { name: 'Thread the Gap', offsets: [0, 3, 5], goalSeconds: 6, toleranceCents: 8 },
    { name: 'Precision', offsets: [0], goalSeconds: 6, toleranceCents: 5 },
    { name: "Hair's Breadth", offsets: [7], goalSeconds: 6, toleranceCents: 5 },
    { name: 'Steady Hand', offsets: [0], goalSeconds: 10, toleranceCents: 5 },
    { name: 'Tightrope', offsets: [0, 4, 7], goalSeconds: 8, toleranceCents: 5 },
    { name: 'Perfect Centre', offsets: [0], goalSeconds: 15, toleranceCents: 5 },
  ],
  'scale-trail': [
    { name: 'Five Up', offsets: [0, 2, 4, 5, 7], goalSeconds: 4, toleranceCents: 10 },
    { name: 'Five Down', offsets: [7, 5, 4, 2, 0], goalSeconds: 4, toleranceCents: 10 },
    { name: 'Major Climb', offsets: MAJOR_UP, goalSeconds: 4, toleranceCents: 10 },
    { name: 'Chromatic Steps', offsets: [0, 1, 2, 3, 4, 5], goalSeconds: 4, toleranceCents: 10 },
    { name: 'Arpeggio Air', offsets: [0, 4, 7, 12], goalSeconds: 6, toleranceCents: 10 },
    { name: 'Minor Climb', offsets: MINOR_UP, goalSeconds: 4, toleranceCents: 10 },
    { name: 'Up and Over', offsets: [...MAJOR_UP, 11, 9, 7, 5, 4, 2, 0], goalSeconds: 3, toleranceCents: 10 },
    { name: 'Long Scale', offsets: MAJOR_UP, goalSeconds: 6, toleranceCents: 8 },
    { name: 'Sky Trail', offsets: [...MAJOR_UP, 11, 9, 7, 5, 4, 2, 0], goalSeconds: 5, toleranceCents: 8 },
  ],
}

/** Star bars tighten as the ladder goes on; a boss asks for a little more. */
const WORLD_STAR_BARS: Record<BalanceWorldId, [number, number]> = {
  'first-steps': [62, 80],
  'long-haul': [66, 84],
  'fine-tune': [70, 88],
  'scale-trail': [70, 88],
}

export const BALANCE_LEVELS: readonly BalanceLevel[] = BALANCE_WORLDS.flatMap((world) =>
  WORLD_SEEDS[world.id].map((seed, seedIndex): BalanceLevel => {
    const index = seedIndex + 1
    const isBoss = index === WORLD_SEEDS[world.id].length
    const [twoStar, threeStar] = WORLD_STAR_BARS[world.id]
    return {
      id: `w${world.index}-${index}`,
      worldId: world.id,
      index,
      number: (world.index - 1) * WORLD_SEEDS[world.id].length + index,
      name: seed.name,
      offsets: seed.offsets,
      goalSeconds: seed.goalSeconds,
      toleranceCents: seed.toleranceCents,
      twoStarPercent: seed.twoStarPercent ?? twoStar + (isBoss ? 3 : 0),
      threeStarPercent: seed.threeStarPercent ?? threeStar + (isBoss ? 2 : 0),
      isBoss,
    }
  }),
)

export const BALANCE_LEVEL_COUNT = BALANCE_LEVELS.length
export const BALANCE_MAX_STARS = BALANCE_LEVEL_COUNT * 3

export function getBalanceLevel(id: string): BalanceLevel | null {
  return BALANCE_LEVELS.find((level) => level.id === id) ?? null
}

export function getBalanceWorld(id: BalanceWorldId): BalanceWorld {
  return BALANCE_WORLDS.find((world) => world.id === id) ?? BALANCE_WORLDS[0]!
}

export function balanceLevelsForWorld(id: BalanceWorldId): BalanceLevel[] {
  return BALANCE_LEVELS.filter((level) => level.worldId === id)
}

/**
 * Written pitches for one level on one instrument.
 *
 * Offsets are measured from home and then clamped, which keeps every note
 * playable. Clamping can collapse two notes onto the same pitch at the very
 * edge of a range — that is the right failure: an unreachable note would end
 * the run, a repeated one merely makes the level easier.
 */
export function balanceLevelWrittenMidi(
  level: BalanceLevel,
  instrument: BalanceInstrument,
): number[] {
  return level.offsets.map((offset) =>
    clampWrittenMidi(instrument.homeWrittenMidi + offset, instrument),
  )
}

export function balanceLevelNoteLabels(level: BalanceLevel, instrumentId: string): string[] {
  const instrument = getBalanceInstrument(instrumentId)
  return balanceLevelWrittenMidi(level, instrument).map((midi) => midiToBalanceNoteName(midi))
}

/** "Hold C4 for 5 seconds" — the line under the level name on the trail card. */
export function balanceLevelObjective(level: BalanceLevel, instrumentId: string): string {
  const labels = balanceLevelNoteLabels(level, instrumentId)
  const unique = [...new Set(labels)]
  const seconds = `${level.goalSeconds} second${level.goalSeconds === 1 ? '' : 's'}`
  if (labels.length === 1) return `Hold ${labels[0]} for ${seconds}`
  if (unique.length === 1) return `Hold ${unique[0]} for ${seconds}, ${labels.length} times`
  if (labels.length <= 3) return `Hold ${labels.join(', ')} for ${seconds} each`
  return `Hold ${labels.length} notes for ${seconds} each`
}

export function balanceLevelLaunch(level: BalanceLevel, instrumentId: string): BalanceLaunch {
  const instrument = getBalanceInstrument(instrumentId)
  return {
    kind: 'level',
    id: level.id,
    title: level.name,
    subtitle: balanceLevelObjective(level, instrumentId),
    writtenMidi: balanceLevelWrittenMidi(level, instrument),
    goalSeconds: level.goalSeconds,
    toleranceCents: level.toleranceCents,
  }
}

/**
 * Stars for a finished run. Clearing every note earns one; the other two come
 * from how much of the sounding time was actually inside the window, which is
 * the thing long tones are meant to train.
 */
export function balanceStarsForRun(
  level: BalanceLevel,
  completed: boolean,
  centeredPercent: number,
): number {
  if (!completed) return 0
  if (centeredPercent >= level.threeStarPercent) return 3
  if (centeredPercent >= level.twoStarPercent) return 2
  return 1
}

export function balanceLevelIsUnlocked(
  level: BalanceLevel,
  levels: Record<string, BalanceLevelProgress>,
): boolean {
  if (level.number === 1) return true
  const previous = BALANCE_LEVELS[level.number - 2]
  return previous ? (levels[previous.id]?.stars ?? 0) > 0 : true
}

/** The level the trail should open on: the first one not yet cleared. */
export function balanceNextLevel(levels: Record<string, BalanceLevelProgress>): BalanceLevel {
  return (
    BALANCE_LEVELS.find((level) => (levels[level.id]?.stars ?? 0) === 0) ??
    BALANCE_LEVELS[BALANCE_LEVELS.length - 1]!
  )
}

export function balanceTotalStars(levels: Record<string, BalanceLevelProgress>): number {
  return Object.values(levels).reduce((total, entry) => total + entry.stars, 0)
}

export function balanceWorldStars(
  worldId: BalanceWorldId,
  levels: Record<string, BalanceLevelProgress>,
): { earned: number; possible: number } {
  const worldLevels = balanceLevelsForWorld(worldId)
  return {
    earned: worldLevels.reduce((total, level) => total + (levels[level.id]?.stars ?? 0), 0),
    possible: worldLevels.length * 3,
  }
}

export function balanceDifficultyLabel(toleranceCents: number): string {
  if (toleranceCents >= 14) return 'Easy'
  if (toleranceCents >= 11) return 'Steady'
  if (toleranceCents >= 9) return 'Normal'
  if (toleranceCents >= 6) return 'Sharp'
  return 'Expert'
}
