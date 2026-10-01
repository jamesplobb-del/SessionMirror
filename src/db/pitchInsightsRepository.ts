import { initVaultDatabase, persistVaultWebStore } from './connection'
import { safeRandomUUID } from '../utils/uuid'

export const PITCH_INSIGHTS_UPDATED_EVENT = 'besttake:pitch-insights-updated'
/** Synchronous capture boundary; completion is reported separately below. */
export const PITCH_INSIGHTS_RESET_EVENT = 'besttake:pitch-insights-reset'

export interface PitchObservationScope {
  transpositionId?: string
  instrumentProfileId?: string | null
}

export type PitchInsightsResetDetail =
  | { kind: 'all'; requestedAt: number }
  | { kind: 'range'; requestedAt: number; startAt: number; endAt: number; transpositionId?: string; instrumentProfileId?: string | null }
  | ({ kind: 'session-range'; requestedAt: number; sessionId: string; startAt: number; endAt: number } & PitchObservationScope)

export type PitchInsightsUpdatedDetail =
  | { kind: 'saved'; observation: PitchObservation }
  | { kind: 'cleared' }
  | { kind: 'range-deleted'; startAt: number; endAt: number; transpositionId?: string; instrumentProfileId?: string | null }
  | ({ kind: 'session-range-deleted'; sessionId: string; startAt: number; endAt: number } & PitchObservationScope)

export interface PitchObservation {
  id: string
  midiNote: number
  noteName: string
  octave: number
  centsOffset: number
  observedAt: number
  durationMs: number
  sampleCount: number
  variabilityCents: number
  tunerInstrument: string
  transpositionId: string
  sessionId: string | null
  instrumentProfileId?: string | null
  instrumentProfileName?: string | null
}

export type SavePitchObservationInput = Omit<PitchObservation, 'id'> & { id?: string }

type SqlRow = Record<string, unknown>

let writeQueue = Promise.resolve()

function enqueueWrite<T>(perform: () => Promise<T>): Promise<T> {
  const operation = writeQueue.then(perform, perform)
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

function mapPitchObservation(row: SqlRow): PitchObservation {
  return {
    id: String(row.id),
    midiNote: Number(row.midi_note),
    noteName: String(row.note_name),
    octave: Number(row.octave),
    centsOffset: Number(row.cents_offset),
    observedAt: Number(row.observed_at),
    durationMs: Number(row.duration_ms),
    sampleCount: Number(row.sample_count),
    variabilityCents: Number(row.variability_cents ?? 0),
    tunerInstrument: String(row.tuner_instrument ?? 'voice'),
    transpositionId: String(row.transposition_id ?? 'concert'),
    sessionId: row.session_id == null ? null : String(row.session_id),
    instrumentProfileId: row.instrument_profile_id == null ? null : String(row.instrument_profile_id),
    instrumentProfileName: row.instrument_profile_name == null ? null : String(row.instrument_profile_name),
  }
}

function dispatchInsightsUpdated(detail: PitchInsightsUpdatedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PITCH_INSIGHTS_UPDATED_EVENT, { detail }))
}

function dispatchResetRequested(detail: PitchInsightsResetDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PITCH_INSIGHTS_RESET_EVENT, { detail }))
}

export async function listPitchObservations(options?: {
  transpositionId?: string
  instrumentProfileId?: string | null
  limit?: number
}): Promise<PitchObservation[]> {
  // Quick Tuner can launch before the full app boot path has opened SQLite.
  // Initializing lazily keeps Pitch Insights available from either entry point.
  // Wait for pending stable-note writes so an initial all-time read cannot
  // overwrite a just-arrived observation with an older snapshot.
  await writeQueue
  const db = await initVaultDatabase()
  const limit = options?.limit == null ? null : Math.max(1, Math.round(options.limit))
  const transpositionId = options?.transpositionId
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (transpositionId) { clauses.push('transposition_id = ?'); params.push(transpositionId) }
  if (options?.instrumentProfileId !== undefined) {
    clauses.push(options.instrumentProfileId === null ? 'instrument_profile_id IS NULL' : 'instrument_profile_id = ?')
    if (options.instrumentProfileId !== null) params.push(options.instrumentProfileId)
  }
  if (limit != null) params.push(limit)
  const result = await db.query(`SELECT * FROM pitch_observations${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY observed_at DESC${limit != null ? ' LIMIT ?' : ''}`, params)

  return (result.values ?? []).map((row) => mapPitchObservation(row as SqlRow))
}

async function performSavePitchObservation(
  input: SavePitchObservationInput,
): Promise<PitchObservation> {
  const observation: PitchObservation = {
    ...input,
    id: input.id ?? safeRandomUUID(),
    midiNote: Math.round(input.midiNote),
    octave: Math.round(input.octave),
    centsOffset: Number(input.centsOffset.toFixed(3)),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    sampleCount: Math.max(1, Math.round(input.sampleCount)),
    variabilityCents: Math.max(0, Number(input.variabilityCents.toFixed(3))),
    tunerInstrument: input.tunerInstrument || 'voice',
    transpositionId: input.transpositionId || 'concert',
    sessionId: input.sessionId ?? null,
    instrumentProfileId: input.instrumentProfileId ?? null,
    instrumentProfileName: input.instrumentProfileName ?? null,
  }

  const db = await initVaultDatabase()
  await db.run(
    `INSERT INTO pitch_observations (
      id, midi_note, note_name, octave, cents_offset, observed_at,
      duration_ms, sample_count, variability_cents, tuner_instrument,
      transposition_id, session_id, instrument_profile_id, instrument_profile_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      observation.midiNote,
      observation.noteName,
      observation.octave,
      observation.centsOffset,
      observation.observedAt,
      observation.durationMs,
      observation.sampleCount,
      observation.variabilityCents,
      observation.tunerInstrument,
      observation.transpositionId,
      observation.sessionId,
      observation.instrumentProfileId,
      observation.instrumentProfileName,
    ],
  )

  await persistVaultWebStore()
  dispatchInsightsUpdated({ kind: 'saved', observation })
  return observation
}

export function savePitchObservation(
  input: SavePitchObservationInput,
): Promise<PitchObservation> {
  return enqueueWrite(() => performSavePitchObservation(input))
}

export function clearPitchObservations(): Promise<void> {
  // Discard live candidates before another frame can finish them. Writes
  // already queued settle before this deletion; new tones queue afterward.
  dispatchResetRequested({ kind: 'all', requestedAt: Date.now() })
  return enqueueWrite(async () => {
    const db = await initVaultDatabase()
    await db.run('DELETE FROM pitch_observations')
    await persistVaultWebStore()
    dispatchInsightsUpdated({ kind: 'cleared' })
  })
}

export function deletePitchObservationsInRange(
  startAt: number,
  endAt: number,
  transpositionId?: string,
  instrumentProfileId?: string | null,
): Promise<void> {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return Promise.reject(new Error('Pitch Insights reset range is invalid.'))
  }

  dispatchResetRequested({ kind: 'range', requestedAt: Date.now(), startAt, endAt, transpositionId, ...(instrumentProfileId !== undefined ? { instrumentProfileId } : {}) })
  return enqueueWrite(async () => {
    const db = await initVaultDatabase()
    const clauses = ['observed_at >= ?', 'observed_at < ?']
    const params: (string | number)[] = [Math.round(startAt), Math.round(endAt)]
    if (transpositionId) { clauses.push('transposition_id = ?'); params.push(transpositionId) }
    if (instrumentProfileId !== undefined) {
      clauses.push(instrumentProfileId === null ? 'instrument_profile_id IS NULL' : 'instrument_profile_id = ?')
      if (instrumentProfileId !== null) params.push(instrumentProfileId)
    }
    await db.run(`DELETE FROM pitch_observations WHERE ${clauses.join(' AND ')}`, params)
    await persistVaultWebStore()
    dispatchInsightsUpdated({ kind: 'range-deleted', startAt, endAt, transpositionId, ...(instrumentProfileId !== undefined ? { instrumentProfileId } : {}) })
  })
}

/** Removes only the readings from this tuner's noisy stretch. */
export function deletePitchObservationsForSessionRange(
  sessionId: string,
  startAt: number,
  endAt: number,
  scope: PitchObservationScope = {},
): Promise<void> {
  if (!sessionId || !Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return Promise.reject(new Error('Pitch Insights session cleanup range is invalid.'))
  }

  // Snapshot the origin scope before the queued write or a profile switch.
  const scopedFields = {
    ...(scope.transpositionId !== undefined ? { transpositionId: scope.transpositionId } : {}),
    ...(scope.instrumentProfileId !== undefined ? { instrumentProfileId: scope.instrumentProfileId } : {}),
  }
  dispatchResetRequested({ kind: 'session-range', requestedAt: Date.now(), sessionId, startAt, endAt, ...scopedFields })
  return enqueueWrite(async () => {
    const db = await initVaultDatabase()
    const clauses = ['session_id = ?', 'observed_at >= ?', 'observed_at < ?']
    const params: (string | number)[] = [sessionId, Math.round(startAt), Math.round(endAt)]
    if (scopedFields.transpositionId) { clauses.push('transposition_id = ?'); params.push(scopedFields.transpositionId) }
    if (scopedFields.instrumentProfileId !== undefined) {
      clauses.push(scopedFields.instrumentProfileId === null ? 'instrument_profile_id IS NULL' : 'instrument_profile_id = ?')
      if (scopedFields.instrumentProfileId !== null) params.push(scopedFields.instrumentProfileId)
    }
    await db.run(`DELETE FROM pitch_observations WHERE ${clauses.join(' AND ')}`, params)
    await persistVaultWebStore()
    dispatchInsightsUpdated({ kind: 'session-range-deleted', sessionId, startAt, endAt, ...scopedFields })
  })
}
