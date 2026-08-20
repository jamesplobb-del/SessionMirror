import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import StaffGlyph, { useMusicGlyphMetrics } from '../staffJumper/StaffGlyph'
import { layoutMusicGlyph } from '../staffJumper/staffGlyphMetrics'
import {
  CLEF_ANCHOR_YPX,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_H,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  STAFF_BOTTOM_Y,
  STAFF_CLEF_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  getStaffPositionForNote,
  type StaffJumperClef,
  type StaffNoteLetter,
} from '../staffJumper/staffNotationMap'
import type { LessonClef, StaffPitch } from './instrumentData'

export interface NoteStaffProps {
  clef: LessonClef
  /** The written pitch to engrave. */
  note: StaffPitch
  /**
   * Every pitch this lesson can show. The vertical window is sized once from
   * the whole set so the staff holds still from note to note instead of
   * rescaling under the student each time a ledger line appears.
   */
  sizingNotes?: readonly StaffPitch[]
  label?: string
}

/** Breathing room between the clef and the note, in staff spaces. */
const CLEF_TO_NOTE = STAFF_SPACE_PX * 1.1
const ACCIDENTAL_GAP = STAFF_SPACE_PX * 0.38
/** Trailing space so the note is not jammed against the right-hand edge. */
const NOTE_TO_EDGE = STAFF_SPACE_PX * 3.4
/** Minimum air above and below the five lines. */
const MIN_STAFF_PAD = STAFF_SPACE_PX * 1.5

function accidentalGlyphName(accidental: StaffPitch['accidental']) {
  if (accidental === '#') return 'sharp' as const
  if (accidental === 'b') return 'flat' as const
  return null
}

function staffPosition(note: StaffPitch, clef: StaffJumperClef) {
  return getStaffPositionForNote(note.letter as StaffNoteLetter, note.octave, clef)
}

/**
 * One written note on a five-line staff.
 *
 * Every dimension — line gap, notehead, ledger rules, clef and accidental
 * glyphs — comes from the Staff Jumper notation module, so a note here is
 * engraved exactly like the same note in that game. It is drawn as a whole
 * note because a fingering chart names a pitch, not a rhythm.
 */
export default function NoteStaff({ clef, note, sizingNotes, label }: NoteStaffProps) {
  const glyphMetrics = useMusicGlyphMetrics()
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 320, height: 180 })

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const staffClef: StaffJumperClef = clef === 'bass' ? 'bass' : 'treble'
  const position = useMemo(() => staffPosition(note, staffClef), [note, staffClef])

  const view = useMemo(() => {
    const clefName = staffClef === 'bass' ? ('bassClef' as const) : ('trebleClef' as const)
    const clefWidth = layoutMusicGlyph(clefName, STAFF_SPACE_PX, glyphMetrics).width
    const accidentalName = accidentalGlyphName(note.accidental)
    const accidentalWidth = accidentalName
      ? layoutMusicGlyph(accidentalName, STAFF_SPACE_PX, glyphMetrics).width + ACCIDENTAL_GAP
      : 0

    const noteX =
      STAFF_CLEF_X + clefWidth + CLEF_TO_NOTE + accidentalWidth + NOTEHEAD_W / 2
    const worldWidth = noteX + NOTEHEAD_W / 2 + NOTE_TO_EDGE

    // The window covers every note the lesson can ask for, not just this one.
    const ys = (sizingNotes?.length ? sizingNotes : [note]).flatMap((pitch) => {
      const spot = staffPosition(pitch, staffClef)
      return [spot.yPx, ...spot.ledgerLineYPx]
    })
    const top = Math.min(STAFF_TOP_Y - MIN_STAFF_PAD, ...ys.map((y) => y - NOTEHEAD_H))
    const bottom = Math.max(STAFF_BOTTOM_Y + MIN_STAFF_PAD, ...ys.map((y) => y + NOTEHEAD_H))
    const worldHeight = bottom - top

    const scale = Math.min(box.width / worldWidth, box.height / worldHeight)
    // Staff lines run the full card even when height bound the scale — five
    // rules stopping short of the edge reads as a broken image.
    const lineWidth = Math.max(worldWidth, box.width / scale)
    // Whichever axis did not bind leaves slack; spend it on centring the clef
    // and note rather than letting them hug a corner of the card.
    const offsetX = Math.max(0, (lineWidth - worldWidth) / 2)
    const offsetY = Math.max(0, (box.height / scale - worldHeight) / 2)

    return {
      accidentalName,
      // Handed to the host as `aspect-ratio` so the card asks for exactly the
      // height this staff needs — no slack above and below the five lines.
      aspectRatio: worldWidth / worldHeight,
      clefName,
      lineWidth,
      noteX: noteX + offsetX,
      offsetX,
      scale,
      top: top - offsetY,
    }
  }, [box.height, box.width, glyphMetrics, note, sizingNotes, staffClef])

  return (
    <div
      className="li-staff"
      ref={hostRef}
      style={{ aspectRatio: `${view.aspectRatio}` }}
      role="img"
      aria-label={label ?? 'Written note'}
    >
      <div
        className="li-staff__world"
        style={{
          transform: `translateY(${-view.top * view.scale}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          width: `${view.lineWidth}px`,
        }}
        aria-hidden
      >
        {STAFF_LINE_Y_LIST.map((yPx) => (
          <div
            key={yPx}
            className="li-staff__line"
            style={{
              top: `${yPx}px`,
              width: `${view.lineWidth}px`,
              height: `${STAFF_LINE_THICKNESS}px`,
            }}
          />
        ))}

        <StaffGlyph
          name={view.clefName}
          spacePx={STAFF_SPACE_PX}
          staffY={CLEF_ANCHOR_YPX[staffClef]}
          x={STAFF_CLEF_X + view.offsetX}
          metrics={glyphMetrics}
          className="li-staff__clef"
        />

        {view.accidentalName && (
          <StaffGlyph
            name={view.accidentalName}
            spacePx={STAFF_SPACE_PX}
            staffY={position.yPx}
            x={view.noteX - NOTEHEAD_W / 2 - ACCIDENTAL_GAP}
            align="right"
            metrics={glyphMetrics}
            className="li-staff__accidental"
          />
        )}

        {position.ledgerLineYPx.map((ledgerY) => (
          <div
            key={ledgerY}
            className="li-staff__ledger"
            style={{
              left: `${view.noteX}px`,
              top: `${ledgerY}px`,
              width: `${LEDGER_LINE_W}px`,
              height: `${LEDGER_LINE_THICKNESS}px`,
            }}
          />
        ))}

        <div
          className="li-staff__notehead"
          style={{
            left: `${view.noteX}px`,
            top: `${position.yPx}px`,
            width: `${NOTEHEAD_W}px`,
            height: `${NOTEHEAD_H}px`,
            borderWidth: `${NOTEHEAD_RING_THICKNESS}px`,
          }}
        />
      </div>
    </div>
  )
}
