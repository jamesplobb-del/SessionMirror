import { getStepTemplates, presetFamilyFor, stepFromTemplate } from './routinePresets'
import { createRoutine, type RoutineTopic } from './practiceRoutines'

export const PRACTICE_GOALS = [
  { id: 'balanced', title: 'Build a daily habit', detail: 'A balanced mix of fundamentals and music.' },
  { id: 'sound', title: 'Work on tone', detail: 'Sound and control for your instrument, then a phrase of music.' },
  { id: 'technique', title: 'Make technique easier', detail: 'Coordination, articulation, and focused repetition.' },
  { id: 'music', title: 'Prepare a piece', detail: 'Warm up, isolate a passage, then put it in context.' },
] as const
export type PracticeGoal = typeof PRACTICE_GOALS[number]['id']
const topics: Record<PracticeGoal, RoutineTopic[]> = {
  balanced: ['long-tones', 'scales', 'technique', 'piece'],
  sound: ['long-tones', 'flexibility', 'piece'],
  technique: ['scales', 'articulation', 'technique', 'etude'],
  music: ['piece', 'piece'],
}

// Fixed-pitch and fretted instruments need a tone exercise other than long tones.
const soundFocusByInstrument: Record<string, string> = {
  violin: 'intonation', viola: 'intonation', cello: 'intonation', 'double-bass': 'intonation',
  guitar: 'right-hand', 'bass-guitar': 'groove', ukulele: 'fingerpicking', piano: 'chords',
}

function allocateMusicMinutes(total: number, stepCount: number): number[] {
  const weights = stepCount === 4 ? [0.15, 0.2, 0.4, 0.25] : [0.2, 0.5, 0.3]
  let remaining = total
  return weights.map((weight, index) => {
    const amount = index === stepCount - 1
      ? remaining
      : Math.max(1, Math.min(remaining - (stepCount - index - 1), Math.round(total * weight)))
    remaining -= amount
    return amount
  })
}

/** Uses the existing instrument catalog; no cross-instrument fallback exercises. */
export function buildGoalRoutine(instrumentId: string | null, goal: PracticeGoal, minutes?: number) {
  const available = getStepTemplates(instrumentId).filter(item => item.kind !== 'free' && item.kind !== 'game')
  const selected = available.filter(item => item.topic === 'warmup').slice(0, 1)
  if (goal === 'music') {
    const family = presetFamilyFor(instrumentId)
    const preparationId = family === 'voice' ? 'sirens' : family === 'brass' || family === 'woodwind' ? 'long-tones' : null
    const preparation = available.find(item => item.id === preparationId)
    if (preparation && !selected.includes(preparation)) selected.push(preparation)
  }
  if (goal === 'sound' && instrumentId) {
    const focus = available.find(item => item.id === soundFocusByInstrument[instrumentId])
    if (focus && !selected.includes(focus)) selected.push(focus)
  }
  for (const topic of topics[goal]) {
    const item = available.find(candidate => candidate.topic === topic && !selected.includes(candidate))
    if (item) selected.push(item)
  }
  if (!selected.length && available[0]) selected.push(available[0])
  if (minutes === undefined && goal !== 'music') {
    return createRoutine(PRACTICE_GOALS.find(item => item.id === goal)?.title ?? 'My practice',
      selected.map(template => stepFromTemplate(template, instrumentId)), instrumentId)
  }
  const total = minutes === undefined
    ? selected.reduce((sum, item) => sum + item.minutes, 0)
    : Number.isFinite(minutes) ? Math.min(90, Math.max(selected.length, Math.round(minutes))) : 20
  const musicMinutes = goal === 'music' ? allocateMusicMinutes(total, selected.length) : null
  const plan = selected.map((template, index) => ({ ...stepFromTemplate(template, instrumentId),
    minutes: musicMinutes?.[index] ?? Math.floor(total / selected.length) + (index < total % selected.length ? 1 : 0) }))
  return createRoutine(PRACTICE_GOALS.find(item => item.id === goal)?.title ?? 'My practice', plan, instrumentId)
}
