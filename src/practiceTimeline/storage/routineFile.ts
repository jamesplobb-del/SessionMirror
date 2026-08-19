import { METER_PULSE_MODES } from '../../metronome/pulseModes'
import { getFeelOption } from '../../metronome/timeSignatureDefinitions'
import { normalizeMetronomeSoundId } from '../../utils/metronomeClickSounds'
import {
  clampBpm,
  METRONOME_METERS,
  normalizeAccentLevels,
  resolveMeterTiming,
  type MetronomeAccentLevel,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import { createSectionId, createTimelineId } from '../sectionDefaults'
import { normalizeTimeline } from '../timelineNormalize'
import type {
  CountInWhen,
  MeterPatternStep,
  PatternRepeatMode,
  PracticeTimeline,
  PracticeTrackSettings,
  SectionAdvanced,
  SectionSubdivision,
  SectionTempoMarker,
  TempoRamp,
  TempoRampShape,
  TimelineSection,
} from '../types'

/**
 * A routine file is written by one musician and opened by another, so nothing
 * inside it can be trusted to be well formed — it may have been hand-edited,
 * truncated in transit, or written by an older or newer build. Every value is
 * therefore checked against the same tables the editor picks from, and anything
 * that fails falls back to a musically sane default instead of reaching the
 * playback engine. The goal is that a good file replays exactly as built, and a
 * bad file still opens as something playable rather than crashing the app.
 */

export const ROUTINE_FILE_FORMAT = 'besttake.practice-routine'
export const ROUTINE_FILE_VERSION = 1
export const ROUTINE_FILE_EXTENSION = 'btroutine'
export const ROUTINE_FILE_UTI = 'com.besttake.app.routine'
export const ROUTINE_FILE_MIME = 'application/json'

/** Well past any real routine — a bigger file is a wrong file, not a big one. */
export const MAX_ROUTINE_FILE_BYTES = 1_000_000

const MAX_SECTIONS = 200
const MAX_PATTERN_STEPS = 64
const MAX_TEMPO_MARKERS = 256
const MAX_BARS = 999
const MAX_NAME_LENGTH = 120
const MAX_TITLE_LENGTH = 80
const MAX_NOTES_LENGTH = 500

export interface RoutineFileEnvelope {
  format: typeof ROUTINE_FILE_FORMAT
  version: number
  app: string
  appVersion?: string
  exportedAt: number
  routine: PracticeTimeline
}

export type RoutineParseResult =
  | { ok: true; routine: PracticeTimeline; warnings: string[] }
  | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

/** Control characters would render as invisible junk in the routine list. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function asText(value: unknown, maxLength: number, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const cleaned = value.replace(CONTROL_CHARS, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : fallback
}

function asOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(CONTROL_CHARS, ' ').trim()
  return cleaned ? cleaned.slice(0, maxLength) : undefined
}

function asInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function asTimestamp(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.round(parsed)
}

/* ------------------------------------------------------------------ */
/* musical values                                                      */
/* ------------------------------------------------------------------ */

const SUBDIVISIONS: MetronomeSubdivision[] = [
  'off',
  '8ths',
  'triplets',
  '16ths',
  'dotted',
  'quints',
  'septuplets',
]

const ACCENT_LEVELS: MetronomeAccentLevel[] = ['strong', 'medium', 'weak', 'silent']

const RAMP_SHAPES: TempoRampShape[] = ['linear', 'stepped', 'ease-in', 'ease-out', 'ease-in-out']

/** Hex only. `color` is unused today, but a shared file must never be able to
 * smuggle arbitrary CSS into a style attribute if it gets wired up later. */
const SAFE_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function parseMeter(value: unknown, warn: (message: string) => void): MetronomeMeter {
  if (typeof value === 'string' && value in METRONOME_METERS) {
    return value as MetronomeMeter
  }
  warn(`Unknown time signature "${String(value)}" replaced with 4/4.`)
  return '4/4'
}

function parsePulseModeId(meter: MetronomeMeter, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const modes = METER_PULSE_MODES[meter] ?? []
  return modes.some((mode) => mode.id === value) ? value : undefined
}

function parseFeelId(
  meter: MetronomeMeter,
  pulseModeId: string | undefined,
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined
  /* getFeelOption falls back to the first option, so compare to confirm the
   * stored feel genuinely exists for this meter rather than accepting the
   * substitute it hands back. */
  return getFeelOption(meter, value, pulseModeId)?.id === value ? value : undefined
}

function parseSubdivision(value: unknown): SectionSubdivision {
  if (value === 'auto') return 'auto'
  return SUBDIVISIONS.includes(value as MetronomeSubdivision)
    ? (value as MetronomeSubdivision)
    : 'auto'
}

function pulseCountFor(
  meter: MetronomeMeter,
  pulseModeId: string | undefined,
  feelId: string | undefined,
): number {
  return resolveMeterTiming(meter, { pulseModeId, feelId }).pulseCount
}

function parseAccents(
  value: unknown,
  meter: MetronomeMeter,
  pulseModeId: string | undefined,
  feelId: string | undefined,
  warn: (message: string) => void,
): MetronomeAccentLevel[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const levels = value.map((level) =>
    ACCENT_LEVELS.includes(level as MetronomeAccentLevel) ? (level as MetronomeAccentLevel) : 'weak',
  )
  const expected = pulseCountFor(meter, pulseModeId, feelId)
  if (levels.length !== expected) {
    warn(`Accent pattern for ${meter} had ${levels.length} beats, adjusted to ${expected}.`)
  }
  return normalizeAccentLevels(meter, levels, feelId, pulseModeId)
}

function parseGrouping(
  value: unknown,
  meter: MetronomeMeter,
  pulseModeId: string | undefined,
  feelId: string | undefined,
  warn: (message: string) => void,
): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const groups = value.map((entry) => asInt(entry, 0, 32, 0)).filter((entry) => entry > 0)
  if (!groups.length) return undefined
  const expected = pulseCountFor(meter, pulseModeId, feelId)
  const sum = groups.reduce((total, entry) => total + entry, 0)
  if (sum !== expected) {
    /* A grouping that doesn't add up to the bar desynchronises the accent
     * scheduler, so drop it and let the meter's own grouping stand. */
    warn(`Beat grouping for ${meter} totalled ${sum} instead of ${expected} — using the default.`)
    return undefined
  }
  return groups
}

/* ------------------------------------------------------------------ */
/* section pieces                                                      */
/* ------------------------------------------------------------------ */

function parseTempoRamp(value: unknown): TempoRamp | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const shape = RAMP_SHAPES.includes(record.shape as TempoRampShape)
    ? (record.shape as TempoRampShape)
    : undefined
  return {
    enabled: record.enabled === true,
    endBpm: clampBpm(asInt(record.endBpm, 1, 400, 120)),
    ...(shape ? { shape } : {}),
  }
}

function parseTempoMarkers(value: unknown, maxMeasure: number): SectionTempoMarker[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const seen = new Set<string>()
  const markers: SectionTempoMarker[] = []
  for (const entry of value.slice(0, MAX_TEMPO_MARKERS)) {
    const record = asRecord(entry)
    if (!record) continue
    const measure = asInt(record.measure, 1, maxMeasure, 1)
    const beat =
      record.beat === undefined || record.beat === null ? undefined : asInt(record.beat, 1, 16, 1)
    const key = `${measure}:${beat ?? 0}`
    if (seen.has(key)) continue
    seen.add(key)
    markers.push({
      id: asText(record.id, 64, `tempo-marker-${measure}-${beat ?? 0}`),
      measure,
      ...(beat === undefined ? {} : { beat }),
      bpm: clampBpm(asInt(record.bpm, 1, 400, 120)),
    })
  }
  markers.sort((a, b) => a.measure - b.measure || (a.beat ?? 1) - (b.beat ?? 1))
  return markers.length ? markers : undefined
}

function parseAdvanced(
  value: unknown,
  meter: MetronomeMeter,
  pulseModeId: string | undefined,
  feelId: string | undefined,
  maxMeasure: number,
  warn: (message: string) => void,
): SectionAdvanced | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const advanced: SectionAdvanced = {}

  const grouping = parseGrouping(record.beatGrouping, meter, pulseModeId, feelId, warn)
  if (grouping) advanced.beatGrouping = grouping

  const accents = parseAccents(record.customAccents, meter, pulseModeId, feelId, warn)
  if (accents) advanced.customAccents = accents

  const ramp = parseTempoRamp(record.tempoRamp)
  if (ramp) advanced.tempoRamp = ramp

  const markers = parseTempoMarkers(record.tempoMarkers, maxMeasure)
  if (markers) advanced.tempoMarkers = markers

  if (typeof record.swing === 'number' && Number.isFinite(record.swing)) {
    advanced.swing = Math.min(1, Math.max(0, record.swing))
  }

  if (typeof record.clickSoundId === 'string') {
    advanced.clickSoundId = normalizeMetronomeSoundId(record.clickSoundId)
  }

  if (record.pickupMeasure === true) advanced.pickupMeasure = true

  const countInBars = asInt(record.countInBars, 0, 16, 0)
  if (countInBars > 0) advanced.countInBars = countInBars

  if (typeof record.color === 'string' && SAFE_COLOR.test(record.color.trim())) {
    advanced.color = record.color.trim()
  }

  const notes = asOptionalText(record.markerNotes, MAX_NOTES_LENGTH)
  if (notes) advanced.markerNotes = notes

  return Object.keys(advanced).length ? advanced : undefined
}

function parsePatternStep(
  value: unknown,
  index: number,
  warn: (message: string) => void,
): MeterPatternStep | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const meter = parseMeter(record.meter, warn)
  const pulseModeId = parsePulseModeId(meter, record.pulseModeId)
  const feelId = parseFeelId(meter, pulseModeId, record.feelId)

  const step: MeterPatternStep = {
    id: asText(record.id, 64, `pattern-step-${index}-${meter.replace('/', '-')}`),
    meter,
    subdivision: parseSubdivision(record.subdivision),
    bars: asInt(record.bars, 1, MAX_BARS, 1),
  }
  if (pulseModeId) step.pulseModeId = pulseModeId
  if (feelId) step.feelId = feelId

  const grouping = parseGrouping(record.beatGrouping, meter, pulseModeId, feelId, warn)
  if (grouping) step.beatGrouping = grouping

  const accents = parseAccents(record.customAccents, meter, pulseModeId, feelId, warn)
  if (accents) step.customAccents = accents

  return step
}

function parsePatternRepeat(value: unknown): PatternRepeatMode | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  if (record.kind === 'totalMeasures') {
    return { kind: 'totalMeasures', measures: asInt(record.measures, 1, 512, 1) }
  }
  if (record.kind === 'cycles') {
    return { kind: 'cycles', cycles: asInt(record.cycles, 1, 99, 1) }
  }
  return undefined
}

function parseSection(
  value: unknown,
  index: number,
  warn: (message: string) => void,
): TimelineSection | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const meter = parseMeter(record.meter, warn)
  const pulseModeId = parsePulseModeId(meter, record.pulseModeId)
  const feelId = parseFeelId(meter, pulseModeId, record.feelId)
  const bars = asInt(record.bars, 1, MAX_BARS, 4)
  const repeatCount = asInt(record.repeatCount, 1, 99, 1)

  const rawSteps = Array.isArray(record.patternSteps)
    ? record.patternSteps.slice(0, MAX_PATTERN_STEPS)
    : []
  const patternSteps = rawSteps
    .map((step, stepIndex) => parsePatternStep(step, stepIndex, warn))
    .filter((step): step is MeterPatternStep => Boolean(step))

  const section: TimelineSection = {
    id: createSectionId(),
    title: asText(record.title, MAX_TITLE_LENGTH, `Section ${index + 1}`),
    bars,
    bpm: clampBpm(asInt(record.bpm, 1, 400, 120)),
    meter,
    subdivision: parseSubdivision(record.subdivision),
    repeatCount,
  }
  if (pulseModeId) section.pulseModeId = pulseModeId
  if (feelId) section.feelId = feelId

  if (patternSteps.length) {
    section.patternSteps = patternSteps
    const repeat = parsePatternRepeat(record.patternRepeat)
    if (repeat) section.patternRepeat = repeat
  }

  const advanced = parseAdvanced(
    record.advanced,
    meter,
    pulseModeId,
    feelId,
    Math.max(1, bars * repeatCount),
    warn,
  )
  if (advanced) section.advanced = advanced

  return section
}

function parseSettings(value: unknown): PracticeTrackSettings {
  const record = asRecord(value)
  const countInWhen: CountInWhen = record?.countInWhen === 'every-loop' ? 'every-loop' : 'start'
  return {
    countInBars: asInt(record?.countInBars, 0, 16, 0),
    countInWhen,
    loopTrack: record?.loopTrack === true,
  }
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/** Filename a recipient sees in Messages or Files. */
export function routineFileName(routine: PracticeTimeline): string {
  const base =
    routine.name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'practice-routine'
  return `${base}.${ROUTINE_FILE_EXTENSION}`
}

export function buildRoutineFile(routine: PracticeTimeline, appVersion?: string): string {
  const envelope: RoutineFileEnvelope = {
    format: ROUTINE_FILE_FORMAT,
    version: ROUTINE_FILE_VERSION,
    app: 'BestTake',
    ...(appVersion ? { appVersion } : {}),
    exportedAt: Date.now(),
    routine,
  }
  return JSON.stringify(envelope, null, 2)
}

/**
 * Turns raw file text into a routine that is safe to store and play. Returns a
 * result rather than throwing so the caller can show the musician what was
 * wrong with a file instead of failing silently.
 */
export function parseRoutineFile(text: string): RoutineParseResult {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'That file is empty.' }
  }
  if (text.length > MAX_ROUTINE_FILE_BYTES) {
    return { ok: false, error: 'That file is too large to be a practice routine.' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't a practice routine." }
  }

  const record = asRecord(parsed)
  if (!record) {
    return { ok: false, error: "That file isn't a practice routine." }
  }

  /* Files written before the format had an envelope were the bare timeline,
   * and the first export used a { version, timeline } wrapper. Accept both so
   * routines shared during testing keep working. */
  const isEnvelope = record.format === ROUTINE_FILE_FORMAT
  const isLegacyWrapper = !isEnvelope && asRecord(record.timeline) !== undefined
  const body = isEnvelope
    ? asRecord(record.routine)
    : isLegacyWrapper
      ? asRecord(record.timeline)
      : record

  if (!body || !Array.isArray(body.sections)) {
    return { ok: false, error: "That file isn't a practice routine." }
  }

  if (isEnvelope && asInt(record.version, 0, 9999, 0) > ROUTINE_FILE_VERSION) {
    return {
      ok: false,
      error: 'That routine was made in a newer version of BestTake. Update the app to open it.',
    }
  }

  const warnings: string[] = []
  const warn = (message: string) => {
    if (warnings.length < 12 && !warnings.includes(message)) warnings.push(message)
  }

  if (body.sections.length > MAX_SECTIONS) {
    warn(`Only the first ${MAX_SECTIONS} sections were imported.`)
  }

  const sections = body.sections
    .slice(0, MAX_SECTIONS)
    .map((section, index) => parseSection(section, index, warn))
    .filter((section): section is TimelineSection => Boolean(section))

  if (!sections.length) {
    return { ok: false, error: 'That routine has no playable sections.' }
  }

  const now = Date.now()
  const routine = normalizeTimeline({
    id: createTimelineId(),
    name: asText(body.name, MAX_NAME_LENGTH, 'Shared Routine'),
    sections,
    favorite: false,
    settings: parseSettings(body.settings),
    createdAt: asTimestamp(body.createdAt, now),
    updatedAt: now,
  })

  return { ok: true, routine, warnings }
}

/** True when a filename looks like a routine we should try to open. */
export function isRoutineFileName(name: string): boolean {
  return /\.(btroutine|besttake-timeline\.json)$/i.test(name.trim())
}
