import { initVaultDatabase, persistVaultWebStore } from './connection'
import { safeRandomUUID } from '../utils/uuid'

export const PITCH_INSIGHTS_UPDATED_EVENT = 'besttake:pitch-insights-updated'

export type PitchInsightsUpdatedDetail =
  | { kind: 'saved'; observation: PitchObservation }
  | { kind: 'cleared' }
  | { kind: 'range-deleted'; startAt: number; endAt: number }

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
  }
}

function dispatchInsightsUpdated(detail: PitchInsightsUpdatedDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PITCH_INSIGHTS_UPDATED_EVENT, { detail }))
}

export async function listPitchObservations(options?: {
  transpositionId?: string
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
  const result = transpositionId
    ? limit == null
      ? await db.query(
          'SELECT * FROM pitch_observations WHERE transposition_id = ? ORDER BY observed_at DESC',
          [transpositionId],
        )
      : await db.query(
          'SELECT * FROM pitch_observations WHERE transposition_id = ? ORDER BY observed_at DESC LIMIT ?',
          [transpositionId, limit],
        )
    : limit == null
      ? await db.query('SELECT * FROM pitch_observations ORDER BY observed_at DESC')
      : await db.query(
          'SELECT * FROM pitch_observations ORDER BY observed_at DESC LIMIT ?',
          [limit],
        )

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
  }

  const db = await initVaultDatabase()
  await db.run(
    `INSERT INTO pitch_observations (
      id, midi_note, note_name, octave, cents_offset, observed_at,
      duration_ms, sample_count, variability_cents, tuner_instrument,
      transposition_id, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
): Promise<void> {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return Promise.reject(new Error('Pitch Insights reset range is invalid.'))
  }

  return enqueueWrite(async () => {
    const db = await initVaultDatabase()
    await db.run(
      'DELETE FROM pitch_observations WHERE observed_at >= ? AND observed_at < ?',
      [Math.round(startAt), Math.round(endAt)],
    )
    await persistVaultWebStore()
    dispatchInsightsUpdated({ kind: 'range-deleted', startAt, endAt })
  })
}
