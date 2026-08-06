import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  getKeySignatureMarkers,
  getTargetNoteAtStep,
  type PlatformSlot,
  type StaffJumperConfig,
} from './staffJumperMusicLogic'
import {
  BARLINE_THICKNESS,
  BEAM_THICKNESS,
  CLEF_ANCHOR_YPX,
  CLEF_TO_SIGNATURE_GAP,
  DOT_GAP,
  DOT_RADIUS,
  dotYForNote,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_H,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  SIGNATURE_TO_NOTE_GAP,
  STAFF_BOTTOM_Y,
  STAFF_CLEF_X,
  STAFF_FIRST_NOTE_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  STEM_LENGTH,
  STEM_THICKNESS,
  TIME_SIGNATURE_FONT_SIZE,
  TIME_SIGNATURE_WIDTH,
  TIME_SIGNATURE_YPX,
} from './staffNotationMap'
import StaffGlyph, { useMusicGlyphMetrics } from './StaffGlyph'
import { keySignatureStepPx, layoutMusicGlyph } from './staffGlyphMetrics'
import { layoutRhythm } from './staffJumperNotationLayout'
import { isHollowNotehead, METERS } from './staffJumperRhythm'

interface StaffPreviewProps {
  config: StaffJumperConfig
  /** Bars to show before the preview runs out of room. */
  bars?: number
  maxNotes?: number
}

/**
 * A still frame of the exercise the current settings produce.
 *
 * Deliberately built from the same primitives the game renders with —
 * `getTargetNoteAtStep`, `layoutRhythm`, `StaffGlyph` and the shared notation
 * constants — so the notes on the setup screen are literally the notes the run
 * will put on the staff, in the same hand. No separate music logic to drift.
 */
export default function StaffPreview({ config, bars = 2, maxNotes = 12 }: StaffPreviewProps) {
  const glyphMetrics = useMusicGlyphMetrics()
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 320, height: 150 })

  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const keySignature = useMemo(
    () => getKeySignatureMarkers(config.key, config.scaleMode, config.clef),
    [config.clef, config.key, config.scaleMode],
  )

  const head = useMemo(() => {
    const clefName = config.clef === 'treble' ? ('trebleClef' as const) : ('bassClef' as const)
    const clefWidth = layoutMusicGlyph(clefName, STAFF_SPACE_PX, glyphMetrics).width
    let width = STAFF_CLEF_X + clefWidth

    const signatureX = width + CLEF_TO_SIGNATURE_GAP
    if (keySignature.length > 0) {
      const symbol = keySignature[0]!.symbol
      const glyph = layoutMusicGlyph(symbol === '#' ? 'sharp' : 'flat', STAFF_SPACE_PX, glyphMetrics)
      width =
        signatureX +
        (keySignature.length - 1) * keySignatureStepPx(symbol, STAFF_SPACE_PX) +
        glyph.width
    }

    const timeSignatureX = width + CLEF_TO_SIGNATURE_GAP
    return {
      clefName,
      signatureX,
      timeSignatureX,
      width: timeSignatureX + TIME_SIGNATURE_WIDTH + SIGNATURE_TO_NOTE_GAP,
    }
  }, [config.clef, glyphMetrics, keySignature])

  const slots = useMemo<PlatformSlot[]>(() => {
    const collected: PlatformSlot[] = []
    for (let step = 0; step < maxNotes; step += 1) {
      const note = getTargetNoteAtStep(config, step)
      if (note.rhythm.barIndex >= bars) break
      collected.push({ step, note, role: 'future', opacity: 1, xPx: note.xPx })
    }
    return collected
  }, [bars, config, maxNotes])

  const rhythm = useMemo(() => layoutRhythm(slots), [slots])
  const meterSpec = METERS[config.meter]

  /**
   * Fit the whole frame — head, notes, and anything the stems and ledger lines
   * poke out to — into whatever box the layout gives us.
   */
  const view = useMemo(() => {
    const lastNote = slots.at(-1)
    // Notes are generated from a fixed origin; slide them up behind the head.
    const noteOffsetX = head.width - STAFF_FIRST_NOTE_X
    const worldWidth = (lastNote ? lastNote.xPx + noteOffsetX : head.width) + NOTEHEAD_W

    const ys = slots.flatMap((slot) => [slot.note.yPx, ...slot.note.ledgerLineYPx])
    const top = Math.min(STAFF_TOP_Y, ...ys) - STEM_LENGTH - STAFF_SPACE_PX * 0.5
    const bottom = Math.max(STAFF_BOTTOM_Y, ...ys) + STEM_LENGTH + STAFF_SPACE_PX * 0.5
    const worldHeight = bottom - top

    const scale = Math.min(box.width / worldWidth, box.height / worldHeight)
    // Staff lines run the whole card even when the height constraint bound the
    // scale — five rules stopping short of the edge reads as a broken image.
    const lineWidth = Math.max(worldWidth, box.width / scale)
    return { noteOffsetX, worldWidth, top, worldHeight, scale, lineWidth }
  }, [box.height, box.width, head.width, slots])

  return (
    <div className="sj-preview" ref={hostRef}>
      <div
        className="sj-preview__world"
        style={{
          transform: `translateY(${-view.top * view.scale}px) scale(${view.scale})`,
          transformOrigin: '0 0',
          width: `${view.lineWidth}px`,
        }}
        aria-hidden
      >
        <div className="sj-staff-lines">
          {STAFF_LINE_Y_LIST.map((yPx) => (
            <div
              key={yPx}
              className="sj-staff-line"
              style={{
                top: `${yPx}px`,
                width: `${view.lineWidth}px`,
                height: `${STAFF_LINE_THICKNESS}px`,
              }}
            />
          ))}
        </div>

        <StaffGlyph
          name={head.clefName}
          spacePx={STAFF_SPACE_PX}
          staffY={CLEF_ANCHOR_YPX[config.clef]}
          x={STAFF_CLEF_X}
          metrics={glyphMetrics}
          className="sj-clef"
        />

        {keySignature.map((marker, index) => (
          <StaffGlyph
            key={`${marker.symbol}-${marker.yPx}-${index}`}
            name={marker.symbol === '#' ? 'sharp' : 'flat'}
            spacePx={STAFF_SPACE_PX}
            staffY={marker.yPx}
            x={head.signatureX + index * keySignatureStepPx(marker.symbol, STAFF_SPACE_PX)}
            metrics={glyphMetrics}
            className="sj-key-signature__symbol"
          />
        ))}

        <svg
          className="sj-time-signature"
          style={{ left: `${head.timeSignatureX}px`, top: 0 }}
          width={TIME_SIGNATURE_WIDTH}
          height={STAFF_BOTTOM_Y + STAFF_SPACE_PX * 4}
          viewBox={`0 0 ${TIME_SIGNATURE_WIDTH} ${STAFF_BOTTOM_Y + STAFF_SPACE_PX * 4}`}
        >
          <text
            x={TIME_SIGNATURE_WIDTH / 2}
            y={TIME_SIGNATURE_YPX[config.clef].top}
            fontSize={TIME_SIGNATURE_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {meterSpec.numerator}
          </text>
          <text
            x={TIME_SIGNATURE_WIDTH / 2}
            y={TIME_SIGNATURE_YPX[config.clef].bottom}
            fontSize={TIME_SIGNATURE_FONT_SIZE}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {meterSpec.denominator}
          </text>
        </svg>

        <div
          className="sj-preview__notes"
          style={{ transform: `translateX(${view.noteOffsetX}px)` }}
        >
          <svg
            className="sj-rhythm-layer"
            width={view.worldWidth}
            height={STAFF_BOTTOM_Y + STAFF_SPACE_PX * 6}
            viewBox={`0 0 ${view.worldWidth} ${STAFF_BOTTOM_Y + STAFF_SPACE_PX * 6}`}
            focusable="false"
          >
            {rhythm.barlineXs.map((x) => (
              <rect
                key={`bar-${x}`}
                className="sj-barline"
                x={x - BARLINE_THICKNESS / 2}
                y={STAFF_TOP_Y}
                width={BARLINE_THICKNESS}
                height={STAFF_BOTTOM_Y - STAFF_TOP_Y}
              />
            ))}
            {rhythm.stems.map((stem) => (
              <rect
                key={stem.key}
                className="sj-stem"
                x={stem.x - STEM_THICKNESS / 2}
                y={Math.min(stem.yStart, stem.yEnd)}
                width={STEM_THICKNESS}
                height={Math.abs(stem.yEnd - stem.yStart)}
              />
            ))}
            {rhythm.beams.map((beam) => (
              <line
                key={beam.key}
                className="sj-beam"
                x1={beam.x1}
                y1={beam.y1}
                x2={beam.x2}
                y2={beam.y2}
                strokeWidth={BEAM_THICKNESS}
              />
            ))}
          </svg>

          {slots.map((slot) => (
            <div
              key={slot.step}
              className={`sj-note sj-note--${slot.note.kind}`}
              style={{ left: `${slot.xPx}px`, top: `${slot.note.yPx}px` }}
            >
              {slot.note.ledgerLineYPx.map((ledgerY) => (
                <span
                  key={ledgerY}
                  className="sj-note__ledger"
                  style={{
                    top: `${ledgerY - slot.note.yPx}px`,
                    width: `${LEDGER_LINE_W}px`,
                    height: `${LEDGER_LINE_THICKNESS}px`,
                  }}
                />
              ))}
              <span
                className={`sj-note__head ${
                  isHollowNotehead(slot.note.rhythm.value) ? 'sj-note__head--hollow' : ''
                }`}
                style={{
                  width: `${NOTEHEAD_W}px`,
                  height: `${NOTEHEAD_H}px`,
                  borderWidth: `${NOTEHEAD_RING_THICKNESS}px`,
                }}
              />
              {slot.note.rhythm.dotted && (
                <span
                  className="sj-note__dot"
                  style={{
                    left: `${NOTEHEAD_W / 2 + DOT_GAP}px`,
                    top: `${dotYForNote(slot.note.yPx, slot.note.kind) - slot.note.yPx}px`,
                    width: `${DOT_RADIUS * 2}px`,
                    height: `${DOT_RADIUS * 2}px`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
