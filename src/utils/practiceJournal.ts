/**
 * Journal grouping.
 *
 * A practice journal is only worth opening if it has a shape: which day, and
 * which sitting within that day. Kept out of the view so it can be tested
 * against real timestamps — see `scripts/verify-focus-practice.mjs`.
 */
import type { Take } from '../types'

export interface JournalAttempt {
  take: Take
  /** 1-based, oldest first — what the musician calls it out loud. */
  number: number
}

export interface JournalSitting {
  key: string
  dayLabel: string
  /** Only set when a day holds more than one sitting. */
  sittingLabel: string | null
  attempts: JournalAttempt[]
}

const DAY_MS = 86_400_000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Today", "Yesterday", then the date — a week later the date is what helps. */
export function describeJournalDay(timestamp: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(timestamp))) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** The focused takes only, numbered oldest-first, returned newest-first. */
export function toJournalAttempts(takes: Take[]): JournalAttempt[] {
  return takes
    .filter(take => take.practiceSessionId || take.focusArea)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((take, index) => ({ take, number: index + 1 }))
    .reverse()
}

/**
 * Groups newest-first attempts into sittings. A sitting is one
 * practiceSessionId; takes predating that field fall back to their day, so
 * legacy takes still group rather than each becoming its own sitting.
 */
export function groupIntoSittings(
  attempts: JournalAttempt[],
  now: number = Date.now(),
): JournalSitting[] {
  const sittings: JournalSitting[] = []
  for (const attempt of attempts) {
    const day = new Date(attempt.take.timestamp).toDateString()
    const key = `${day}::${attempt.take.practiceSessionId ?? 'legacy'}`
    const last = sittings[sittings.length - 1]
    if (last && last.key === key) {
      last.attempts.push(attempt)
      continue
    }
    sittings.push({
      key,
      dayLabel: describeJournalDay(attempt.take.timestamp, now),
      sittingLabel: null,
      attempts: [attempt],
    })
  }

  // Number sittings within each day, oldest first. A lone sitting stays
  // unlabelled — "sitting 1 of 1" is noise.
  const byDay = new Map<string, JournalSitting[]>()
  for (const sitting of sittings) {
    const dayKey = sitting.key.split('::')[0]
    const list = byDay.get(dayKey) ?? []
    list.push(sitting)
    byDay.set(dayKey, list)
  }
  for (const list of byDay.values()) {
    if (list.length < 2) continue
    // `list` is newest-first, so the last entry is the day's first sitting.
    list.forEach((sitting, index) => {
      sitting.sittingLabel = `sitting ${list.length - index}`
    })
  }

  return sittings
}

/** Distinct calendar days represented in the run. */
export function countJournalDays(attempts: JournalAttempt[]): number {
  return new Set(attempts.map(item => new Date(item.take.timestamp).toDateString())).size
}
