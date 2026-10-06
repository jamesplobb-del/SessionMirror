import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import StaffGlyph, { useMusicGlyphMetrics } from '../../../src/labs/staffJumper/StaffGlyph'
import StaffRest from '../../../src/labs/staffJumper/StaffRest'
import {
  getKeySignatureMarkers,
  getTargetNoteAtStep,
  midiPoolForConfig,
  spellWrittenMidi,
  type PlatformSlot,
  type StaffJumperConfig,
} from '../../../src/labs/staffJumper/staffJumperMusicLogic'
import { keySignatureStepPx, layoutMusicGlyph, type MusicGlyphName } from '../../../src/labs/staffJumper/staffGlyphMetrics'
import { flagPath, layoutRhythm } from '../../../src/labs/staffJumper/staffJumperNotationLayout'
import { isHollowNotehead, METERS } from '../../../src/labs/staffJumper/staffJumperRhythm'
import {
  augmentationDotXPx,
  BARLINE_THICKNESS,
  BEAM_THICKNESS,
  CLEF_ANCHOR_YPX,
  CLEF_TO_SIGNATURE_GAP,
  DOT_RADIUS,
  dotYForNote,
  getStaffPositionForNote,
  LEDGER_LINE_THICKNESS,
  LEDGER_LINE_W,
  NOTEHEAD_H,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  SIGNATURE_TO_NOTE_GAP,
  STAFF_BOTTOM_Y,
  STAFF_CLEF_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  STEM_LENGTH,
  STEM_THICKNESS,
  stemDirectionForY,
  TIME_SIGNATURE_FONT_SIZE,
  TIME_SIGNATURE_WIDTH,
  TIME_SIGNATURE_YPX,
} from '../../../src/labs/staffJumper/staffNotationMap'

interface CloudScoreProps {
  config: StaffJumperConfig
  step: number
}

const INK = '#263c43'
const ACTIVE_INK = '#218f89'

/**
 * The real score engraving in a shorter reading window. Only horizontal spacing
 * is adapted: pitches, note values, glyphs, stems and beams use the game modules.
 */
export default function CloudScore({ config, step }: CloudScoreProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 362, height: 300 })
  const metrics = useMusicGlyphMetrics()

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => setBox({ width: host.clientWidth, height: host.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  const sourceSlots = useMemo<PlatformSlot[]>(() => Array.from({ length: 4 }, (_, index) => {
    const noteStep = step + index
    const note = getTargetNoteAtStep(config, noteStep)
    return { step: noteStep, note, role: index === 0 ? 'target' : 'future', opacity: 1, xPx: note.xPx }
  }), [config, step])

  const keySignature = useMemo(() => config.customPitchClasses?.length
    ? []
    : getKeySignatureMarkers(config.key, config.scaleMode, config.clef), [config])

  const head = useMemo(() => {
    const clefName: MusicGlyphName = config.clef === 'bass' ? 'bassClef' : config.clef === 'alto' ? 'altoClef' : 'trebleClef'
    const clef = layoutMusicGlyph(clefName, STAFF_SPACE_PX, metrics)
    const signatureX = STAFF_CLEF_X + clef.width + CLEF_TO_SIGNATURE_GAP
    let right = STAFF_CLEF_X + clef.width
    if (keySignature.length) {
      const symbol = keySignature[0]!.symbol
      right = signatureX + (keySignature.length - 1) * keySignatureStepPx(symbol, STAFF_SPACE_PX)
        + layoutMusicGlyph(symbol === '#' ? 'sharp' : 'flat', STAFF_SPACE_PX, metrics).width
    }
    const meterX = right + CLEF_TO_SIGNATURE_GAP
    return { clefName, clef, signatureX, meterX, firstNoteX: meterX + TIME_SIGNATURE_WIDTH + SIGNATURE_TO_NOTE_GAP }
  }, [config.clef, keySignature, metrics])

  const layout = useMemo(() => {
    // Size against the whole exercise range so changing the target does not
    // shrink the staff when a ledger line appears.
    const rangePositions = midiPoolForConfig(config).map(midi => {
      const written = spellWrittenMidi(midi, config.key)
      return getStaffPositionForNote(written.letter, written.octave, config.clef)
    })
    const clefTop = CLEF_ANCHOR_YPX[config.clef] - head.clef.anchorOffsetY
    const clefBottom = clefTop + head.clef.height
    const signatureYs = keySignature.flatMap(marker => {
      const glyph = layoutMusicGlyph(marker.symbol === '#' ? 'sharp' : 'flat', STAFF_SPACE_PX, metrics)
      const glyphTop = marker.yPx - glyph.anchorOffsetY
      return [glyphTop, glyphTop + glyph.height]
    })
    const sourceRhythm = layoutRhythm(sourceSlots)
    const stemYs = sourceRhythm.stems.flatMap(stem => [stem.yStart, stem.yEnd])
    const rangeTops = rangePositions.map(note => stemDirectionForY(note.yPx) === 'up' ? note.yPx - STEM_LENGTH : note.yPx - NOTEHEAD_H)
    const rangeBottoms = rangePositions.map(note => Math.max(
      note.yPx + NOTEHEAD_H,
      config.difficulty === 'easy' ? note.yPx + 72 : note.yPx,
      stemDirectionForY(note.yPx) === 'down' ? note.yPx + STEM_LENGTH : note.yPx,
    ))
    const restYs = sourceSlots.filter(slot => slot.note.isRest).flatMap(slot => [slot.note.yPx - STAFF_SPACE_PX * 1.7, slot.note.yPx + STAFF_SPACE_PX * 1.7])
    const top = Math.min(STAFF_TOP_Y - STAFF_SPACE_PX * .35, clefTop, ...rangeTops, ...stemYs, ...restYs, ...signatureYs) - 10
    const bottom = Math.max(STAFF_BOTTOM_Y + STAFF_SPACE_PX * .35, clefBottom, ...rangeBottoms, ...stemYs, ...restYs, ...signatureYs) + 10
    const worldHeight = bottom - top
    const desiredScale = Math.min(1.4, Math.max(.66, box.width / 510))
    const scale = Math.max(.1, Math.min(desiredScale, Math.max(1, box.height - 12) / worldHeight))
    const worldWidth = Math.max(1, box.width) / scale
    const firstSourceX = sourceSlots[0]!.xPx
    const lastSourceX = sourceSlots.at(-1)!.xPx
    const sourceSpan = Math.max(1, lastSourceX - firstSourceX)
    const availableSpan = Math.max(1, worldWidth - head.firstNoteX - NOTEHEAD_W * .65)
    // Apply one factor to the genuine rhythm spacing, preserving long/short
    // note relationships. Keep glyphs intact; a narrow view can crop the tail.
    const spacingRatio = Math.min(1, Math.max(.8, availableSpan / sourceSpan))
    const mapX = (x: number) => head.firstNoteX + (x - firstSourceX) * spacingRatio
    const slots = sourceSlots.map(slot => ({ ...slot, xPx: mapX(slot.xPx) }))
    const rhythm = layoutRhythm(slots)
    const barlineXs = sourceRhythm.barlineXs.filter(x => x > firstSourceX).map(mapX)
    const canvasHeight = Math.max(bottom + STAFF_SPACE_PX * 2, STAFF_BOTTOM_Y + STAFF_SPACE_PX * 4)
    return { slots, rhythm, barlineXs, worldWidth, canvasHeight, scale, offsetY: (box.height - worldHeight * scale) / 2 - top * scale }
  }, [box, config, head, keySignature, metrics, sourceSlots])

  const meter = METERS[config.meter]
  const activeStemKey = `stem-${step}`
  const activeFlagKey = `flag-${step}`

  return (
    <div ref={hostRef} className="cloud-score" role="img"
      aria-label={`Read ${sourceSlots.map(slot => slot.note.isRest ? 'rest' : slot.note.noteLabel).join(', ')} on the ${config.clef} staff`}
      data-scale={layout.scale.toFixed(3)}
      style={{ position: 'relative', flex: '1 1 auto', width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', color: INK }}>
      <style>{`.cloud-score .sj-rest { color: inherit; }`}</style>
      <div className="cloud-score__world" aria-hidden style={{
        position: 'absolute', top: 0, left: 0, width: layout.worldWidth,
        height: layout.canvasHeight, transformOrigin: '0 0',
        transform: `translateY(${layout.offsetY}px) scale(${layout.scale})`,
      }}>
        {STAFF_LINE_Y_LIST.map(y => <span key={y} className="sj-staff-line cloud-score__line"
          style={{ position: 'absolute', left: 0, top: y, width: layout.worldWidth, height: STAFF_LINE_THICKNESS, background: '#516469' }} />)}

        <StaffGlyph name={head.clefName} spacePx={STAFF_SPACE_PX} staffY={CLEF_ANCHOR_YPX[config.clef]}
          x={STAFF_CLEF_X} metrics={metrics} className="cloud-score__clef" />
        {keySignature.map((marker, index) => <StaffGlyph key={`${marker.symbol}-${index}`}
          name={marker.symbol === '#' ? 'sharp' : 'flat'} spacePx={STAFF_SPACE_PX} staffY={marker.yPx}
          x={head.signatureX + index * keySignatureStepPx(marker.symbol, STAFF_SPACE_PX)} metrics={metrics}
          className="cloud-score__key-signature" />)}
        <svg className="sj-time-signature cloud-score__meter" width={TIME_SIGNATURE_WIDTH} height={layout.canvasHeight}
          viewBox={`0 0 ${TIME_SIGNATURE_WIDTH} ${layout.canvasHeight}`} style={{ left: head.meterX, top: 0 }}>
          <text x={TIME_SIGNATURE_WIDTH / 2} y={TIME_SIGNATURE_YPX[config.clef].top} fontSize={TIME_SIGNATURE_FONT_SIZE} textAnchor="middle" dominantBaseline="central">{meter.numerator}</text>
          <text x={TIME_SIGNATURE_WIDTH / 2} y={TIME_SIGNATURE_YPX[config.clef].bottom} fontSize={TIME_SIGNATURE_FONT_SIZE} textAnchor="middle" dominantBaseline="central">{meter.denominator}</text>
        </svg>

        <svg className="sj-rhythm-layer cloud-score__rhythm" width={layout.worldWidth} height={layout.canvasHeight}
          viewBox={`0 0 ${layout.worldWidth} ${layout.canvasHeight}`} focusable="false">
          {layout.barlineXs.map((x, index) => <rect key={`bar-${index}`} className="sj-barline"
            x={x - BARLINE_THICKNESS / 2} y={STAFF_TOP_Y} width={BARLINE_THICKNESS}
            height={STAFF_BOTTOM_Y - STAFF_TOP_Y} style={{ fill: INK }} />)}
          {layout.rhythm.stems.map(stem => <rect key={stem.key} className="sj-stem"
            x={stem.x - STEM_THICKNESS / 2} y={Math.min(stem.yStart, stem.yEnd)} width={STEM_THICKNESS}
            height={Math.abs(stem.yEnd - stem.yStart)} style={{ fill: stem.key === activeStemKey ? ACTIVE_INK : INK }} />)}
          {layout.rhythm.flags.flatMap(flag => Array.from({ length: flag.count }, (_, level) => <path key={`${flag.key}-${level}`} className="sj-flag"
            d={flagPath(flag.x, flag.y + (flag.direction === 'up' ? 1 : -1) * level * STAFF_SPACE_PX * .75, flag.direction)}
            style={{ fill: flag.key === activeFlagKey ? ACTIVE_INK : INK }} />))}
          {layout.rhythm.beams.map(beam => <line key={beam.key} className="sj-beam"
            x1={beam.x1} y1={beam.y1} x2={beam.x2} y2={beam.y2} strokeWidth={BEAM_THICKNESS}
            style={{ stroke: INK }} />)}
        </svg>

        {layout.slots.map((slot, index) => {
          const active = index === 0
          const ink = active ? ACTIVE_INK : index === 3 ? '#617174' : INK
          const hollow = isHollowNotehead(slot.note.rhythm.value)
          return <div key={slot.step} className={`sj-note cloud-score__note ${active ? 'cloud-score__note--active' : ''} ${slot.note.isRest ? 'sj-note--rest' : ''}`}
            data-step={slot.step} style={{ left: slot.xPx, top: slot.note.yPx, color: ink }}>
            {!slot.note.isRest && slot.note.customAccidental && <span className="sj-custom-accidental" style={{ color: ink }}>{slot.note.customAccidental}</span>}
            {slot.note.isRest ? <span style={{ color: ink }}><StaffRest value={slot.note.rhythm.value} /></span> : <>
              {slot.note.ledgerLineYPx.map(y => <span key={y} className="sj-note__ledger"
                style={{ top: y - slot.note.yPx, width: LEDGER_LINE_W, height: LEDGER_LINE_THICKNESS, background: ink }} />)}
              <span className={`sj-note__head ${hollow ? 'sj-note__head--hollow' : ''}`} style={{
                width: NOTEHEAD_W, height: NOTEHEAD_H, borderWidth: hollow ? NOTEHEAD_RING_THICKNESS : 0,
                borderColor: ink, background: hollow ? 'transparent' : ink,
                boxShadow: active ? `0 0 0 7px ${ACTIVE_INK}15` : 'none',
              }} />
              {slot.note.rhythm.dotted && <span className="sj-note__dot" style={{
                left: augmentationDotXPx(stemDirectionForY(slot.note.yPx)),
                top: dotYForNote(slot.note.yPx, slot.note.kind) - slot.note.yPx,
                width: DOT_RADIUS * 2, height: DOT_RADIUS * 2, background: ink,
              }} />}
              {slot.note.showLabel && <span className="sj-note__label" style={{ color: ink }}>{slot.note.noteLabel}</span>}
            </>}
          </div>
        })}
      </div>
    </div>
  )
}
