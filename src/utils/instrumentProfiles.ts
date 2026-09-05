/**
 * Instrument presets for Practice Home and onboarding.
 *
 * The Home title is the chooser: picking an instrument is shorthand for the
 * settings a player would otherwise have to find individually:
 *
 *   - `tunerInstrument`  — the pitch detection profile (voice / strings / winds).
 *   - `tunerTransposition` — the note the player reads off the page, so a
 *     trumpet playing written C does not read as a concert B♭.
 *   - `soundVolumeThreshold` — hands-free auto-record needs a higher gate for a
 *     trumpet than for a nylon-string guitar.
 *
 * Capture profile, enhancer, and drone timbre stay where they are: those are
 * taste, not instrument facts. Switching horns does not reset today’s routine
 * checks or rewrite desks the player already built.
 */
import type { TunerInstrument } from './pitchConfig'
import type { TunerTranspositionId } from './tunerTransposition'
import type { AppSettings } from './appSettings'

export type InstrumentFamily = 'Brass' | 'Woodwind' | 'Strings' | 'Voice & keys'

export interface InstrumentProfile {
  id: string
  /** Shown on the picker pill. Keep it short enough for a phone. */
  label: string
  family: InstrumentFamily
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  /** Hands-free auto-record gate (1–100). Higher = must play louder to start. */
  soundVolumeThreshold: number
}

/**
 * Auto-record gates by acoustic output, not by family. A flute and a violin
 * sit in the same band; a trumpet and an alto sax sit well above it. All three
 * stay under 70, which is where the Settings slider starts labelling itself
 * "Loud only" — the picker should bias the gate, not preset an extreme.
 */
const QUIET_GATE = 16
const MEDIUM_GATE = 24
const LOUD_GATE = 34

export const INSTRUMENT_PROFILES: readonly InstrumentProfile[] = [
  // Brass — loud, fast attacks, wide written-pitch spread.
  {
    id: 'trumpet',
    label: 'Trumpet / cornet',
    family: 'Brass',
    tunerInstrument: 'winds',
    tunerTransposition: 'bb',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'french-horn',
    label: 'French horn',
    family: 'Brass',
    tunerInstrument: 'winds',
    tunerTransposition: 'f',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'trombone',
    label: 'Trombone',
    family: 'Brass',
    tunerInstrument: 'winds',
    tunerTransposition: 'concert',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'euphonium',
    label: 'Euphonium / baritone',
    family: 'Brass',
    tunerInstrument: 'winds',
    // Treble-clef B♭ reading, which is what most band parts use. Bass-clef
    // readers can switch to Concert pitch in Settings.
    tunerTransposition: 'bb_octave',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'tuba',
    label: 'Tuba',
    family: 'Brass',
    tunerInstrument: 'winds',
    tunerTransposition: 'concert',
    soundVolumeThreshold: MEDIUM_GATE,
  },

  // Woodwind.
  {
    id: 'flute',
    label: 'Flute',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'piccolo',
    label: 'Piccolo',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'c_octave_up',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'clarinet',
    label: 'Clarinet (B♭)',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'bb',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'bass-clarinet',
    label: 'Bass clarinet',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'bb_octave',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'soprano-sax',
    label: 'Soprano sax',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'bb',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'alto-sax',
    label: 'Alto sax',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'eb',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'tenor-sax',
    label: 'Tenor sax',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'bb_octave',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'bari-sax',
    label: 'Baritone sax',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'eb_octave',
    soundVolumeThreshold: LOUD_GATE,
  },
  {
    id: 'oboe',
    label: 'Oboe',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'concert',
    soundVolumeThreshold: MEDIUM_GATE,
  },
  {
    id: 'bassoon',
    label: 'Bassoon',
    family: 'Woodwind',
    tunerInstrument: 'winds',
    tunerTransposition: 'concert',
    soundVolumeThreshold: MEDIUM_GATE,
  },

  // Strings — the strings profile trades attack speed for an exact readout.
  {
    id: 'violin',
    label: 'Violin',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'viola',
    label: 'Viola',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'cello',
    label: 'Cello',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'double-bass',
    label: 'Double bass',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'c_octave_down',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'guitar',
    label: 'Guitar',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'c_octave_down',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'bass-guitar',
    label: 'Bass guitar',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'c_octave_down',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'ukulele',
    label: 'Ukulele',
    family: 'Strings',
    tunerInstrument: 'strings',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },

  // Voice and keys.
  {
    id: 'voice',
    label: 'Voice',
    family: 'Voice & keys',
    tunerInstrument: 'voice',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'piano',
    label: 'Piano / keys',
    family: 'Voice & keys',
    tunerInstrument: 'strings',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
  {
    id: 'other',
    label: 'Something else',
    family: 'Voice & keys',
    tunerInstrument: 'voice',
    tunerTransposition: 'concert',
    soundVolumeThreshold: QUIET_GATE,
  },
] as const

/** Render order for the picker. */
export const INSTRUMENT_FAMILIES: readonly InstrumentFamily[] = [
  'Brass',
  'Woodwind',
  'Strings',
  'Voice & keys',
]

const PROFILE_BY_ID = new Map(INSTRUMENT_PROFILES.map((profile) => [profile.id, profile]))

export function getInstrumentProfile(id: string): InstrumentProfile | undefined {
  return PROFILE_BY_ID.get(id)
}

export function getInstrumentProfilesByFamily(family: InstrumentFamily): InstrumentProfile[] {
  return INSTRUMENT_PROFILES.filter((profile) => profile.family === family)
}

/** The settings patch a chosen instrument implies. */
export type InstrumentSettingsPatch = Pick<
  AppSettings,
  'tunerInstrument' | 'tunerTransposition' | 'soundVolumeThreshold'
>

export function getInstrumentSettings(id: string): InstrumentSettingsPatch | null {
  const profile = PROFILE_BY_ID.get(id)
  if (!profile) return null
  return {
    tunerInstrument: profile.tunerInstrument,
    tunerTransposition: profile.tunerTransposition,
    soundVolumeThreshold: profile.soundVolumeThreshold,
  }
}

/** Short enough to be the Practice Home title. "Trumpet / cornet" → "Trumpet". */
export function instrumentHeading(id: string | null): string {
  if (!id) return 'Choose your instrument'
  const profile = PROFILE_BY_ID.get(id)
  if (!profile) return 'Choose your instrument'
  return profile.label.split(' / ')[0] ?? profile.label
}

export function describeHandsFreeGate(threshold: number): string {
  if (threshold >= LOUD_GATE) return 'Loud gate'
  if (threshold >= MEDIUM_GATE) return 'Medium gate'
  return 'Quiet gate'
}
