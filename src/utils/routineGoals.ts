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

// These instruments need a sound focus other than the wind/voice long-tone template.
const soundFocusByInstrument: Record<string, string> = {
  guitar: 'right-hand', 'bass-guitar': 'tone', ukulele: 'fingerpicking', piano: 'chords',
  other: 'sound-focus',
}

// The broad goals should avoid specialist drills as automatic defaults.
// Players can still add any catalog exercise while reviewing the plan.
const goalStepsByInstrument: Partial<Record<PracticeGoal, Record<string, string[]>>> = {
  balanced: {
    'french-horn': ['long-tones', 'scales', 'slurs', 'piece'],
    'bass-guitar': ['scales', 'groove', 'piece'],
    ukulele: ['chords', 'strumming', 'piece'],
    voice: ['sirens', 'sustained', 'vocalises', 'piece'],
  },
  technique: {
    'french-horn': ['scales', 'articulation', 'slurs', 'etude'],
    'bass-guitar': ['scales', 'technique', 'groove', 'piece'],
    ukulele: ['chords', 'strumming', 'fingerpicking', 'piece'],
    voice: ['sirens', 'vocalises', 'agility'],
    piano: ['scales', 'arpeggios', 'independence', 'etude'],
  },
}

function allocateWeightedMinutes(total: number, weights: number[]): number[] {
  const stepCount = weights.length
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
  const selected = goal === 'sound' && instrumentId === 'voice'
    ? available.filter(item => item.id === 'sirens')
    : available.filter(item => item.topic === 'warmup').slice(0, 1)
  if (goal === 'balanced' && presetFamilyFor(instrumentId) === 'general') {
    const sound = available.find(item => item.id === 'sound-focus')
    if (sound) selected.push(sound)
  }
  if (goal === 'music') {
    const family = presetFamilyFor(instrumentId)
    const preparation = family === 'voice'
      ? available.find(item => item.id === 'sirens')
      : family === 'brass' || family === 'woodwind'
        ? available.find(item => item.topic === 'long-tones')
        : null
    if (preparation && !selected.includes(preparation)) selected.push(preparation)
  }
  if (goal === 'sound') {
    const focus = available.find(item => item.id === soundFocusByInstrument[instrumentId ?? 'other'])
    if (focus && !selected.includes(focus)) selected.push(focus)
  }
  const namedSteps = instrumentId ? goalStepsByInstrument[goal]?.[instrumentId] : undefined
  if (namedSteps) {
    for (const id of namedSteps) {
      const item = available.find(candidate => candidate.id === id && !selected.includes(candidate))
      if (item) selected.push(item)
    }
  } else {
    for (const topic of topics[goal]) {
      const item = available.find(candidate => candidate.topic === topic && !selected.includes(candidate))
      if (item) selected.push(item)
    }
  }
  if (!selected.length && available[0]) selected.push(available[0])
  if (minutes === undefined && goal !== 'music' && goal !== 'sound') {
    return createRoutine(PRACTICE_GOALS.find(item => item.id === goal)?.title ?? 'My practice',
      selected.map(template => stepFromTemplate(template, instrumentId)), instrumentId)
  }
  const total = minutes === undefined
    ? selected.reduce((sum, item) => sum + item.minutes, 0)
    : Number.isFinite(minutes) ? Math.min(90, Math.max(selected.length, Math.round(minutes))) : 20
  const weightedMinutes = goal === 'music'
    ? allocateWeightedMinutes(total, selected.length === 4 ? [0.15, 0.2, 0.4, 0.25] : [0.2, 0.5, 0.3])
    : goal === 'sound'
      ? allocateWeightedMinutes(total, selected.length === 4 ? [0.15, 0.4, 0.25, 0.2] : [0.2, 0.55, 0.25])
      : null
  const plan = selected.map((template, index) => ({ ...stepFromTemplate(template, instrumentId),
    minutes: weightedMinutes?.[index] ?? Math.floor(total / selected.length) + (index < total % selected.length ? 1 : 0) }))
  return createRoutine(PRACTICE_GOALS.find(item => item.id === goal)?.title ?? 'My practice', plan, instrumentId)
}
