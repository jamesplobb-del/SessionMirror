import type { PitchObservation } from '../db/pitchInsightsRepository'

export const PITCH_INSIGHTS_THRESHOLDS = {
  earlyTendencyObservations: 3,
  establishedTendencyObservations: 12,
  centeredCents: 3,
  slightTendencyCents: 7,
  consistentVariabilityCents: 4,
  moderateVariabilityCents: 9,
  recentWindowDays: 14,
  minimumTrendGroupObservations: 4,
  meaningfulImprovementCents: 2,
  inferredSessionGapMs: 30 * 60 * 1000,
} as const

export type PitchInsightConfidence = 'collecting' | 'early' | 'established'
export type PitchTendency =
  | 'Centered'
  | 'Slightly Flat'
  | 'Slightly Sharp'
  | 'Tends Flat'
  | 'Tends Sharp'

export interface NotePitchInsight {
  midiNote: number
  noteName: string
  observationCount: number
  typicalCents: number
  recentCents: number | null
  historicalCents: number | null
  typicalVariability: number
  consistency: 'Consistent' | 'Moderate' | 'Variable'
  confidence: PitchInsightConfidence
  tendency: PitchTendency
  improvementCents: number | null
  observations: PitchObservation[]
}

export interface PitchPracticeSessionSummary {
  id: string
  startedAt: number
  endedAt: number
  observationCount: number
  pitchCount: number
  typicalCents: number
  observations: PitchObservation[]
}

export interface PitchPracticeDaySummary {
  key: string
  startAt: number
  endAt: number
  observationCount: number
  pitchCount: number
  sessionCount: number
  typicalCents: number
  sessions: PitchPracticeSessionSummary[]
  observations: PitchObservation[]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localPracticeDayBounds(timestamp: number): {
  key: string
  startAt: number
  endAt: number
} {
  const date = new Date(timestamp)
  const startAt = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const endAt = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  return { key: localDayKey(timestamp), startAt, endAt }
}

function summarizeSession(
  id: string,
  observations: PitchObservation[],
): PitchPracticeSessionSummary {
  const sorted = [...observations].sort((left, right) => left.observedAt - right.observedAt)
  return {
    id,
    startedAt: sorted[0]?.observedAt ?? 0,
    endedAt: sorted[sorted.length - 1]?.observedAt ?? 0,
    observationCount: sorted.length,
    pitchCount: new Set(sorted.map((observation) => observation.midiNote)).size,
    typicalCents: median(sorted.map((observation) => observation.centsOffset)),
    observations: sorted,
  }
}

/**
 * Builds the human-facing practice history from raw observations. Day bounds
 * use local time so sessions appear under the date the musician expects. Very
 * old observations without a session ID are split after 30 minutes of silence.
 */
export function summarizePitchPracticeDays(
  observations: PitchObservation[],
): PitchPracticeDaySummary[] {
  const dayGroups = new Map<
    string,
    { startAt: number; endAt: number; observations: PitchObservation[] }
  >()

  for (const observation of observations) {
    if (!Number.isFinite(observation.observedAt)) continue
    const bounds = localPracticeDayBounds(observation.observedAt)
    const group = dayGroups.get(bounds.key) ?? {
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      observations: [],
    }
    group.observations.push(observation)
    dayGroups.set(bounds.key, group)
  }

  return [...dayGroups.entries()]
    .map(([key, day]) => {
      const sorted = [...day.observations].sort(
        (left, right) => left.observedAt - right.observedAt,
      )
      const sessionGroups = new Map<string, PitchObservation[]>()
      let inferredSessionIndex = 0
      let inferredSessionKey: string | null = null
      let lastUnassignedObservationAt: number | null = null

      for (const observation of sorted) {
        let sessionKey: string
        if (observation.sessionId) {
          sessionKey = `session:${observation.sessionId}`
        } else {
          const startsNewInferredSession =
            inferredSessionKey == null ||
            lastUnassignedObservationAt == null ||
            observation.observedAt - lastUnassignedObservationAt >
              PITCH_INSIGHTS_THRESHOLDS.inferredSessionGapMs
          if (startsNewInferredSession) {
            inferredSessionIndex += 1
            inferredSessionKey = `inferred:${key}:${inferredSessionIndex}`
          }
          sessionKey = inferredSessionKey!
          lastUnassignedObservationAt = observation.observedAt
        }

        const session = sessionGroups.get(sessionKey) ?? []
        session.push(observation)
        sessionGroups.set(sessionKey, session)
      }

      const sessions = [...sessionGroups.entries()]
        .map(([id, group]) => summarizeSession(id, group))
        .sort((left, right) => right.startedAt - left.startedAt)

      return {
        key,
        startAt: day.startAt,
        endAt: day.endAt,
        observationCount: sorted.length,
        pitchCount: new Set(sorted.map((observation) => observation.midiNote)).size,
        sessionCount: sessions.length,
        typicalCents: median(sorted.map((observation) => observation.centsOffset)),
        sessions,
        observations: sorted,
      } satisfies PitchPracticeDaySummary
    })
    .sort((left, right) => right.startAt - left.startAt)
}

function dispersionAround(values: number[], center: number): number {
  if (values.length < 2) return 0
  const meanSquareDistance =
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length
  return Math.sqrt(meanSquareDistance)
}

function confidenceForCount(count: number): PitchInsightConfidence {
  if (count >= PITCH_INSIGHTS_THRESHOLDS.establishedTendencyObservations) return 'established'
  if (count >= PITCH_INSIGHTS_THRESHOLDS.earlyTendencyObservations) return 'early'
  return 'collecting'
}

export function tendencyForCents(cents: number): PitchTendency {
  const magnitude = Math.abs(cents)
  if (magnitude <= PITCH_INSIGHTS_THRESHOLDS.centeredCents) return 'Centered'
  if (magnitude <= PITCH_INSIGHTS_THRESHOLDS.slightTendencyCents) {
    return cents < 0 ? 'Slightly Flat' : 'Slightly Sharp'
  }
  return cents < 0 ? 'Tends Flat' : 'Tends Sharp'
}

function consistencyForVariability(
  variability: number,
): NotePitchInsight['consistency'] {
  if (variability <= PITCH_INSIGHTS_THRESHOLDS.consistentVariabilityCents) return 'Consistent'
  if (variability <= PITCH_INSIGHTS_THRESHOLDS.moderateVariabilityCents) return 'Moderate'
  return 'Variable'
}

export function aggregatePitchInsights(
  observations: PitchObservation[],
  now = Date.now(),
): NotePitchInsight[] {
  const recentBoundary =
    now - PITCH_INSIGHTS_THRESHOLDS.recentWindowDays * 24 * 60 * 60 * 1000
  const groups = new Map<number, PitchObservation[]>()

  for (const observation of observations) {
    const group = groups.get(observation.midiNote) ?? []
    group.push(observation)
    groups.set(observation.midiNote, group)
  }

  return [...groups.entries()]
    .map(([midiNote, group]) => {
      const sorted = [...group].sort((left, right) => right.observedAt - left.observedAt)
      const recent = sorted.filter((observation) => observation.observedAt >= recentBoundary)
      const historical = sorted.filter((observation) => observation.observedAt < recentBoundary)
      const typicalCents = median(sorted.map((observation) => observation.centsOffset))
      const recentCents = recent.length
        ? median(recent.map((observation) => observation.centsOffset))
        : null
      const historicalCents = historical.length
        ? median(historical.map((observation) => observation.centsOffset))
        : null
      // Consistency describes repeatability across separate played notes. The
      // per-observation variability field describes steadiness within one held
      // note and remains stored for future drill-down, but using it here would
      // incorrectly call alternating sharp/flat observations "consistent."
      const typicalVariability = dispersionAround(
        sorted.map((observation) => observation.centsOffset),
        typicalCents,
      )
      const canCompareTrend =
        recent.length >= PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations &&
        historical.length >= PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations
      const rawImprovement = canCompareTrend && recentCents != null && historicalCents != null
        ? Math.abs(historicalCents) - Math.abs(recentCents)
        : null
      const improvementCents =
        rawImprovement != null &&
        Math.abs(rawImprovement) >= PITCH_INSIGHTS_THRESHOLDS.meaningfulImprovementCents
          ? rawImprovement
          : null

      return {
        midiNote,
        noteName: sorted[0]?.noteName ?? '—',
        observationCount: sorted.length,
        typicalCents,
        recentCents,
        historicalCents,
        typicalVariability,
        consistency: consistencyForVariability(typicalVariability),
        confidence: confidenceForCount(sorted.length),
        tendency: tendencyForCents(typicalCents),
        improvementCents,
        observations: sorted,
      } satisfies NotePitchInsight
    })
    .sort((left, right) => left.midiNote - right.midiNote)
}

/**
 * Top notes to review, ranked by how far off center they are — scaled down
 * for notes with few observations so a wildly-off note seen 4 times can't
 * outrank a moderately-off note seen 40 times. Notes still in the
 * 'collecting' confidence band are excluded entirely: there isn't enough
 * data yet to call them a habit worth fixing.
 */
export function rankNotesWorthReviewing(
  insights: NotePitchInsight[],
  limit = 3,
): NotePitchInsight[] {
  return insights
    .filter((insight) => insight.confidence !== 'collecting')
    .map((insight) => ({
      insight,
      score:
        Math.abs(insight.typicalCents) *
        Math.min(
          1,
          insight.observationCount / PITCH_INSIGHTS_THRESHOLDS.establishedTendencyObservations,
        ),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ insight }) => insight)
}

export interface OverallPitchTrend {
  overallCents: number
  /** Positive means recent playing sits closer to center than before; null
   * when there isn't enough data on both sides of the window to compare. */
  deltaCents: number | null
}

/**
 * Same recent-vs-historical comparison as aggregatePitchInsights, pooled
 * across every note instead of grouped by one — the headline "how am I
 * doing overall" number for the Pitch Insights hero.
 */
export function summarizeOverallPitchTrend(
  observations: PitchObservation[],
  now = Date.now(),
): OverallPitchTrend {
  const recentBoundary =
    now - PITCH_INSIGHTS_THRESHOLDS.recentWindowDays * 24 * 60 * 60 * 1000
  const overallCents = median(observations.map((observation) => observation.centsOffset))

  const recent = observations.filter((observation) => observation.observedAt >= recentBoundary)
  const historical = observations.filter((observation) => observation.observedAt < recentBoundary)
  const canCompare =
    recent.length >= PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations &&
    historical.length >= PITCH_INSIGHTS_THRESHOLDS.minimumTrendGroupObservations
  if (!canCompare) return { overallCents, deltaCents: null }

  const recentCents = median(recent.map((observation) => observation.centsOffset))
  const historicalCents = median(historical.map((observation) => observation.centsOffset))
  const rawDelta = Math.abs(historicalCents) - Math.abs(recentCents)
  const deltaCents =
    Math.abs(rawDelta) >= PITCH_INSIGHTS_THRESHOLDS.meaningfulImprovementCents ? rawDelta : null

  return { overallCents, deltaCents }
}

export function describePitchInsight(insight: NotePitchInsight): string {
  const cents = Math.round(Math.abs(insight.typicalCents))
  if (insight.confidence === 'collecting') {
    return `Still learning ${insight.noteName}.`
  }
  if (insight.consistency === 'Variable') {
    if (insight.tendency === 'Centered') {
      return `${insight.noteName} varies on either side of center from one note to the next.`
    }
    const direction = insight.typicalCents < 0 ? 'flat' : 'sharp'
    return `${insight.noteName} averages ${cents} ${cents === 1 ? 'cent' : 'cents'} ${direction}, but varies from note to note.`
  }
  if (insight.tendency === 'Centered') {
    return `${insight.noteName} is one of your more centered notes.`
  }
  const direction = insight.typicalCents < 0 ? 'flat' : 'sharp'
  return `${insight.noteName} typically sits ${cents} ${cents === 1 ? 'cent' : 'cents'} ${direction}.`
}

/** Pitch-class token from a tuner note name (`Bb4` → `Bb`, `F#5` → `F#`). */
export function pitchClassFromNoteName(noteName: string): string {
  const match = /^([A-G](?:#|b|♭)?)(.*)$/i.exec(noteName.trim())
  return match?.[1] ?? noteName
}

/**
 * One quiet line for the live tuner. Silent while still collecting, and
 * silent for notes that already sit on center — the caret covers that.
 */
export function describeLivePitchCoach(
  insight: NotePitchInsight,
  writtenPitchClass: string,
): string | null {
  if (insight.confidence === 'collecting') return null
  if (insight.tendency === 'Centered' && insight.consistency !== 'Variable') return null

  if (insight.tendency === 'Centered') {
    return `${writtenPitchClass} usually wanders around center`
  }

  const cents = Math.round(Math.abs(insight.typicalCents))
  const signed = `${insight.typicalCents < 0 ? '-' : '+'}${cents}`
  const varies = insight.consistency === 'Variable' ? ', and varies' : ''
  return `Usually ${signed}¢ on this ${writtenPitchClass}${varies}`
}
