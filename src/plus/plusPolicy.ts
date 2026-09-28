import { difficultyRangeFor } from '../labs/staffJumper/staffJumperDifficultyRanges'

export const PLUS_TRIAL_MS = 7 * 24 * 60 * 60 * 1000
export const FREE_ROUTINE_LIMIT = 1
export const FREE_MULTITRACK_BOXES = 2
export type PlusFeature = 'handsfree' | 'music' | 'youtube' | 'insights' | 'routines' | 'multitrack' | 'staffJumper'

export const PLUS_FEATURES: Record<PlusFeature, { title: string; detail: string }> = {
  handsfree: { title: 'Hands-free recording', detail: 'Record a take, hear it back, and start the next one without touching the screen.' },
  music: { title: 'Sheet music and backing tracks', detail: 'Add scores and backing tracks to your practice room and routines.' },
  youtube: { title: 'YouTube references', detail: 'Save and play YouTube references while you practice.' },
  insights: { title: 'Pitch Insights', detail: 'See your pitch history and note tendencies.' },
  routines: { title: 'More routines', detail: 'Save as many routines as you like. One saved routine is free.' },
  multitrack: { title: 'More multitrack boxes', detail: 'Add a third box or more to a multitrack project.' },
  staffJumper: { title: 'More Staff Jumper options', detail: 'Use every key, custom scales, two octaves, and hard difficulty.' },
}

export interface PlusEntitlement {
  purchased: boolean
  alphaUnlocked: boolean
  canRedeemAlpha: boolean
  trialStartedAt: number | null
  trialExpiresAt: number | null
}

export function hasPlusAccess(entitlement: PlusEntitlement, now: number): boolean {
  return entitlement.purchased || (entitlement.canRedeemAlpha && entitlement.alphaUnlocked) ||
    (entitlement.trialStartedAt !== null && entitlement.trialExpiresAt !== null &&
      now >= entitlement.trialStartedAt && now < entitlement.trialExpiresAt)
}

export function isFreeStaffJumperSetup(setup: { key?: string; mode?: string; range?: string; difficulty?: string; customScale?: unknown; rangeLowMidi?: number; rangeHighMidi?: number; instrumentId?: string | null }): boolean {
  const graded = difficultyRangeFor(setup.instrumentId ?? null, setup.difficulty === 'medium' ? 'medium' : 'easy')
  const isGradedRange = graded !== null && setup.rangeLowMidi === graded.lowMidi && setup.rangeHighMidi === graded.highMidi
  const span = setup.rangeLowMidi !== undefined && setup.rangeHighMidi !== undefined
    ? Math.abs(setup.rangeHighMidi - setup.rangeLowMidi) : 0
  const isSingleOctave = setup.range === '1-octave' && span <= 12
  return ['C', 'G', 'F', 'D', 'Bb', 'Eb'].includes(setup.key ?? '') &&
    setup.mode === 'major' && setup.difficulty !== 'hard' && !setup.customScale &&
    (isGradedRange || isSingleOctave)
}
