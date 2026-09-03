/**
 * Rhythm reading for Staff Jumper — the judging that runs when the metronome is on.
 *
 * With the click off the run is paced by the player: a note scores the moment
 * its pitch is heard and the hop follows after a short dwell. With the click
 * on, the click is the conductor. Every written note has a place on its grid
 * — an onset, in beats from the first note, and a length — and the player is
 * asked to put the attack on that onset and stay on the note for its length.
 * The character does the same: it stands on a whole note for all four beats
 * and only hops when the next note is due.
 *
 * How rhythm is defined here follows what the research on timing says:
 *
 *  • Rhythm is a pattern of *onsets*. Perception studies and performance
 *    analysis alike work from inter-onset intervals (IOIs); the sounded length
 *    of a tone divided by its IOI is *articulation*, an expressive choice, not
 *    a rhythmic one. Measured articulation in real performances averages about
 *    0.84 with a standard deviation near 0.18 (Jerkert 2004, organ), staccato
 *    is routinely sounded for under half the written length (Bresin & Battel
 *    2000; C. P. E. Bach 1753), and none of that is heard as a wrong rhythm.
 *    So the beat is judged from the attack, and the hold is reported but never
 *    penalised.
 *
 *  • Even good synchronisers are not exact. Tapping to a click, trained
 *    musicians show a spread (SD) of roughly 10–20 ms and tend to land 20–60 ms
 *    *ahead* of the click (Repp 2005; Repp & Su 2013); non-musicians spread to
 *    30–50 ms or more. Rhythm games and assessment tools therefore use windows
 *    an order of magnitude wider than the spread. "On the beat" here is the
 *    existing ±18 % of a pulse, clamped to 90–220 ms, which is the "good"
 *    band of a typical rhythm game; anything inside a wider acceptance window
 *    still counts as the right note, merely early or late.
 *
 *  • The acceptance window must not be wider than the notes around it, or an
 *    attack could belong to two different written notes. It is therefore half
 *    the neighbouring event on either side (the previous event for early, this
 *    event for late), and never more than half a pulse, so fast passages are
 *    judged more tightly than slow ones — which is also how they are heard.
 *
 *  • The detector reports a pitch some tens of milliseconds after the attack
 *    (a 2048-sample analysis frame at 48 kHz plus a 32 ms publish interval),
 *    so the measured attack is pulled back by a fixed compensation before it
 *    is compared with the grid.
 *
 * Everything in here is pure arithmetic over sixteenth-note units and
 * milliseconds; the game loop supplies the clock.
 */
import {
  onBeatWindowMs,
  secondsPerPulse,
  type MeterSpec,
  type NoteValue,
  type RhythmSlot,
} from './staffJumperRhythm'

/**
 * How long after the true attack the pitch tracker first reports the note.
 *
 * Half a 2048-sample frame at 48 kHz (~21 ms) plus a 32 ms readout publish
 * interval, with a little slack for the animation frame the game reads it on.
 * Subtracted from every measured attack so a musician who is genuinely on the
 * click is not told they are late.
 */
export const PITCH_DETECTION_LATENCY_MS = 55

/**
 * A momentary dropout that does *not* count as the end of a held note.
 *
 * Wind players and singers cross registers, breathe through a tie and produce
 * attacks the detector loses for a frame or two; a real release is longer.
 */
export const HOLD_DROPOUT_GRACE_MS = 90

/**
 * Sounded length, as a fraction of the written length, below which a long
 * note is reported as cut short. Staccato sits under 0.5 and a "natural"
 * articulation around 0.84, so anything past half the note is a hold.
 */
export const HOLD_FULL_FRACTION = 0.5

/** Widest the acceptance window may reach on either side, as a fraction of a pulse. */
const ACCEPT_WINDOW_MAX_PULSE_FRACTION = 0.5
/** How much of the neighbouring event the window may borrow. */
const ACCEPT_WINDOW_NEIGHBOUR_FRACTION = 0.5
/**
 * Time allowed after the late edge for the pitch to stabilise before the beat
 * is declared missed. The detector needs ~30 ms of steady pitch to accept a
 * note, so an attack right on the edge would otherwise be thrown away.
 */
export const LATE_EDGE_GRACE_MS = 40
/** Smallest late window that still lets a note be recognised at all. */
const LATE_WINDOW_FLOOR_MS = 24

export interface OnsetWindow {
  /** Half-width of the "on the beat" band. */
  onMs: number
  /** How far before the written onset an attack is still this note. */
  earlyMs: number
  /** How far after the written onset an attack is still this note. */
  lateMs: number
  /**
   * How long after the written onset the note is given up on. Normally the
   * late edge plus the stability grace, but always inside the note's own
   * length, so a very short note at a very fast tempo is still settled before
   * the run moves on from it.
   */
  closeMs: number
}

export type OnsetPlacement = 'early' | 'on' | 'late'

export function unitMs(meter: MeterSpec, bpm: number): number {
  return (secondsPerPulse(bpm) * 1000) / meter.pulseUnits
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * The window an attack must land in to be this note.
 *
 * Early borrows from the event before (a note or a rest), late from the note
 * itself, and neither reaches past half a pulse. The late edge is additionally
 * kept clear of the next event's onset so that every note is settled — landed
 * or missed — before the run moves on to the next one.
 */
export function onsetWindowFor(
  slot: RhythmSlot,
  previous: RhythmSlot | null,
  meter: MeterSpec,
  bpm: number,
): OnsetWindow {
  const pulseMs = secondsPerPulse(bpm) * 1000
  const perUnit = unitMs(meter, bpm)
  const onMs = onBeatWindowMs(bpm)
  const thisMs = slot.durationUnits * perUnit
  const previousMs = previous ? previous.durationUnits * perUnit : thisMs
  const maxMs = pulseMs * ACCEPT_WINDOW_MAX_PULSE_FRACTION

  const earlyMs = clamp(previousMs * ACCEPT_WINDOW_NEIGHBOUR_FRACTION, onMs, Math.max(onMs, maxMs))
  const lateUnclamped = clamp(thisMs * ACCEPT_WINDOW_NEIGHBOUR_FRACTION, onMs, Math.max(onMs, maxMs))
  const lateMs = Math.max(
    LATE_WINDOW_FLOOR_MS,
    Math.min(lateUnclamped, thisMs - LATE_EDGE_GRACE_MS - 10),
  )
  const closeMs = Math.min(lateMs + LATE_EDGE_GRACE_MS, Math.max(1, thisMs - 5))
  return { onMs, earlyMs, lateMs, closeMs }
}

/** Where an attack sat relative to the beat it was written on. */
export function judgeOnset(errorMs: number, window: OnsetWindow): OnsetPlacement {
  if (Math.abs(errorMs) <= window.onMs) return 'on'
  return errorMs < 0 ? 'early' : 'late'
}

/** The click has passed the last moment this note could still be attacked. */
export function attackWindowClosed(gridMs: number, onsetMs: number, window: OnsetWindow): boolean {
  return gridMs > onsetMs + window.closeMs
}

export type HoldQuality = 'full' | 'short'

/**
 * Was a long note held, or let go early?
 *
 * Reported for notes of a beat or more; shorter notes are naturally detached
 * and the detector cannot measure their release with any confidence anyway.
 */
export function classifyHold(soundedMs: number, writtenMs: number): HoldQuality {
  if (writtenMs <= 0) return 'full'
  return soundedMs / writtenMs >= HOLD_FULL_FRACTION ? 'full' : 'short'
}

export function holdIsReported(slot: RhythmSlot, meter: MeterSpec): boolean {
  return !slot.isRest && slot.durationUnits >= meter.pulseUnits
}

/* ── Naming what is written and what was played ──────────────────────────── */

export const NOTE_VALUE_NAMES: Record<NoteValue, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  sixteenth: 'sixteenth',
}

/** "Dotted quarter", "Eighth rest". */
export function valueName(value: NoteValue, dotted: boolean, isRest = false): string {
  const base = `${dotted ? 'dotted ' : ''}${NOTE_VALUE_NAMES[value]}${isRest ? ' rest' : ''}`
  return base.charAt(0).toUpperCase() + base.slice(1)
}

const FRACTION_GLYPHS: readonly [number, string][] = [
  [1 / 6, '⅙'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [5 / 6, '⅚'],
]

/**
 * A length in beats, the way a musician would say it: "1 beat", "½ beat",
 * "1½ beats", and in 6/8 "⅓ beat" for an eighth because the beat there is
 * the dotted quarter the tempo counts.
 */
export function formatBeats(durationUnits: number, meter: MeterSpec): string {
  const pulses = durationUnits / meter.pulseUnits
  const whole = Math.floor(pulses + 1e-9)
  const fraction = pulses - whole
  let glyph = ''
  if (fraction > 1e-6) {
    let best = FRACTION_GLYPHS[0]!
    for (const candidate of FRACTION_GLYPHS) {
      if (Math.abs(candidate[0] - fraction) < Math.abs(best[0] - fraction)) best = candidate
    }
    glyph = best[1]
  }
  const number = `${whole > 0 ? whole : ''}${glyph}` || '0'
  const plural = pulses > 1 + 1e-6
  return `${number} ${plural ? 'beats' : 'beat'}`
}

const SIMPLE_SUBDIVISION_SYLLABLES = ['', 'e', '&', 'a'] as const
const COMPOUND_SUBDIVISION_SYLLABLES = ['', 'e', '&', '& e', 'a', 'a e'] as const

/**
 * Where in the bar a slot begins, counted aloud: "on 3", "on the & of 2".
 *
 * Simple meter counts "1 e & a"; compound counts each dotted-quarter beat as
 * "1 & a" so the three eighths of a 6/8 beat each get a syllable.
 */
export function countLabel(slot: Pick<RhythmSlot, 'unitsIntoMeasure'>, meter: MeterSpec): string {
  const beat = Math.floor(slot.unitsIntoMeasure / meter.pulseUnits) + 1
  const remainder = slot.unitsIntoMeasure % meter.pulseUnits
  if (remainder === 0) return `on ${beat}`
  const syllables =
    meter.pulseUnits === 6 ? COMPOUND_SUBDIVISION_SYLLABLES : SIMPLE_SUBDIVISION_SYLLABLES
  const syllable = syllables[remainder] ?? '+'
  return `on the ${syllable} of ${beat}`
}

export interface WrittenRhythm {
  /** "Dotted quarter", "Quarter rest". */
  name: string
  /** "1½ beats". */
  beats: string
  /** "on the & of 2". */
  count: string
  /** One line for a HUD: "Dotted quarter · 1½ beats · on 3". */
  summary: string
}

/** What the page asks for at this slot, in words. */
export function describeWrittenRhythm(slot: RhythmSlot, meter: MeterSpec): WrittenRhythm {
  const name = valueName(slot.value, slot.dotted, slot.isRest)
  const beats = formatBeats(slot.durationUnits, meter)
  const count = countLabel(slot, meter)
  return { name, beats, count, summary: `${name} · ${beats} · ${count}` }
}

/**
 * Lengths the player's spacing is matched against, in sixteenth units.
 *
 * Plain and dotted values from a sixteenth to a whole — the vocabulary the
 * game writes, so an identification always names something the player has
 * seen on the staff.
 */
const IDENTIFIABLE_UNITS: readonly { units: number; value: NoteValue; dotted: boolean }[] = [
  { units: 1, value: 'sixteenth', dotted: false },
  { units: 2, value: 'eighth', dotted: false },
  { units: 3, value: 'eighth', dotted: true },
  { units: 4, value: 'quarter', dotted: false },
  { units: 6, value: 'quarter', dotted: true },
  { units: 8, value: 'half', dotted: false },
  { units: 12, value: 'half', dotted: true },
  { units: 16, value: 'whole', dotted: false },
]

export interface PlayedRhythm {
  /** Nearest written length to the spacing the player produced, in sixteenths. */
  units: number
  /** "a dotted quarter", or "5 beats" when the gap matches no single value. */
  label: string
  /** True when the spacing reads as the length the page asked for. */
  matchesWritten: boolean
  /** The raw spacing, in sixteenths, before it was snapped. */
  ioiUnits: number
}

function describeUnits(units: number, meter: MeterSpec): string {
  const known = IDENTIFIABLE_UNITS.find((entry) => entry.units === units)
  if (!known) return formatBeats(units, meter)
  const name = `${known.dotted ? 'dotted ' : ''}${NOTE_VALUE_NAMES[known.value]}`
  const article = /^[aeiou]/.test(name) ? 'an' : 'a'
  return `${article} ${name}`
}

/**
 * Identify the rhythm the player actually produced.
 *
 * The spacing from the previous attack to this one is the played IOI; the
 * written IOI is the distance between the two notes on the page (rests
 * included, since silence is part of the spacing). The played IOI is snapped
 * to the nearest written length on a *ratio* scale — rhythm is heard as
 * proportion, so 22 % over a quarter is still a quarter, but a quarter and a
 * half reads as a dotted quarter. The written length is always a candidate,
 * so a spacing the vocabulary cannot name (a quarter followed by a sixteenth
 * rest, say) is still recognised when it is played right.
 */
export function identifyPlayedRhythm(
  playedIoiMs: number,
  writtenIoiUnits: number,
  meter: MeterSpec,
  bpm: number,
): PlayedRhythm | null {
  if (!(playedIoiMs > 0) || !(writtenIoiUnits > 0)) return null
  const ioiUnits = playedIoiMs / unitMs(meter, bpm)

  const candidates = new Set<number>(IDENTIFIABLE_UNITS.map((entry) => entry.units))
  candidates.add(writtenIoiUnits)

  let best = writtenIoiUnits
  let bestDistance = Number.POSITIVE_INFINITY
  for (const units of candidates) {
    const distance = Math.abs(Math.log(ioiUnits / units))
    // Ties go to what was written — the player gets the benefit of the doubt.
    if (distance < bestDistance - 1e-9) {
      bestDistance = distance
      best = units
    }
  }

  return {
    units: best,
    label: describeUnits(best, meter),
    matchesWritten: best === writtenIoiUnits,
    ioiUnits,
  }
}

/** Written spacing between two sounded slots, in sixteenths. */
export function writtenIoiUnits(
  previousAttack: Pick<RhythmSlot, 'unitPosition'>,
  current: Pick<RhythmSlot, 'unitPosition'>,
): number {
  return current.unitPosition - previousAttack.unitPosition
}

/** Written length of a slot at a tempo, in milliseconds. */
export function slotDurationMs(slot: Pick<RhythmSlot, 'durationUnits'>, meter: MeterSpec, bpm: number): number {
  return slot.durationUnits * unitMs(meter, bpm)
}
