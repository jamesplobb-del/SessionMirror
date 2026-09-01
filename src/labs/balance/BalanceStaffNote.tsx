import { useMemo } from 'react'
import StaffGlyph, { useMusicGlyphMetrics } from '../staffJumper/StaffGlyph'
import { layoutMusicGlyph, type MusicGlyphName } from '../staffJumper/staffGlyphMetrics'
import {
  CLEF_ANCHOR_YPX,
  getStaffPositionForNote,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_H,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  STAFF_BOTTOM_Y,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  type StaffJumperClef,
} from '../staffJumper/staffNotationMap'
import { balanceNoteSpelling } from './balanceMusic'
import '../staffJumper/staff-jumper.css'

interface BalanceStaffNoteProps {
  /** Written pitch — what the player reads, not what sounds. */
  writtenMidi: number
  clef: StaffJumperClef
  /** Rendered height in CSS px; the world scales to fit it. */
  height?: number
  /**
   * `content` fits everything including ledger lines, so nothing is clipped.
   * `staff` scales from the five lines alone and lets low notes hang outside,
   * which keeps the staff the same size in every row of a list — otherwise a
   * tuba's ledger lines shrink its stave next to a trumpet's.
   */
  fit?: 'content' | 'staff'
  className?: string
}

/**
 * The target note on a staff, under its name.
 *
 * Built from Staff Jumper's notation modules rather than a second renderer:
 * the same `getStaffPositionForNote`, the same world constants, the same
 * `StaffGlyph` and the same `.sj-*` ink. A note printed here therefore sits on
 * exactly the line Staff Jumper would print it on, in the same hand — which is
 * the point, since a student meets both games in the same app.
 *
 * Drawn as a whole note: a long tone is a held pitch with no rhythm to read,
 * and a hollow head with no stem is how that is written.
 */
export default function BalanceStaffNote({
  writtenMidi,
  clef,
  height = 68,
  fit = 'content',
  className = '',
}: BalanceStaffNoteProps) {
  const metrics = useMusicGlyphMetrics()

  const layout = useMemo(() => {
    const spelling = balanceNoteSpelling(writtenMidi)
    const note = getStaffPositionForNote(spelling.letter, spelling.octave, clef)

    const clefGlyph: MusicGlyphName =
      clef === 'bass' ? 'bassClef' : clef === 'alto' ? 'altoClef' : 'trebleClef'
    const clefLayout = layoutMusicGlyph(clefGlyph, STAFF_SPACE_PX, metrics)
    const accidentalLayout = spelling.accidental
      ? layoutMusicGlyph(spelling.accidental, STAFF_SPACE_PX, metrics)
      : null

    const padX = STAFF_SPACE_PX * 0.5
    const clefX = padX
    const accidentalX = clefX + clefLayout.width + STAFF_SPACE_PX * 0.55
    const noteX =
      accidentalX +
      (accidentalLayout ? accidentalLayout.width + STAFF_SPACE_PX * 0.34 : 0) +
      NOTEHEAD_W / 2
    const worldWidth = noteX + NOTEHEAD_W / 2 + padX

    // Ledger lines and the notehead can sit well outside the five lines. Fitting
    // to content keeps every note inside the box; fitting to the staff keeps the
    // staff itself a constant size and gives ledger notes a fixed allowance to
    // hang into, which is what a list of instruments needs.
    const ys = [STAFF_TOP_Y, STAFF_BOTTOM_Y, note.yPx, ...note.ledgerLineYPx]
    const margin = fit === 'staff' ? STAFF_SPACE_PX * 3 : STAFF_SPACE_PX * 0.9
    const top = fit === 'staff' ? STAFF_TOP_Y - margin : Math.min(...ys) - margin
    const worldHeight =
      fit === 'staff'
        ? STAFF_BOTTOM_Y + margin - top
        : Math.max(...ys) + margin - top

    return {
      note,
      clefGlyph,
      accidental: spelling.accidental,
      clefX,
      accidentalX,
      noteX,
      worldWidth,
      worldHeight,
      top,
      scale: height / worldHeight,
    }
  }, [clef, fit, height, metrics, writtenMidi])

  return (
    <div
      className={`balance-staff-note ${className}`}
      style={{ width: layout.worldWidth * layout.scale, height }}
      aria-hidden
    >
      <div
        className="balance-staff-note__world"
        style={{
          width: layout.worldWidth,
          height: layout.worldHeight,
          transform: `scale(${layout.scale}) translateY(${-layout.top}px)`,
        }}
      >
        {STAFF_LINE_Y_LIST.map((lineY) => (
          <span
            key={lineY}
            className="sj-staff-line"
            style={{ top: lineY, width: layout.worldWidth, height: STAFF_LINE_THICKNESS }}
          />
        ))}

        <StaffGlyph
          name={layout.clefGlyph}
          spacePx={STAFF_SPACE_PX}
          staffY={CLEF_ANCHOR_YPX[clef]}
          x={layout.clefX}
          metrics={metrics}
        />

        {layout.accidental ? (
          <StaffGlyph
            name={layout.accidental}
            spacePx={STAFF_SPACE_PX}
            staffY={layout.note.yPx}
            x={layout.accidentalX}
            metrics={metrics}
          />
        ) : null}

        {layout.note.ledgerLineYPx.map((ledgerY) => (
          <span
            key={ledgerY}
            className="sj-note__ledger"
            style={{
              top: ledgerY,
              left: layout.noteX,
              width: LEDGER_LINE_W,
              height: LEDGER_LINE_THICKNESS,
            }}
          />
        ))}

        <span
          className="sj-note__head sj-note__head--hollow"
          style={{
            top: layout.note.yPx,
            left: layout.noteX,
            width: NOTEHEAD_W,
            height: NOTEHEAD_H,
            borderWidth: NOTEHEAD_RING_THICKNESS,
          }}
        />
      </div>
    </div>
  )
}
