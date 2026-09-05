/**
 * Where the character walks, and when the next head lights.
 *
 * The staff is the point of this game. The character is scenery, so it never
 * enters the notation: it walks a lane below the lowest note the staff can
 * hold, and the score scrolls past it. What it marks is the reading position —
 * the column it stands in is the note sounding now — and pitch is left to the
 * page, where a reader already looks for it.
 */
import { NOTEHEAD_H, NOTEHEAD_W, STAFF_BOTTOM_Y, STAFF_SPACE_PX } from './staffNotationMap'

/**
 * World Y below which no ink is ever written.
 *
 * The lowest note this game writes is C4, one space under the staff, and it
 * carries a ledger rule. Everything the character owns starts under this line.
 */
export const DEEPEST_INK_Y = STAFF_BOTTOM_Y + STAFF_SPACE_PX + NOTEHEAD_H / 2

/** The character stands this many staff spaces tall — scenery scale. */
export const PLAYER_HEIGHT_SPACES = 1.55

/** World-px thickness of a walkway plank. */
export const PLANK_HEIGHT_PX = Math.round(STAFF_SPACE_PX * 0.2)

/** Air between the character's head and the lowest ink the staff can carry. */
const LANE_CLEARANCE_PX = STAFF_SPACE_PX * 0.35

/** The walkway keeps this much daylight above the dock. */
const LANE_TO_DOCK_GAP_PX = 12

/** A plank narrower than this is not worth drawing. */
const MIN_PLANK_W = 12

/**
 * Screen Y of the walkway — where the character's feet go.
 *
 * Measured on screen rather than in the score, because what the lane has to
 * clear is on screen: the deepest note the staff can hold above it, and the
 * target dock below. Sitting it a fixed distance under the staff in world
 * space looked right at one zoom and buried the character behind a low ledger
 * note at another.
 *
 * It hangs as close under the notation as the character's own height allows,
 * so the column it marks still reads as the note being played, and drops no
 * further than the dock.
 */
export function groundLaneScreenY(input: {
  baseY: number
  scale: number
  playerHeightPx: number
  dockTopPx: number
}): number {
  const clearOfInk =
    input.baseY +
    (DEEPEST_INK_Y + LANE_CLEARANCE_PX) * input.scale +
    input.playerHeightPx
  const aboveDock = input.dockTopPx - LANE_TO_DOCK_GAP_PX
  // A short screen leaves no room for both; the notation wins, and the
  // character — which paints behind it — gives up the overlap.
  return Math.min(clearOfInk, Math.max(aboveDock, input.baseY + STAFF_BOTTOM_Y * input.scale))
}

/**
 * How far ahead the next head lights, in pulses.
 *
 * A fraction of the written note would give a whole note most of a beat of
 * warning and a quarter almost none. A reader wants the same warning every
 * time, so the cue is measured in beats and only shortens when the note itself
 * is shorter than the cue.
 */
export const NEXT_LIGHT_LEAD_PULSES = 0.5

/** Never light the next head before the current one is half spent, or after this. */
const LEAD_MIN_PROGRESS = 0.5
const LEAD_MAX_PROGRESS = 0.9

/**
 * Free play has no click, so a note's travel is its dwell rather than its
 * written length. Half the dwell is the whole warning there is to give.
 */
export const FREE_PLAY_LIGHT_PROGRESS = 0.5

/** The character has left the head and is walking. */
export const WALKING_PROGRESS = 0.03

export function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** Travel fraction at which the next head takes the glow. */
export function nextLightProgress(durationUnits: number, pulseUnits: number): number {
  if (durationUnits <= 0) return LEAD_MIN_PROGRESS
  const lead = (NEXT_LIGHT_LEAD_PULSES * pulseUnits) / durationUnits
  return Math.min(LEAD_MAX_PROGRESS, Math.max(LEAD_MIN_PROGRESS, 1 - lead))
}

export interface ReadingCue {
  /** The head carrying the play glow, or null while silence is written. */
  litStep: number | null
  /** The glow has moved ahead: play the next note, not the one underfoot. */
  leading: boolean
  /** The current note is being walked through rather than waited on. */
  walking: boolean
}

/**
 * Which head to play, and which to hold.
 *
 * The head under the character keeps the glow until the read-ahead window,
 * then hands it forward — so "play what is lit" and "hold what you are
 * standing on" never mean the same head at the same time. Silence never takes
 * the glow: a rest ahead leaves the current note lit until it is actually due.
 */
export function readingCue(
  sequenceStep: number,
  currentIsRest: boolean,
  nextIsRest: boolean,
  progress: number,
  lightProgress: number,
): ReadingCue {
  const walking = progress > WALKING_PROGRESS
  if (!nextIsRest && progress >= lightProgress) {
    return { litStep: sequenceStep + 1, leading: true, walking }
  }
  return { litStep: currentIsRest ? null : sequenceStep, leading: false, walking }
}

/** World X of the character at this point in the walk. */
export function travelX(fromX: number, toX: number, progress: number): number {
  return fromX + (toX - fromX) * clamp01(progress)
}

export interface WalkwayPlank {
  key: string
  x: number
  width: number
}

/**
 * The ground between one head and the next.
 *
 * Its length is the distance walked, not a duration bar: engraved spacing is
 * deliberately not proportional to length, so a whole note's plank is longer
 * than a quarter's but nowhere near four times longer. Reading duration is the
 * notehead's job; this is only somewhere to put your feet.
 */
export function walkwayPlank(step: number, fromX: number, toX: number): WalkwayPlank | null {
  // Just enough of a joint between planks to read the note boundaries; any
  // more and the walkway looks like dashes rather than ground.
  const inset = NOTEHEAD_W * 0.14
  const x = fromX + inset
  const width = toX - inset - x
  if (width < MIN_PLANK_W) return null
  return { key: `plank-${step}`, x, width }
}
