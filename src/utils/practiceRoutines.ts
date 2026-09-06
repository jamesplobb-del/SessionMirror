import type { LabsRoute } from '../components/labs/LabsOverlay'
import type { DeskSnapshot } from './workspaceDesks'
import { summarizeDesk } from './workspaceDesks'
import type { TunerTranspositionId } from './tunerTransposition'

/**
 * A daily routine is a short checklist. Each step remembers which surface it
 * opens and how the desk should be set (click, drone, hands-free, camera or
 * audio), so starting a step is one tap instead of four toggles.
 *
 * It is deliberately not a bar-counted program: the practice timeline still
 * exists for that. A routine only knows "what", "how long", and "with what".
 */

export type RoutineStepKind =
  /** Opens the Tuner tab. A drone may come with it. */
  | 'tune'
  /** Opens the Metronome tab with the click running. */
  | 'metro'
  /** Opens the recorder (audio or camera) on its reusable practice item. */
  | 'record'
  /** Opens Focused Practice on a practice item, reference ready. */
  | 'focus'
  /** Opens one of the practice games. */
  | 'game'
  /** A checklist line with nothing to open. */
  | 'free'

export type RoutineTopic =
  | 'warmup'
  | 'long-tones'
  | 'flexibility'
  | 'scales'
  | 'technique'
  | 'articulation'
  | 'etude'
  | 'piece'
  | 'sight-reading'
  | 'rhythm'
  | 'ear'
  | 'improv'
  | 'cooldown'
  | 'other'

export interface RoutineStep {
  id: string
  title: string
  /** Target length in minutes. 0 means untimed. */
  minutes: number
  kind: RoutineStepKind
  topic: RoutineTopic
  /** Desk preset applied when the step starts. Null leaves the room as it is. */
  desk: DeskSnapshot | null
  /** Practice item for any tool/recording step. Bound on its first start. */
  projectId: string | null
  /** What to suggest when no reference has been selected yet. */
  referenceQuery: string
  /**
   * A recording pinned in the builder, as a YouTube video ID. When set it
   * loads on start instead of opening the search - `referenceQuery` stays the
   * fallback for items where you would rather choose in the moment.
   */
  referenceVideoId: string | null
  /** Existing metronome timeline ID. Recording remains owned by the normal camera/audio controls. */
  programId: string | null
  /** For `game` steps. */
  gameRoute: LabsRoute | null
}

export interface Routine {
  id: string
  name: string
  instrumentId: string | null
  steps: RoutineStep[]
  createdAt: number
  updatedAt: number
}

/** One day's progress through the routine. Resets when the date changes. */
export interface RoutineDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  routineId: string
  doneStepIds: string[]
  skippedStepIds: string[]
  /** The step in flight, so a cold start can offer to pick it back up. */
  activeStepId: string | null
  activeStepStartedAt: number | null
  startedAt: number | null
  completedAt: number | null
  /** Paused items stay resumable without counting time away. */
  pausedStepId: string | null
  itemsByStep: Record<string, { title: string; projectId: string | null }>
  elapsedMsByStep: Record<string, number>
  sessionIdsByStep: Record<string, string[]>
  /** Temporary desk changes belong to this day, not the routine preset. */
  desksByStep: Record<string, DeskSnapshot>
  updatedAt: number
}

const ROUTINE_KEY = 'besttake:practice-routine:v1'
const DAY_KEY = 'besttake:practice-routine-day:v1'
const HISTORY_KEY = 'besttake:routine-history:v1:'
const INSTRUMENT_KEY = 'besttake:instrument-id:v1'

const KINDS: readonly RoutineStepKind[] = ['tune', 'metro', 'record', 'focus', 'game', 'free']
const TOPICS: readonly RoutineTopic[] = [
  'warmup',
  'long-tones',
  'flexibility',
  'scales',
  'technique',
  'articulation',
  'etude',
  'piece',
  'sight-reading',
  'rhythm',
  'ear',
  'improv',
  'cooldown',
  'other',
]
const GAME_ROUTES: readonly LabsRoute[] = ['menu', 'staff-jumper', 'balance', 'learn-instrument']

export const MAX_ROUTINE_STEPS = 12
export const MAX_STEP_TITLE = 40
export const MAX_ROUTINE_NAME = 28

export const KIND_LABEL: Record<RoutineStepKind, string> = {
  tune: 'Tuner',
  metro: 'Metronome',
  record: 'Record',
  focus: 'Record',
  game: 'Game',
  free: 'Checklist',
}

export const TOPIC_LABEL: Record<RoutineTopic, string> = {
  warmup: 'Warm-up',
  'long-tones': 'Long tones',
  flexibility: 'Flexibility',
  scales: 'Scales',
  technique: 'Technique',
  articulation: 'Articulation',
  etude: 'Etude',
  piece: 'Piece',
  'sight-reading': 'Sight-reading',
  rhythm: 'Rhythm',
  ear: 'Ear',
  improv: 'Improvisation',
  cooldown: 'Cool-down',
  other: 'Other',
}

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** A neutral desk: audio surface, nothing on. Steps build up from here. */
export function blankDesk(mode: DeskSnapshot['mode'] = 'audio'): DeskSnapshot {
  return {
    mode,
    pitchTrackerEnabled: false,
    showMetronome: false,
    showDrone: false,
    showTakeCards: true,
    autoSoundRecording: false,
    audioEnhancerEnabled: false,
    metronome: { bpm: 80, meter: '4/4', subdivision: 'off' },
    drone: { pitchClass: null, octave: 4 },
    soundSilenceSeconds: 2,
  }
}

export function createStep(partial: Partial<RoutineStep> & { title: string }): RoutineStep {
  return {
    id: partial.id ?? makeId('step'),
    title: partial.title.trim().slice(0, MAX_STEP_TITLE) || 'Step',
    minutes: clampMinutes(partial.minutes ?? 5),
    kind: partial.kind ?? 'free',
    topic: partial.topic ?? 'other',
    desk: partial.desk ?? null,
    projectId: partial.projectId ?? null,
    referenceQuery: (partial.referenceQuery ?? '').trim().slice(0, 80),
    referenceVideoId: /^[\w-]{11}$/.test(partial.referenceVideoId ?? '') ? partial.referenceVideoId! : null,
    programId: partial.programId ?? null,
    gameRoute: partial.gameRoute ?? null,
  }
}

export function createRoutine(name: string, steps: RoutineStep[], instrumentId: string | null): Routine {
  const now = Date.now()
  return {
    id: makeId('routine'),
    name: name.trim().slice(0, MAX_ROUTINE_NAME) || 'Daily routine',
    instrumentId,
    steps: steps.slice(0, MAX_ROUTINE_STEPS),
    createdAt: now,
    updatedAt: now,
  }
}

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 5
  return Math.max(0, Math.min(60, Math.round(value)))
}

/* ---- Parsing ------------------------------------------------------------ */

function parseDesk(value: unknown): DeskSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const mode = raw.mode === 'video' ? 'video' : 'audio'
  const base = blankDesk(mode)
  const metronome = (raw.metronome ?? {}) as Record<string, unknown>
  const drone = (raw.drone ?? {}) as Record<string, unknown>
  const pitchClass = Number(drone.pitchClass)
  return {
    mode,
    pitchTrackerEnabled: Boolean(raw.pitchTrackerEnabled),
    showMetronome: Boolean(raw.showMetronome),
    showDrone: Boolean(raw.showDrone),
    showTakeCards: raw.showTakeCards === undefined ? true : Boolean(raw.showTakeCards),
    autoSoundRecording: Boolean(raw.autoSoundRecording),
    audioEnhancerEnabled: Boolean(raw.audioEnhancerEnabled),
    metronome: {
      bpm: Number.isFinite(Number(metronome.bpm)) ? Number(metronome.bpm) : base.metronome.bpm,
      meter: (typeof metronome.meter === 'string' ? metronome.meter : '4/4') as DeskSnapshot['metronome']['meter'],
      subdivision: (typeof metronome.subdivision === 'string'
        ? metronome.subdivision
        : 'off') as DeskSnapshot['metronome']['subdivision'],
    },
    drone: {
      pitchClass:
        drone.pitchClass !== null &&
        drone.pitchClass !== undefined &&
        Number.isInteger(pitchClass) &&
        pitchClass >= 0 &&
        pitchClass <= 11
          ? pitchClass
          : null,
      octave: Number.isFinite(Number(drone.octave)) ? Number(drone.octave) : 4,
    },
    soundSilenceSeconds: Number.isFinite(Number(raw.soundSilenceSeconds))
      ? Number(raw.soundSilenceSeconds)
      : 2,
  }
}

export function parseStep(value: unknown): RoutineStep | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.title !== 'string') return null
  return createStep({
    id: raw.id,
    title: raw.title,
    minutes: Number(raw.minutes),
    kind: KINDS.includes(raw.kind as RoutineStepKind) ? (raw.kind as RoutineStepKind) : 'free',
    topic: TOPICS.includes(raw.topic as RoutineTopic) ? (raw.topic as RoutineTopic) : 'other',
    desk: parseDesk(raw.desk),
    projectId: typeof raw.projectId === 'string' ? raw.projectId : null,
    referenceQuery: typeof raw.referenceQuery === 'string' ? raw.referenceQuery : '',
    referenceVideoId: typeof raw.referenceVideoId === 'string' ? raw.referenceVideoId : null,
    programId: typeof raw.programId === 'string' && raw.programId.trim() ? raw.programId : null,
    gameRoute: GAME_ROUTES.includes(raw.gameRoute as LabsRoute) ? (raw.gameRoute as LabsRoute) : null,
  })
}

export function parseRoutine(value: unknown): Routine | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.steps)) return null
  const steps = raw.steps.map(parseStep).filter((step): step is RoutineStep => step !== null)
  return {
    id: raw.id,
    name: raw.name.trim().slice(0, MAX_ROUTINE_NAME) || 'Daily routine',
    instrumentId: typeof raw.instrumentId === 'string' ? raw.instrumentId : null,
    steps: steps.slice(0, MAX_ROUTINE_STEPS),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : 0,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
  }
}

/* ---- Storage ------------------------------------------------------------ */

export function loadRoutine(): Routine | null {
  try {
    const raw = localStorage.getItem(ROUTINE_KEY)
    return raw ? parseRoutine(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveRoutine(routine: Routine | null): void {
  try {
    if (routine) localStorage.setItem(ROUTINE_KEY, JSON.stringify(routine))
    else localStorage.removeItem(ROUTINE_KEY)
  } catch {
    /* private mode / quota */
  }
}

export function loadPreferredInstrumentId(): string | null {
  try {
    return localStorage.getItem(INSTRUMENT_KEY)
  } catch {
    return null
  }
}

export function savePreferredInstrumentId(id: string): void {
  try {
    localStorage.setItem(INSTRUMENT_KEY, id)
  } catch {
    /* private mode / quota */
  }
}

/* ---- Today -------------------------------------------------------------- */

export function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function freshRoutineDay(routineId: string): RoutineDay {
  return {
    date: todayKey(),
    routineId,
    doneStepIds: [],
    skippedStepIds: [],
    activeStepId: null,
    activeStepStartedAt: null,
    startedAt: null,
    completedAt: null,
    pausedStepId: null,
    itemsByStep: {},
    elapsedMsByStep: {},
    sessionIdsByStep: {},
    desksByStep: {},
    updatedAt: Date.now(),
  }
}

function parseDay(value: unknown): RoutineDay | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.date !== 'string' || typeof raw.routineId !== 'string') return null
  const ids = (list: unknown) =>
    Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : []
  const num = (n: unknown) => (Number.isFinite(Number(n)) && n !== null ? Number(n) : null)
  return {
    date: raw.date,
    routineId: raw.routineId,
    doneStepIds: ids(raw.doneStepIds),
    skippedStepIds: ids(raw.skippedStepIds),
    activeStepId: typeof raw.activeStepId === 'string' ? raw.activeStepId : null,
    activeStepStartedAt: num(raw.activeStepStartedAt),
    startedAt: num(raw.startedAt),
    completedAt: num(raw.completedAt),
    pausedStepId: typeof raw.pausedStepId === 'string' ? raw.pausedStepId : null,
    itemsByStep: Object.fromEntries(Object.entries(objectMap(raw.itemsByStep)).flatMap(([id, value]) => {
      const item = objectMap(value)
      return typeof item.title === 'string' ? [[id, { title: item.title.slice(0, MAX_STEP_TITLE), projectId: typeof item.projectId === 'string' ? item.projectId : null }]] : []
    })),
    elapsedMsByStep: Object.fromEntries(Object.entries(objectMap(raw.elapsedMsByStep))
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) as Record<string, number>,
    sessionIdsByStep: Object.fromEntries(Object.entries(objectMap(raw.sessionIdsByStep)).map(([id, v]) => [id, ids(v)])),
    desksByStep: Object.fromEntries(Object.entries(objectMap(raw.desksByStep))
      .flatMap(([id, v]) => { const desk = parseDesk(v); return desk ? [[id, desk]] : [] })),
    updatedAt: num(raw.updatedAt) ?? num(raw.activeStepStartedAt) ?? 0,
  }
}

function objectMap(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** History is retained per routine, so switching plans or rolling midnight loses no checks. */
export function loadRoutineHistory(routineId: string): RoutineDay[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY + encodeURIComponent(routineId)) ?? '[]')
    return Array.isArray(rows) ? rows.map(parseDay).filter((row): row is RoutineDay => Boolean(row && row.routineId === routineId))
      .sort((a, b) => b.date.localeCompare(a.date)) : []
  } catch { return [] }
}

export function loadRoutineDay(routine: Routine): RoutineDay {
  try {
    const raw = localStorage.getItem(DAY_KEY)
    const legacy = raw ? parseDay(JSON.parse(raw)) : null
    if (legacy && !loadRoutineHistory(legacy.routineId).some(row => row.date === legacy.date)) saveRoutineDay(pauseRoutineDay(legacy, legacy.updatedAt))
    const saved = loadRoutineHistory(routine.id).find(row => row.date === todayKey())
    const candidate = legacy?.routineId === routine.id && legacy.date === todayKey() ? legacy : null
    const parsed = saved && (!candidate || saved.updatedAt > candidate.updatedAt) ? saved : candidate
    // After a cold launch, resume is deliberate. Never count time the app was closed.
    if (parsed) return reconcileDay(pauseRoutineDay(parsed, parsed.updatedAt), routine)
  } catch { /* fall through */ }
  return freshRoutineDay(routine.id)
}

/** Throws on storage failure so the caller can report that progress is not durable. */
export function saveRoutineDay(day: RoutineDay | null): void {
  if (!day) { localStorage.removeItem(DAY_KEY); return }
  const rows = loadRoutineHistory(day.routineId)
  localStorage.setItem(HISTORY_KEY + encodeURIComponent(day.routineId), JSON.stringify([
    day, ...rows.filter(row => row.date !== day.date),
  ]))
  localStorage.setItem(DAY_KEY, JSON.stringify(day))
}

/** Accrue only the active interval; checkpointing is safe to repeat. */
export function checkpointRoutineDay(day: RoutineDay, now = Date.now(), desk?: DeskSnapshot | null): RoutineDay {
  const id = day.activeStepId
  if (!id) return day
  const delta = day.activeStepStartedAt === null ? 0 : Math.max(0, now - day.activeStepStartedAt)
  return {
    ...day, updatedAt: now, activeStepStartedAt: now,
    elapsedMsByStep: { ...day.elapsedMsByStep, [id]: (day.elapsedMsByStep[id] ?? 0) + delta },
    desksByStep: desk ? { ...day.desksByStep, [id]: desk } : day.desksByStep,
  }
}

export function pauseRoutineDay(day: RoutineDay, now = Date.now(), desk?: DeskSnapshot | null): RoutineDay {
  const next = checkpointRoutineDay(day, now, desk)
  return { ...next, activeStepId: null, activeStepStartedAt: null,
    pausedStepId: day.activeStepId ?? day.pausedStepId, updatedAt: now }
}

/**
 * Opening Home is a peek, not a stop. Bank the time so far and stop the clock,
 * but keep the item current so coming back needs no second decision. Idle time
 * still never counts as practice.
 */
export function holdRoutineDay(day: RoutineDay, now = Date.now(), desk?: DeskSnapshot | null): RoutineDay {
  if (!day.activeStepId) return day
  return { ...checkpointRoutineDay(day, now, desk), activeStepStartedAt: null, updatedAt: now }
}

/** Restart the clock on a held item. A genuine pause has no activeStepId. */
export function resumeRoutineDay(day: RoutineDay, now = Date.now()): RoutineDay {
  if (!day.activeStepId || day.activeStepStartedAt !== null) return day
  return { ...day, activeStepStartedAt: now, updatedAt: now }
}

export function startRoutineDayStep(day: RoutineDay, stepId: string, sessionId: string | null, now = Date.now(), item?: { title: string; projectId: string | null }): RoutineDay {
  const next = checkpointRoutineDay(day, now)
  return {
    ...next, itemsByStep: item ? { ...day.itemsByStep, [stepId]: day.itemsByStep[stepId] ?? item } : day.itemsByStep,
    activeStepId: stepId, activeStepStartedAt: now, pausedStepId: null,
    startedAt: day.startedAt ?? now, completedAt: null, updatedAt: now,
    doneStepIds: day.doneStepIds.filter(id => id !== stepId),
    skippedStepIds: day.skippedStepIds.filter(id => id !== stepId),
    sessionIdsByStep: sessionId ? { ...day.sessionIdsByStep,
      [stepId]: [...new Set([...(day.sessionIdsByStep[stepId] ?? []), sessionId])] } : day.sessionIdsByStep,
  }
}

export function settleRoutineDayStep(day: RoutineDay, routine: Routine, stepId: string, outcome: 'done' | 'skipped', now = Date.now()): RoutineDay {
  const next = day.activeStepId === stepId ? pauseRoutineDay(day, now) : day
  const item = routine.steps.find(step => step.id === stepId)
  return reconcileDay({ ...next, updatedAt: now,
    itemsByStep: item ? { ...next.itemsByStep, [stepId]: next.itemsByStep[stepId] ?? { title: item.title, projectId: item.projectId } } : next.itemsByStep,
    pausedStepId: next.pausedStepId === stepId ? null : next.pausedStepId,
    doneStepIds: [...next.doneStepIds.filter(id => id !== stepId), ...(outcome === 'done' ? [stepId] : [])],
    skippedStepIds: [...next.skippedStepIds.filter(id => id !== stepId), ...(outcome === 'skipped' ? [stepId] : [])],
    startedAt: next.startedAt ?? now,
  }, routine)
}

/** Drops progress against steps that were edited away. */
export function reconcileDay(day: RoutineDay, routine: Routine): RoutineDay {
  const ids = new Set(routine.steps.map((step) => step.id))
  const done = day.doneStepIds.filter((id) => ids.has(id))
  const skipped = day.skippedStepIds.filter((id) => ids.has(id) && !done.includes(id))
  const active = day.activeStepId && ids.has(day.activeStepId) ? day.activeStepId : null
  const allSettled = routine.steps.length > 0 && routine.steps.every((step) => done.includes(step.id) || skipped.includes(step.id))
  return {
    ...day,
    routineId: routine.id,
    doneStepIds: done,
    skippedStepIds: skipped,
    pausedStepId: day.pausedStepId && ids.has(day.pausedStepId) && !done.includes(day.pausedStepId) && !skipped.includes(day.pausedStepId) ? day.pausedStepId : null,
    activeStepId: active,
    activeStepStartedAt: active ? day.activeStepStartedAt : null,
    completedAt: allSettled ? day.completedAt ?? Date.now() : null,
  }
}

export function isStepDone(day: RoutineDay | null, stepId: string): boolean {
  return Boolean(day?.doneStepIds.includes(stepId))
}

export function isStepSkipped(day: RoutineDay | null, stepId: string): boolean {
  return Boolean(day?.skippedStepIds.includes(stepId))
}

export function isStepSettled(day: RoutineDay | null, stepId: string): boolean {
  return isStepDone(day, stepId) || isStepSkipped(day, stepId)
}

/** The first step that is neither done nor skipped, after `afterStepId` when given. */
export function nextOpenStep(routine: Routine, day: RoutineDay | null, afterStepId?: string | null): RoutineStep | null {
  const startIndex = afterStepId ? routine.steps.findIndex((step) => step.id === afterStepId) + 1 : 0
  const ordered = [...routine.steps.slice(startIndex), ...routine.steps.slice(0, startIndex)]
  return ordered.find((step) => !isStepSettled(day, step.id)) ?? null
}

export function routineProgress(routine: Routine, day: RoutineDay | null): {
  done: number
  total: number
  minutesLeft: number
  minutesTotal: number
  complete: boolean
} {
  const total = routine.steps.length
  const done = routine.steps.filter((step) => isStepDone(day, step.id)).length
  const skipped = routine.steps.filter((step) => isStepSkipped(day, step.id)).length
  const minutesTotal = routine.steps.reduce((sum, step) => sum + step.minutes, 0)
  const minutesLeft = routine.steps
    .filter((step) => !isStepSettled(day, step.id))
    .reduce((sum, step) => sum + step.minutes, 0)
  return {
    done,
    total,
    minutesLeft,
    minutesTotal,
    complete: total > 0 && done + skipped === total,
  }
}

/* ---- Words -------------------------------------------------------------- */

/** One literal line for a step: what it opens and what is on. */
export function summarizeStep(step: RoutineStep, transposition: TunerTranspositionId): string {
  const parts: string[] = []
  if (step.kind === 'game') {
    parts.push(
      step.gameRoute === 'staff-jumper'
        ? 'Staff Jumper'
        : step.gameRoute === 'balance'
          ? 'Balance'
          : step.gameRoute === 'learn-instrument'
            ? 'Learn'
            : 'Games',
    )
  } else if (step.kind === 'tune') {
    parts.push('Tuner')
  } else if (step.kind === 'metro') {
    parts.push('Metronome')
  } else if (step.kind === 'focus') {
    parts.push('Record & compare')
  }
  if (step.desk && step.kind !== 'game' && step.kind !== 'free') {
    const desk = summarizeDesk(step.desk, transposition)
    // The surface word at the end is redundant for tool tabs.
    const trimmed = step.kind === 'tune' || step.kind === 'metro'
      ? desk.replace(/(?:^| · )(Camera|Audio)$/, '')
      : desk
    if (trimmed) parts.push(trimmed)
  }
  if (step.minutes > 0) parts.push(`${step.minutes} min`)
  return parts.join(' · ')
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'Untimed'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function describeToday(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
