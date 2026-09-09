/** Local-first rewards. No microphone, take history, or audio timers are owned here. */
export const CHALLENGE_STORAGE_KEY = 'besttake:daily-challenges:v1'
export const CHALLENGE_CHANGED = 'besttake:challenges-changed'
export const CHALLENGE_REWARD = 'besttake:challenge-reward'
export const CHALLENGE_SAVE_FAILED = 'besttake:challenge-save-failed'
const pendingAwards = new Map<string, { kind: ChallengeKind; at: Date }>()
export interface ChallengeReward { kind: ChallengeKind; total: number; unlocked: string[] }
export const CHARACTER_COSTS: Record<string, number> = { trumpeter: 0, cat: 3, robot: 7, bird: 12, fox: 20, astronaut: 30 }
export type ChallengeKind = 'practice' | 'game'
export interface ChallengeProgress { version: 1; awards: Record<string, number>; legacyCharacters: string[] }
export function challengeDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function trophyCount(progress: ChallengeProgress): number { return Object.keys(progress.awards).length }
export function loadChallengeProgress(strict = false): ChallengeProgress {
  const empty: ChallengeProgress = { version: 1, awards: {}, legacyCharacters: [] }
  try {
    const raw = localStorage.getItem(CHALLENGE_STORAGE_KEY)
    if (!raw) {
      // Preserve the current player and every existing Balance unlock.
      const selected = localStorage.getItem('besttake.practiceGames.character')
      const balance = JSON.parse(localStorage.getItem('besttake:balance') || '{}')
      empty.legacyCharacters = [...new Set([selected, ...(Array.isArray(balance.unlockedCharacterIds) ? balance.unlockedCharacterIds : [])])].filter((id): id is string => typeof id === 'string' && id in CHARACTER_COSTS)
      localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(empty))
      return empty
    }
    const parsed = JSON.parse(raw)
    if (parsed.version !== 1) { if (strict) throw new Error('Unknown rewards version'); return empty }
    const awards = Object.fromEntries(Object.entries(parsed.awards || {}).filter(([id, time]) => /^\d{4}-\d{2}-\d{2}:(practice|game)$/.test(id) && typeof time === 'number' && Number.isFinite(time))) as Record<string, number>
    return { version: 1, awards, legacyCharacters: Array.isArray(parsed.legacyCharacters) ? parsed.legacyCharacters.filter((id: unknown) => typeof id === 'string' && id in CHARACTER_COSTS) : [] }
  } catch (error) { if (strict) throw error; return empty }
}
export function characterUnlocked(id: string, progress = loadChallengeProgress()): boolean {
  if (!(id in CHARACTER_COSTS)) return false
  if (progress.legacyCharacters.includes(id) || trophyCount(progress) >= CHARACTER_COSTS[id]) return true
  // Balance achievements continue to unlock their original rewards.
  try { return JSON.parse(localStorage.getItem('besttake:balance') || '{}').unlockedCharacterIds?.includes(id) === true } catch { return false }
}
export function awardChallenge(kind: ChallengeKind, now = new Date()): boolean {
  const id = `${challengeDate(now)}:${kind}`
  try {
    const progress = loadChallengeProgress(true)
    if (id in progress.awards) { pendingAwards.delete(id); return false }
    const before = Object.keys(CHARACTER_COSTS).filter(character => characterUnlocked(character, progress))
    progress.awards[id] = now.getTime()
    localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(progress))
    pendingAwards.delete(id)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(CHALLENGE_CHANGED))
      window.dispatchEvent(new CustomEvent<ChallengeReward>(CHALLENGE_REWARD, { detail: {
        kind, total: trophyCount(progress), unlocked: Object.keys(CHARACTER_COSTS).filter(character => !before.includes(character) && characterUnlocked(character, progress)),
      } }))
    }
    return true
  } catch {
    pendingAwards.set(id, { kind, at: now })
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHALLENGE_SAVE_FAILED))
    return false
  }
}
export function retryChallengeRewards(): boolean {
  for (const { kind, at } of [...pendingAwards.values()]) awardChallenge(kind, at)
  return pendingAwards.size === 0
}
export function recordRoutineChallenge(day: { date: string; doneStepIds: string[]; elapsedMsByStep: Record<string, number> } | null): void {
  if (day?.date === challengeDate() && day.doneStepIds.some(id => day.elapsedMsByStep[id] >= 60_000)) awardChallenge('practice')
}

/** Adapters report musical outcomes, never menu opens or elapsed idle time. */
export function recordGameChallenge(result: { game: 'balance'; completed: boolean } | { game: 'staff-jumper'; correctNotes: number }): boolean {
  if (result.game === 'balance' ? !result.completed : !Number.isFinite(result.correctNotes) || result.correctNotes < 8) return false
  return awardChallenge('game')
}
