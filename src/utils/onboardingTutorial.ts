import {
  COACH_MARKS,
  COACH_STORAGE_KEY,
  ONBOARDING_STORAGE_KEY,
  type CoachMarkId,
} from './tutorialContent'

export function isOnboardingComplete(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

export function resetOnboardingComplete(): void {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }
}

function readSeenCoachMarks(): Set<CoachMarkId> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(COACH_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed as CoachMarkId[]) : new Set()
  } catch {
    return new Set()
  }
}

function writeSeenCoachMarks(seen: Set<CoachMarkId>): void {
  try {
    localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify([...seen]))
  } catch {
    /* private mode / quota */
  }
}

export function hasSeenCoachMark(id: CoachMarkId): boolean {
  return readSeenCoachMarks().has(id)
}

export function markCoachMarkSeen(id: CoachMarkId): void {
  const seen = readSeenCoachMarks()
  seen.add(id)
  writeSeenCoachMarks(seen)
}

export function markAllCoachMarksSeen(): void {
  writeSeenCoachMarks(new Set(COACH_MARKS.map((coachMark) => coachMark.id)))
}

export function resetTutorials(): void {
  resetOnboardingComplete()
  try {
    localStorage.removeItem(COACH_STORAGE_KEY)
  } catch {
    /* private mode / quota */
  }
}
