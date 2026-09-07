import { getStepTemplates, stepFromTemplate } from './routinePresets'
import { createRoutine, type RoutineTopic } from './practiceRoutines'

export const PRACTICE_GOALS = [
  { id: 'balanced', title: 'Build a daily habit', detail: 'A balanced mix of fundamentals and music.' },
  { id: 'sound', title: 'Develop my sound', detail: 'Tone, control, and a musical application.' },
  { id: 'technique', title: 'Make technique easier', detail: 'Coordination, articulation, and focused repetition.' },
  { id: 'music', title: 'Prepare a piece', detail: 'Warm up, isolate a passage, then put it in context.' },
] as const
export type PracticeGoal = typeof PRACTICE_GOALS[number]['id']
const topics: Record<PracticeGoal, RoutineTopic[]> = {
  balanced: ['long-tones', 'scales', 'technique', 'piece'],
  sound: ['long-tones', 'flexibility', 'piece'],
  technique: ['scales', 'articulation', 'technique', 'etude'],
  music: ['piece', 'etude', 'sight-reading'],
}

/** Uses the existing instrument catalog; no cross-instrument fallback exercises. */
export function buildGoalRoutine(instrumentId: string | null, goal: PracticeGoal, minutes: number) {
  const available = getStepTemplates(instrumentId).filter(item => item.kind !== 'free' && item.kind !== 'game')
  const selected = available.filter(item => item.topic === 'warmup').slice(0, 1)
  for (const topic of topics[goal]) {
    const item = available.find(candidate => candidate.topic === topic && !selected.includes(candidate))
    if (item) selected.push(item)
  }
  if (!selected.length && available[0]) selected.push(available[0])
  const total = Number.isFinite(minutes) ? Math.min(90, Math.max(selected.length, Math.round(minutes))) : 20
  const plan = selected.map((template, index) => ({ ...stepFromTemplate(template, instrumentId),
    minutes: Math.floor(total / selected.length) + (index < total % selected.length ? 1 : 0) }))
  return createRoutine(PRACTICE_GOALS.find(item => item.id === goal)?.title ?? 'My practice', plan, instrumentId)
}
