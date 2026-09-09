import { getInstrumentProfile } from './instrumentProfiles'
import { getStepTemplates, stepFromTemplate } from './routinePresets'
import { parseRoutine, type Routine, type RoutineDay } from './practiceRoutines'
import { balanceDailyChallenge, balanceDailyLaunch } from '../labs/balance/balanceDaily'
import { getBalanceInstrument } from '../labs/balance/balanceInstruments'
import { getStaffJumperInstrument, homeKeyForInstrument } from '../labs/staffJumper/staffJumperInstruments'
import type { StaffJumperKey } from '../labs/staffJumper/staffJumperMusicLogic'
import type { BalanceLaunch } from '../labs/balance/balanceTypes'
import { awardChallenge, challengeDate } from './dailyChallenges'

const PLAN_KEY = 'besttake:daily-plan:v1'
export interface DailyChallengePlan {
  version: 1
  date: string
  instrumentId: string
  instrumentLabel: string
  practice: { routine: Routine; sourceRoutineId: string | null; hint: string }
  game: { route: 'balance' | 'staff-jumper'; instrumentId: string; title: string; objective: string; key: StaffJumperKey; balance: BalanceLaunch }
}
export function isChallengeRoutine(routine: Routine | null): boolean { return Boolean(routine?.id.startsWith('daily-practice:')) }
function seed(value: string): number { let result = 0; for (const c of value) result = (Math.imul(result, 31) + c.charCodeAt(0)) >>> 0; return result }
function readPlans(): DailyChallengePlan[] {
  try {
    const rows = JSON.parse(localStorage.getItem(PLAN_KEY) || '[]')
    if (!Array.isArray(rows)) return []
    return rows.filter((p): p is DailyChallengePlan => {
      const routine = parseRoutine(p?.practice?.routine)
      const game = p?.game
      const balance = game?.balance
      return p?.version === 1 && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && typeof p.instrumentId === 'string' &&
        typeof p.instrumentLabel === 'string' && routine?.steps.length === 1 && routine.instrumentId === p.instrumentId &&
        typeof p.practice.hint === 'string' && (p.practice.sourceRoutineId === null || typeof p.practice.sourceRoutineId === 'string') &&
        ['balance', 'staff-jumper'].includes(game?.route) && typeof game.instrumentId === 'string' &&
        typeof game.title === 'string' && typeof game.objective === 'string' &&
        ['Ab', 'A', 'Bb', 'B', 'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#'].includes(game.key) &&
        balance?.kind === 'daily' && balance.id === p.date && Array.isArray(balance.writtenMidi) &&
        balance.writtenMidi.length > 0 && balance.writtenMidi.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 127) &&
        Number.isFinite(balance.goalSeconds) && balance.goalSeconds > 0 && Number.isFinite(balance.toleranceCents) && balance.toleranceCents > 0
    })
  } catch { return [] }
}
/** Frozen per local day and instrument. Editing a routine cannot silently reroll it. */
export function getDailyChallengePlan(instrumentId: string | null, routine: Routine | null, now = new Date()): DailyChallengePlan {
  const date = challengeDate(now)
  const instrument = getInstrumentProfile(instrumentId || '')
  const id = instrument?.id ?? 'other'
  const stored = readPlans().find(plan => plan.date === date && plan.instrumentId === id)
  if (stored) return stored
  const hash = seed(`${date}:${id}`)
  const candidates = routine?.instrumentId === id && !isChallengeRoutine(routine) ? routine.steps.filter(s => s.kind !== 'game' && s.kind !== 'free') : []
  const templates = getStepTemplates(id).filter(t => ['warmup', 'long-tones', 'technique', 'scales', 'articulation', 'rhythm'].includes(t.topic) && t.kind !== 'game' && t.kind !== 'free')
  const template = templates[hash % templates.length] ?? getStepTemplates(id)[0]!
  const source = candidates[hash % candidates.length]
  const step = { ...(source ?? stepFromTemplate(template, id)), minutes: 1 }
  if (!source) { step.id = `daily-item:${date}:${id}`; step.referenceQuery = ''; if (step.desk) step.desk = { ...step.desk, autoSoundRecording: false } }
  const practiceRoutine: Routine = { id: `daily-practice:${date}:${id}`, name: 'Today’s practice challenge', instrumentId: id, steps: [step], createdAt: now.getTime(), updatedAt: now.getTime() }
  const staffInstrument = getStaffJumperInstrument(id)
  const balanceInstrument = getBalanceInstrument(id)
  const balance = balanceDailyLaunch(balanceDailyChallenge(balanceInstrument.id, date))
  // Unsupported clefs use Balance's notation rather than a made-up treble part.
  const staff = Boolean(staffInstrument) && (hash % 2 === 0 || ['piano', 'guitar', 'bass-guitar'].includes(id))
  const keys: StaffJumperKey[] = staffInstrument ? [homeKeyForInstrument(staffInstrument, 'major'), 'C', 'F', 'Bb', 'Eb', 'G', 'D'] : ['C']
  const key = keys[Math.floor(hash / 2) % keys.length]!
  const label = key.replace('b', '♭').replace('#', '♯')
  const plan: DailyChallengePlan = { version: 1, date, instrumentId: id, instrumentLabel: instrument?.label ?? 'Your instrument',
    practice: { routine: practiceRoutine, sourceRoutineId: source ? routine!.id : null, hint: source ? 'Spend a focused minute on this exercise from your routine. Pause whenever you need; tap Done when finished.' : `Work slowly and comfortably on ${step.title.toLowerCase()} for one minute, then tap Done. Your practice tools are ready.` },
    game: { route: staff ? 'staff-jumper' : 'balance', instrumentId: staff ? staffInstrument!.id : balanceInstrument.id,
      title: staff ? `${label} major in Staff Jumper` : balance.title,
      objective: staff ? `Play 8 correct notes in written ${label} major. No lives, no score target.` : `${balance.subtitle}. Pauses and retries are welcome.`, key, balance },
  }
  // Keep today's instruments only; trophies live separately and never expire.
  const rows = readPlans().filter(p => p.date === date && p.instrumentId !== id)
  localStorage.setItem(PLAN_KEY, JSON.stringify([...rows, plan]))
  return plan
}
export function recordPlannedRoutine(day: RoutineDay | null): void {
  if (!day || day.date !== challengeDate()) return
  const matches = readPlans().some(plan => plan.date === day.date &&
    [plan.practice.sourceRoutineId, plan.practice.routine.id].includes(day.routineId) &&
    plan.practice.routine.steps.some(step => (day.routineId === plan.practice.routine.id || day.itemsByStep[step.id]?.title === step.title) && day.doneStepIds.includes(step.id) && day.elapsedMsByStep[step.id] >= 60_000))
  if (matches) awardChallenge('practice')
}
export function recordPlannedGame(result: { game: 'staff-jumper'; instrumentId: string | null; key: string; scaleMode: string; correctNotes: number; startedAtMs: number | null } | { game: 'balance'; instrumentId: string; date: string | null; completed: boolean }): boolean {
  const today = challengeDate()
  const matches = readPlans().some(p => p.date === today && p.game.route === result.game && p.game.instrumentId === result.instrumentId &&
    (result.game === 'balance' ? result.completed && result.date === today : result.startedAtMs !== null && challengeDate(new Date(result.startedAtMs)) === today && result.scaleMode === 'major' && result.key === p.game.key && Number.isFinite(result.correctNotes) && result.correctNotes >= 8))
  return matches ? awardChallenge('game') : false
}

/** Use the saved item only while its identity still matches the frozen challenge. */
export function resolveDailyPractice(plan: DailyChallengePlan, current: Routine | null): { routine: Routine; stepId: string; temporary: boolean } {
  const step = plan.practice.routine.steps[0]!
  const same = current?.id === plan.practice.sourceRoutineId && current.instrumentId === plan.instrumentId && current.steps.some(item => item.id === step.id && item.title === step.title && item.kind === step.kind)
  return { routine: same ? current! : plan.practice.routine, stepId: step.id, temporary: !same }
}
