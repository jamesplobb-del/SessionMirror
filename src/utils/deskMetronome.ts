import { clampBpm, getMeterDefaults, normalizeAccentLevels, TIME_SIGNATURE_DEFINITIONS, type MetronomeMeter, type MetronomePrefs, type MetronomeSubdivision } from './metronomeConfig'
import { getPulseModeById } from '../metronome/pulseModes'
import { getAvailableSubdivisions } from './metronomeConfig'
import { normalizeMetronomeSoundId } from './metronomeClickSounds'

/** Migrate old three-field desks and validate imported routine settings. */
export function normalizeDeskMetronome(value: unknown): MetronomePrefs {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const meter = typeof raw.meter === 'string' && Object.hasOwn(TIME_SIGNATURE_DEFINITIONS, raw.meter) ? raw.meter as MetronomeMeter : '4/4'
  const mode = getPulseModeById(meter, typeof raw.pulseModeId === 'string' ? raw.pulseModeId : undefined)
  const defaults = getMeterDefaults(meter, mode.id)
  const feelId = mode.feelOptions?.some(feel => feel.id === raw.feelId) ? raw.feelId as string : defaults.feelId
  const available = getAvailableSubdivisions(meter, mode.id)
  const subdivision = available.includes(raw.subdivision as MetronomeSubdivision) ? raw.subdivision as MetronomeSubdivision : defaults.subdivision
  return {
    bpm: Number.isFinite(Number(raw.bpm)) ? clampBpm(Number(raw.bpm)) : 120,
    meter, subdivision, pulseModeId: mode.id, feelId,
    accentLevels: normalizeAccentLevels(meter, Array.isArray(raw.accentLevels) ? raw.accentLevels.map(level => ['strong', 'medium', 'weak', 'silent'].includes(level) ? level : undefined) : [], feelId, mode.id),
    soundId: normalizeMetronomeSoundId(String(raw.soundId ?? 'classic')),
  }
}
