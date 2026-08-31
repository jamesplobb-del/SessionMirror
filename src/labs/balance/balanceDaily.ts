import { clampWrittenMidi, getBalanceInstrument, midiToBalanceNoteName } from './balanceMusic'
import type { BalanceDailyProgress, BalanceLaunch } from './balanceTypes'

/**
 * One challenge per calendar day, the same for everyone.
 *
 * The day's key seeds the pick, so the challenge cannot be rerolled by closing
 * the app, and two players comparing notes are talking about the same thing.
 * Like the levels, notes are offsets from the instrument's own home note.
 */

interface DailyTemplate {
  id: string
  name: string
  offsets: readonly number[]
  goalSeconds: number
  toleranceCents: number
}

const DAILY_TEMPLATES: readonly DailyTemplate[] = [
  { id: 'steady-start', name: 'Steady Start', offsets: [0], goalSeconds: 8, toleranceCents: 12 },
  { id: 'deep-breath', name: 'Deep Breath', offsets: [0], goalSeconds: 12, toleranceCents: 12 },
  { id: 'three-in-a-row', name: 'Three in a Row', offsets: [0, 0, 0], goalSeconds: 6, toleranceCents: 12 },
  { id: 'wide-steps', name: 'Wide Steps', offsets: [-4, 0, 4], goalSeconds: 6, toleranceCents: 12 },
  { id: 'fine-point', name: 'Fine Point', offsets: [0], goalSeconds: 6, toleranceCents: 6 },
  { id: 'high-air', name: 'High Air', offsets: [7], goalSeconds: 8, toleranceCents: 12 },
  { id: 'low-air', name: 'Low Air', offsets: [-7], goalSeconds: 8, toleranceCents: 12 },
  { id: 'five-note-climb', name: 'Five Note Climb', offsets: [0, 2, 4, 5, 7], goalSeconds: 5, toleranceCents: 12 },
  { id: 'the-long-one', name: 'The Long One', offsets: [0], goalSeconds: 20, toleranceCents: 14 },
  { id: 'centre-hold', name: 'Centre Hold', offsets: [0, 5], goalSeconds: 8, toleranceCents: 8 },
] as const

/** Local calendar day, not UTC — the challenge should turn over at the player's midnight. */
export function balanceDayKey(at: Date = new Date()): string {
  const year = at.getFullYear()
  const month = `${at.getMonth() + 1}`.padStart(2, '0')
  const day = `${at.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function hashDayKey(dayKey: string): number {
  let hash = 2166136261
  for (let index = 0; index < dayKey.length; index += 1) {
    hash ^= dayKey.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function balanceDailyTemplate(dayKey: string = balanceDayKey()): DailyTemplate {
  return DAILY_TEMPLATES[hashDayKey(dayKey) % DAILY_TEMPLATES.length]!
}

export interface BalanceDailyChallenge {
  dayKey: string
  name: string
  objective: string
  goalSeconds: number
  toleranceCents: number
  writtenMidi: number[]
}

export function balanceDailyChallenge(
  instrumentId: string,
  dayKey: string = balanceDayKey(),
): BalanceDailyChallenge {
  const template = balanceDailyTemplate(dayKey)
  const instrument = getBalanceInstrument(instrumentId)
  const writtenMidi = template.offsets.map((offset) =>
    clampWrittenMidi(instrument.homeWrittenMidi + offset, instrument),
  )
  const labels = writtenMidi.map((midi) => midiToBalanceNoteName(midi))
  const unique = [...new Set(labels)]
  const seconds = `${template.goalSeconds} second${template.goalSeconds === 1 ? '' : 's'}`
  const objective =
    labels.length === 1
      ? `Hold ${labels[0]} for ${seconds}`
      : unique.length === 1
        ? `Hold ${unique[0]} for ${seconds}, ${labels.length} times`
        : `Hold ${labels.join(', ')} for ${seconds} each`

  return {
    dayKey,
    name: template.name,
    objective,
    goalSeconds: template.goalSeconds,
    toleranceCents: template.toleranceCents,
    writtenMidi,
  }
}

export function balanceDailyLaunch(challenge: BalanceDailyChallenge): BalanceLaunch {
  return {
    kind: 'daily',
    id: challenge.dayKey,
    title: challenge.name,
    subtitle: challenge.objective,
    writtenMidi: challenge.writtenMidi,
    goalSeconds: challenge.goalSeconds,
    toleranceCents: challenge.toleranceCents,
  }
}

function previousDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() - 1)
  return balanceDayKey(date)
}

export function balanceDailyIsComplete(
  daily: BalanceDailyProgress,
  dayKey: string = balanceDayKey(),
): boolean {
  return daily.lastCompletedDate === dayKey
}

/**
 * The streak the player actually has *right now*.
 *
 * A stored streak stays at its last value until the next completion, so a
 * player who skipped Tuesday would still be shown "3 day streak" on Wednesday
 * morning. Anything older than yesterday reads as zero.
 */
export function balanceCurrentStreak(
  daily: BalanceDailyProgress,
  dayKey: string = balanceDayKey(),
): number {
  if (!daily.lastCompletedDate) return 0
  if (daily.lastCompletedDate === dayKey) return daily.streak
  if (daily.lastCompletedDate === previousDayKey(dayKey)) return daily.streak
  return 0
}

export function balanceCompleteDaily(
  daily: BalanceDailyProgress,
  dayKey: string = balanceDayKey(),
): BalanceDailyProgress {
  if (daily.lastCompletedDate === dayKey) return daily
  const continues = daily.lastCompletedDate === previousDayKey(dayKey)
  const streak = continues ? daily.streak + 1 : 1
  return {
    lastCompletedDate: dayKey,
    streak,
    longestStreak: Math.max(daily.longestStreak, streak),
    totalCompleted: daily.totalCompleted + 1,
  }
}
