/**
 * Geometry for the rhythmic half of the notation — stems, beams, flags and
 * barlines — computed in world pixels from the visible notes.
 *
 * Kept out of the component because beaming is the one part of engraving where
 * a note's appearance depends on its neighbours: stems in a beamed group are
 * all cut to meet one sloping line, so they cannot be drawn note by note.
 */
import type { PlatformSlot } from './staffJumperMusicLogic'
import { beamCountForValue, hasStem, isBeamable } from './staffJumperRhythm'
import {
  STAFF_SPACE_PX,
  BEAM_MAX_SLANT,
  BEAM_SPACING,
  NOTE_SPACING_PX,
  STAFF_FIRST_NOTE_X,
  stemDirectionForY,
  stemTipY,
  stemXForNote,
  type StemDirection,
} from './staffNotationMap'

export interface StemRender {
  key: string
  x: number
  yStart: number
  yEnd: number
  opacity: number
}

export interface BeamRender {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  opacity: number
}

export interface FlagRender {
  key: string
  x: number
  y: number
  direction: StemDirection
  count: number
  opacity: number
}

export interface RhythmLayout {
  stems: StemRender[]
  beams: BeamRender[]
  flags: FlagRender[]
  barlineXs: number[]
}

/**
 * X of the barline that closes a completed measure.
 *
 * The rhythm model emits the boundary's spacing coordinate only after the
 * preceding measure reaches exact capacity. The renderer merely converts that
 * model coordinate to pixels and preserves any display-only score offset.
 */
export function barlineXForSlot(slot: PlatformSlot): number | null {
  const boundary = slot.note.rhythm.barlineBeforeSpacingPosition
  if (boundary == null) return null
  const displayOffset = slot.xPx - slot.note.xPx
  return STAFF_FIRST_NOTE_X + boundary * NOTE_SPACING_PX + displayOffset
}

export function layoutRhythm(slots: PlatformSlot[]): RhythmLayout {
  const stems: StemRender[] = []
  const beams: BeamRender[] = []
  const flags: FlagRender[] = []
  const barlineXs: number[] = []

  for (const slot of slots) {
    const barlineX = barlineXForSlot(slot)
    if (barlineX != null) barlineXs.push(barlineX)
  }

  let index = 0
  while (index < slots.length) {
    const slot = slots[index]!
    const { rhythm } = slot.note

    // A rest is a single glyph — no stem, no flag, and no place in a beam.
    if (rhythm.isRest || !hasStem(rhythm.value)) {
      index += 1
      continue
    }

    // Gather the run of notes sharing this beam group.
    const groupId = rhythm.beamGroupId
    let end = index
    if (groupId != null) {
      while (end + 1 < slots.length && slots[end + 1]!.note.rhythm.beamGroupId === groupId) {
        end += 1
      }
    }

    const group = slots.slice(index, end + 1)

    // One direction for the whole group, decided by where its notes sit.
    const averageY = group.reduce((sum, item) => sum + item.note.yPx, 0) / group.length
    const direction = stemDirectionForY(averageY)
    const opacity = Math.min(...group.map((item) => item.opacity))

    if (group.length === 1) {
      const only = group[0]!
      const x = stemXForNote(only.xPx, direction)
      stems.push({
        key: `stem-${only.step}`,
        x,
        yStart: only.note.yPx,
        yEnd: stemTipY(only.note.yPx, direction),
        opacity: only.opacity,
      })
      if (isBeamable(rhythm.value)) {
        flags.push({
          key: `flag-${only.step}`,
          x,
          y: stemTipY(only.note.yPx, direction),
          direction,
          count: beamCountForValue(rhythm.value),
          opacity: only.opacity,
        })
      }
      index = end + 1
      continue
    }

    // Beam line: slope taken from the outer notes, then clamped so a wide leap
    // does not produce a beam standing on end.
    const points = group.map((item) => ({
      x: stemXForNote(item.xPx, direction),
      tip: stemTipY(item.note.yPx, direction),
    }))
    const first = points[0]!
    const last = points[points.length - 1]!
    const span = last.x - first.x || 1
    let slant = last.tip - first.tip
    slant = Math.max(-BEAM_MAX_SLANT, Math.min(BEAM_MAX_SLANT, slant))

    const rawBeamY = (x: number) => first.tip + ((x - first.x) / span) * slant

    // Slide the line until it just clears every stem: above them all for
    // up-stems, below them all for down-stems.
    const slacks = points.map((point) => point.tip - rawBeamY(point.x))
    const shift = direction === 'up' ? Math.min(...slacks) : Math.max(...slacks)
    const beamY = (x: number) => rawBeamY(x) + shift

    for (const [groupIndex, point] of points.entries()) {
      stems.push({
        key: `stem-${group[groupIndex]!.step}`,
        x: point.x,
        yStart: group[groupIndex]!.note.yPx,
        yEnd: beamY(point.x),
        opacity: group[groupIndex]!.opacity,
      })
    }

    // Secondary beams sit between the primary beam and the noteheads.
    const beamCount = Math.max(...group.map((item) => beamCountForValue(item.note.rhythm.value)))
    for (let level = 0; level < beamCount; level += 1) {
      const offset = (direction === 'up' ? 1 : -1) * level * BEAM_SPACING
      // Secondary beams only join notes which actually have that beam level.
      // An isolated sixteenth gets a short hook, never a full beam over eighths.
      let start = 0
      while (start < group.length) {
        if (beamCountForValue(group[start]!.note.rhythm.value) <= level) { start += 1; continue }
        let finish = start
        while (finish + 1 < group.length && beamCountForValue(group[finish + 1]!.note.rhythm.value) > level) finish += 1
        const x1 = points[start]!.x
        const x2 = finish > start ? points[finish]!.x : x1 + (start === group.length - 1 ? -1 : 1) * Math.min(14, Math.abs(points[start === group.length - 1 ? start - 1 : start + 1]!.x - x1) * 0.3)
        beams.push({ key: `beam-${group[start]!.step}-${level}`, x1, y1: beamY(x1) + offset, x2, y2: beamY(x2) + offset, opacity })
        start = finish + 1
      }
    }

    index = end + 1
  }

  return { stems, beams, flags, barlineXs }
}

export function flagPath(x: number, y: number, direction: StemDirection): string {
  const sign = direction === 'up' ? 1 : -1
  const width = STAFF_SPACE_PX * 1.15
  const drop = STAFF_SPACE_PX * 2.1 * sign
  const belly = STAFF_SPACE_PX * 0.75 * sign
  return [
    `M ${x} ${y}`,
    `C ${x + width * 0.95} ${y + belly * 0.55} ${x + width} ${y + drop * 0.5} ${x + width * 0.42} ${y + drop}`,
    `C ${x + width * 1.05} ${y + drop * 0.52} ${x + width * 0.55} ${y + belly * 0.7} ${x} ${y + belly * 1.5}`,
    'Z',
  ].join(' ')
}
