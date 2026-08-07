import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { getPracticeGameCharacter } from '../practiceGameCharacters'
import {
  computeAccuracy,
  DIFFICULTY_LABELS,
  getDetectedPitchClass,
  getKeySignatureMarkers,
  getTargetNoteAtStep,
  getVisiblePlatforms,
  pitchClassLabel,
  pitchClassesMatch,
  showKeySignature,
  type StaffJumperState,
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
  noteheadHalfHeight,
  NOTEHEAD_RING_THICKNESS,
  NOTEHEAD_W,
  NOTEHEAD_H,
  PLAYER_ANCHOR_X_PX,
  SIGNATURE_TO_NOTE_GAP,
  STAFF_BOTTOM_Y,
  STAFF_CANVAS_HEIGHT,
  STAFF_CLEF_X,
  STAFF_FIRST_NOTE_X,
  STAFF_LINE_THICKNESS,
  STAFF_LINE_Y_LIST,
  STAFF_MIDDLE_Y,
  STAFF_SPACE_PX,
  STAFF_TOP_Y,
  STEM_THICKNESS,
  TIME_SIGNATURE_FONT_SIZE,
  TIME_SIGNATURE_WIDTH,
  TIME_SIGNATURE_YPX,
  NOTE_SPACING_PX,
  type StemDirection,
} from './staffNotationMap'
import StaffGlyph, { useMusicGlyphMetrics } from './StaffGlyph'
import { keySignatureStepPx, layoutMusicGlyph } from './staffGlyphMetrics'
import { layoutRhythm } from './staffJumperNotationLayout'
import { isHollowNotehead, METERS } from './staffJumperRhythm'
import Pressable from '../../components/ui/Pressable'

interface StaffJumperGameProps {
  state: StaffJumperState
  readout: PitchReadout
  onPause: () => void
  hapticFeedback: boolean
  onFallComplete: () => void
  turnRemainingMs: number
  turnDurationMs: number
}

/** Visible feet sit above the transparent bottom padding in the source PNG. */
const PLAYER_FEET_OFFSET_PX = 45
/**
 * Notes kept in the DOM ahead of the player. Eighth notes are narrow, so a
 * screen's worth of them needs more slots than a screen of quarters.
 */
const VISIBLE_NOTE_COUNT = 10

/**
 * How much of the staff to keep readable ahead of the player, measured in
 * quarter-note widths. The staff shrinks to honour this when the pinned clef
 * and key signature are wide (six flats eat real estate on a phone).
 *
 * Sight reading falls apart if you can only see the note you are playing, so
 * this buys roughly a bar of lookahead — and because spacing now follows
 * duration, a bar of eighths fits in well under a bar's worth of width.
 */
const MIN_LOOKAHEAD_NOTES = 3.9

/** Fraction of the playfield height the five-line staff should occupy. */
const STAFF_HEIGHT_FRACTION = 0.28

/** Screen-space margin that keeps the complete score opening inside the viewport. */
const SCORE_OPENING_MARGIN_PX = 14

function glyphNameForAccidental(accidental: '#' | 'b') {
  return accidental === '#' ? ('sharp' as const) : ('flat' as const)
}

/**
 * The hooked flag on an unbeamed eighth note.
 *
 * Drawn rather than set from a font: the SMuFL flag glyphs are absent from the
 * system music fonts this game falls back to, and a flag has to start exactly
 * at the stem tip to look attached.
 */
function flagPath(x: number, y: number, direction: StemDirection): string {
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

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="sj-hud-hearts" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`sj-hud-heart ${i < count ? 'sj-hud-heart--full' : 'sj-hud-heart--empty'}`}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </div>
  )
}

export default function StaffJumperGame({
  state,
  readout,
  onPause,
  hapticFeedback,
  onFallComplete,
  turnRemainingMs,
  turnDurationMs,
}: StaffJumperGameProps) {
  const config = state.config!
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedPc = getDetectedPitchClass(readout, config)
  const isMatch = detectedPc != null && pitchClassesMatch(detectedPc, target.pitchClass)
  const detectedNote =
    detectedPc != null ? (isMatch ? target.noteLabel : pitchClassLabel(detectedPc, config.key)) : '—'
  const isPlayableMatch = isMatch && (config.difficulty !== 'hard' || Math.abs(readout.cents) <= 20)
  const accuracy = computeAccuracy(state.correctCount, state.missCount)
  const cents = Math.round(readout.cents)
  const targetDisplay = config.difficulty === 'easy' ? target.noteLabel : 'See staff'
  const responseHint =
    detectedPc == null
      ? config.difficulty === 'easy'
        ? `Play ${target.noteLabel}`
        : 'Play the note under the player'
      : isPlayableMatch
        ? Math.abs(cents) <= 8
          ? 'Centered'
          : 'Hold steady'
        : isMatch
          ? `${cents > 0 ? '+' : ''}${cents}¢ from center`
          : 'Try again'

  const playfieldRef = useRef<HTMLDivElement>(null)

  /**
   * layout.scale: world-px → screen-px multiplier.
   * Size from the five-line staff itself, then place its midpoint just above
   * the vertical center. This keeps C4–B6 readable without making the staff
   * drift when its world-space safety margins change.
   *
   * layout.baseY: screen Y of world Y=0 after aligning the staff midpoint.
   */
  const [viewport, setViewport] = useState({ width: 390, height: 700 })

  useLayoutEffect(() => {
    const measure = () => {
      const el = playfieldRef.current
      if (!el) return
      setViewport({ width: el.clientWidth, height: el.clientHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const platforms = useMemo(
    () => getVisiblePlatforms(config, state.sequenceStep, VISIBLE_NOTE_COUNT),
    [config, state.sequenceStep],
  )

  const keySignature = useMemo(
    () => (showKeySignature() ? getKeySignatureMarkers(config.key, config.scaleMode, config.clef) : []),
    [config.clef, config.difficulty, config.key, config.scaleMode],
  )

  const meterSpec = METERS[config.meter]
  const glyphMetrics = useMusicGlyphMetrics()

  /**
   * Opening notation is part of the scrolling score. It appears once at the
   * beginning, then leaves the playfield instead of crowding every measure.
   */
  const staffHead = useMemo(() => {
    const clefName = config.clef === 'treble' ? ('trebleClef' as const) : ('bassClef' as const)
    const clefWidth = layoutMusicGlyph(clefName, STAFF_SPACE_PX, glyphMetrics).width
    let width = STAFF_CLEF_X + clefWidth

    const signatureX = width + CLEF_TO_SIGNATURE_GAP
    let signatureWidth = 0
    if (keySignature.length > 0) {
      const symbol = keySignature[0]!.symbol
      const glyph = layoutMusicGlyph(glyphNameForAccidental(symbol), STAFF_SPACE_PX, glyphMetrics)
      signatureWidth =
        (keySignature.length - 1) * keySignatureStepPx(symbol, STAFF_SPACE_PX) + glyph.width
      width = signatureX + signatureWidth
    }

    const timeSignatureX = width + CLEF_TO_SIGNATURE_GAP
    width = timeSignatureX + TIME_SIGNATURE_WIDTH

    return {
      clefName,
      clefWidth,
      signatureX,
      signatureWidth,
      timeSignatureX,
      width: width + SIGNATURE_TO_NOTE_GAP,
    }
  }, [config.clef, glyphMetrics, keySignature])

  // Wide key signatures can extend beyond the original first-note origin.
  // Shift the displayed score just enough to preserve a clean gap without
  // changing the underlying rhythm or pitch sequence.
  const notationLeadInOffset = Math.max(0, staffHead.width - STAFF_FIRST_NOTE_X)
  const displayedPlatforms = useMemo(
    () =>
      platforms.map((slot) => ({
        ...slot,
        xPx: slot.xPx + notationLeadInOffset,
      })),
    [notationLeadInOffset, platforms],
  )
  const rhythmLayout = useMemo(() => layoutRhythm(displayedPlatforms), [displayedPlatforms])

  /**
   * Scale so the staff reads well vertically while retaining useful lookahead.
   * The score opening scrolls away, so it no longer taxes every screenful.
   */
  const staffHeight = STAFF_BOTTOM_Y - STAFF_TOP_Y
  const heightScale = (viewport.height * STAFF_HEIGHT_FRACTION) / staffHeight
  const widthScale =
    (viewport.width - PLAYER_ANCHOR_X_PX) /
    (NOTE_SPACING_PX * MIN_LOOKAHEAD_NOTES + NOTEHEAD_W)
  const scale = Math.max(0.5, Math.min(1.15, Math.min(heightScale, widthScale)))
  const baseY = viewport.height * 0.47 - STAFF_MIDDLE_Y * scale
  const focusWorldX = target.xPx + notationLeadInOffset

  /**
   * The first target must leave world X=0 on screen or the clef and key
   * signature are clipped. After the first successful note, return to the
   * normal reading point and let the score opening scroll away naturally.
   */
  const openingAnchorX = focusWorldX * scale + SCORE_OPENING_MARGIN_PX
  const playerAnchorX =
    state.sequenceStep === 0
      ? Math.max(PLAYER_ANCHOR_X_PX, openingAnchorX)
      : PLAYER_ANCHOR_X_PX

  // Follow every accepted pitch immediately so fast passages never queue visual movement.
  const scrollX = playerAnchorX - focusWorldX * scale

  const visibleWorldWidth = viewport.width / Math.max(scale, 0.1)
  const lastVisibleX =
    displayedPlatforms.length > 0 ? displayedPlatforms[displayedPlatforms.length - 1]!.xPx : focusWorldX
  const staffWorldWidth = Math.max(
    1200,
    focusWorldX + visibleWorldWidth + NOTE_SPACING_PX * 3,
    lastVisibleX + NOTE_SPACING_PX * 3,
  )

  const feedbackAnnouncement =
    state.feedback === 'perfect'
      ? 'Perfect pitch.'
      : state.feedback === 'good'
        ? 'Landed.'
        : state.feedback === 'timeout'
          ? `Time is up. ${state.hearts} hearts left.`
          : state.feedback === 'wrong'
            ? `Wrong note. ${state.hearts} hearts left.`
            : ''
  const targetAnnouncement =
    config.difficulty === 'easy'
      ? `Target ${target.noteLabel}.`
      : `Read the next note for jump ${state.sequenceStep + 1}.`
  const turnFraction = Math.max(0, Math.min(1, turnRemainingMs / Math.max(1, turnDurationMs)))

  const timingLabel =
    state.timing === 'on'
      ? 'On the beat'
      : state.timing === 'early'
        ? `Early ${Math.abs(state.timingErrorMs)}ms`
        : state.timing === 'late'
          ? `Late ${Math.abs(state.timingErrorMs)}ms`
          : null

  // Player position — visible feet meet the top edge of the current target notehead.
  const targetPlatform = displayedPlatforms.find((p) => p.role === 'target')
  const standNote = targetPlatform?.note ?? target
  const targetWorldX = targetPlatform?.xPx ?? target.xPx
  const headTopWorld = standNote.yPx - noteheadHalfHeight()
  const playerFeetScreen = baseY + headTopWorld * scale
  const playerScreenY = playerFeetScreen - PLAYER_FEET_OFFSET_PX
  const playerScreenX = targetWorldX * scale + scrollX
  const playerModel = getPracticeGameCharacter(config.playerModel)

  const prevAdvanceRef = useRef(state.advanceToken)
  const prevMissRef = useRef(state.missToken)
  const jumpActive = state.advanceToken > prevAdvanceRef.current
  const missActive = state.missToken > prevMissRef.current

  useEffect(() => { prevAdvanceRef.current = state.advanceToken }, [state.advanceToken])
  useEffect(() => { prevMissRef.current = state.missToken }, [state.missToken])

  useEffect(() => {
    if (!state.isFalling) return
    const t = window.setTimeout(onFallComplete, 1100)
    return () => window.clearTimeout(t)
  }, [state.isFalling, onFallComplete])

  return (
    <div className="sj-screen sj-screen--playing">
      <div className="sj-playfield" ref={playfieldRef}>
        {/* ── Staff ── */}
        <div className="sj-staff-viewport">
          {/*
            The five lines never scroll: they are horizontally uniform, so
            pinning them keeps the staff continuous under the clef instead of
            starting at the world's left edge.
          */}
          <div
            className="sj-staff-backdrop"
            style={{
              transform: `translateY(${baseY}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: `${visibleWorldWidth}px`,
              height: `${STAFF_CANVAS_HEIGHT}px`,
            }}
          >
            <div
              className="sj-staff-band"
              style={{
                top: `${STAFF_TOP_Y}px`,
                height: `${staffHeight}px`,
                width: `${visibleWorldWidth}px`,
              }}
            />
            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{
                    top: `${yPx}px`,
                    width: `${visibleWorldWidth}px`,
                    height: `${STAFF_LINE_THICKNESS}px`,
                  }}
                />
              ))}
            </div>
          </div>

          <div
            className="sj-staff-world"
            style={{
              /**
               * Transform order (applied right-to-left in screen space):
               * 1. scale around origin (0,0)
               * 2. translateY by baseY
               * 3. translateX by scrollX
               *
               * Result: screen_x = world_x * scale + scrollX
               *         screen_y = world_y * scale + baseY
               */
              transform: `translateX(${scrollX}px) translateY(${baseY}px) scale(${scale})`,
              transformOrigin: '0 0',
              height: `${STAFF_CANVAS_HEIGHT}px`,
              width: `${staffWorldWidth}px`,
            }}
          >
            {/*
              Barlines, stems, beams and flags share one SVG in world
              coordinates. Beamed stems all have to meet the same sloping line,
              so they cannot be drawn inside each note's own anchor.
            */}
            <svg
              className="sj-rhythm-layer"
              width={staffWorldWidth}
              height={STAFF_CANVAS_HEIGHT}
              viewBox={`0 0 ${staffWorldWidth} ${STAFF_CANVAS_HEIGHT}`}
              aria-hidden
              focusable="false"
            >
              {rhythmLayout.barlineXs.map((x) => (
                <rect
                  key={`bar-${x}`}
                  className="sj-barline"
                  x={x - BARLINE_THICKNESS / 2}
                  y={STAFF_TOP_Y}
                  width={BARLINE_THICKNESS}
                  height={staffHeight}
                />
              ))}

              {rhythmLayout.stems.map((stem) => (
                <rect
                  key={stem.key}
                  className="sj-stem"
                  x={stem.x - STEM_THICKNESS / 2}
                  y={Math.min(stem.yStart, stem.yEnd)}
                  width={STEM_THICKNESS}
                  height={Math.abs(stem.yEnd - stem.yStart)}
                  opacity={stem.opacity}
                />
              ))}

              {rhythmLayout.beams.map((beam) => (
                <line
                  key={beam.key}
                  className="sj-beam"
                  x1={beam.x1}
                  y1={beam.y1}
                  x2={beam.x2}
                  y2={beam.y2}
                  strokeWidth={BEAM_THICKNESS}
                  strokeLinecap="butt"
                  opacity={beam.opacity}
                />
              ))}

              {rhythmLayout.flags.map((flag) => (
                <path
                  key={flag.key}
                  className="sj-flag"
                  d={flagPath(flag.x, flag.y, flag.direction)}
                  opacity={flag.opacity}
                />
              ))}
            </svg>

            {/* Noteheads */}
            <div className="sj-noteheads">
              {displayedPlatforms.map((slot) => {
                const shake = missActive && !state.isFalling && slot.role === 'target'
                const crack = state.isFalling && slot.role === 'target'

                return (
                  /**
                   * .sj-note is a zero-size anchor at exactly (xPx, yPx) — the notehead center.
                   * All children are absolutely positioned relative to this point.
                   */
                  <div
                    key={slot.step}
                    className={[
                      'sj-note',
                      `sj-note--${slot.note.kind}`,
                      slot.role === 'target' ? 'sj-note--target' : '',
                      slot.role === 'future' ? 'sj-note--future' : '',
                      slot.role === 'landed' ? 'sj-note--landed' : '',
                      shake ? 'sj-note--shake' : '',
                      crack ? 'sj-note--crack' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ left: `${slot.xPx}px`, top: `${slot.note.yPx}px` }}
                  >
                    {/* Draw every ledger rule required between the staff and this note. */}
                    {slot.note.ledgerLineYPx.map((ledgerY) => (
                      <span
                        key={ledgerY}
                        className="sj-note__ledger"
                        style={{
                          top: `${ledgerY - slot.note.yPx}px`,
                          width: `${LEDGER_LINE_W}px`,
                          height: `${LEDGER_LINE_THICKNESS}px`,
                        }}
                        aria-hidden
                      />
                    ))}


                    {/* Notehead oval — centered at (0, 0) = note center.
                        Half and whole notes are rings rather than filled. */}
                    <span
                      className={`sj-note__head ${
                        isHollowNotehead(slot.note.rhythm.value) ? 'sj-note__head--hollow' : ''
                      }`}
                      style={{
                        width: `${NOTEHEAD_W}px`,
                        height: `${NOTEHEAD_H}px`,
                        opacity: slot.opacity,
                        borderWidth: `${NOTEHEAD_RING_THICKNESS}px`,
                      }}
                      aria-hidden
                    />

                    {/* Augmentation dot, always in a space. */}
                    {slot.note.rhythm.dotted && (
                      <span
                        className="sj-note__dot"
                        style={{
                          left: `${NOTEHEAD_W / 2 + DOT_GAP}px`,
                          top: `${dotYForNote(slot.note.yPx, slot.note.kind) - slot.note.yPx}px`,
                          width: `${DOT_RADIUS * 2}px`,
                          height: `${DOT_RADIUS * 2}px`,
                          opacity: slot.opacity,
                        }}
                        aria-hidden
                      />
                    )}

                    {/* Note name label (easy mode) */}
                    {slot.note.showLabel && (
                      <span className="sj-note__label" style={{ opacity: slot.opacity }}>
                        {slot.note.noteLabel}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* The score opening shares the world's scroll transform and appears once. */}
          <div
            className="sj-staff-head"
            style={{
              transform: `translateX(${scrollX}px) translateY(${baseY}px) scale(${scale})`,
              transformOrigin: '0 0',
              width: `${staffHead.width}px`,
              height: `${STAFF_CANVAS_HEIGHT}px`,
            }}
          >
            <StaffGlyph
              name={staffHead.clefName}
              spacePx={STAFF_SPACE_PX}
              staffY={CLEF_ANCHOR_YPX[config.clef]}
              x={STAFF_CLEF_X}
              metrics={glyphMetrics}
              className="sj-clef"
            />

            {keySignature.map((marker, index) => (
              <StaffGlyph
                key={`${marker.symbol}-${marker.yPx}-${index}`}
                name={glyphNameForAccidental(marker.symbol)}
                spacePx={STAFF_SPACE_PX}
                staffY={marker.yPx}
                x={staffHead.signatureX + index * keySignatureStepPx(marker.symbol, STAFF_SPACE_PX)}
                metrics={glyphMetrics}
                className="sj-key-signature__symbol"
              />
            ))}

            {/* Time signature follows the key signature at the score opening. */}
            <svg
              className="sj-time-signature"
              style={{ left: `${staffHead.timeSignatureX}px`, top: 0 }}
              width={TIME_SIGNATURE_WIDTH}
              height={STAFF_CANVAS_HEIGHT}
              viewBox={`0 0 ${TIME_SIGNATURE_WIDTH} ${STAFF_CANVAS_HEIGHT}`}
              aria-hidden
              focusable="false"
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
          </div>
        </div>

        {/* ── Player anchor follows pitch immediately; sprite animation restarts per note. ── */}
        <div
          className={`sj-player-anchor ${state.isFalling ? 'sj-player-anchor--fall' : ''}`}
          style={{ left: `${playerScreenX}px`, top: `${playerScreenY}px` }}
          aria-hidden
        >
          <img
            key={`sj-player-${state.advanceToken}-${state.missToken}`}
            src={playerModel.asset}
            alt=""
            className={[
              'sj-player',
              jumpActive ? 'sj-player--hop' : '',
              missActive && !state.isFalling ? 'sj-player--stumble' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--sj-player-scale': playerModel.scale } as CSSProperties}
            draggable={false}
          />
        </div>

        {/* ── HUD ── */}
        <div className="sj-hud">
          <div className="sj-hud-top">
            <div className="sj-hud-statusbar">
              <Hearts count={state.hearts} />
              <span className="sj-hud-statusbar__rule" aria-hidden />
              <span className="sj-hud-mini-stat">
                <small>Score</small>
                <strong>{state.score}</strong>
              </span>
              <span className="sj-hud-mini-stat">
                <small>Accuracy</small>
                <strong>{accuracy}%</strong>
              </span>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              hapticFeedback={hapticFeedback}
              onClick={onPause}
              className="sj-hud-pause"
              aria-label="Pause Staff Jumper"
            >
              <Pause aria-hidden />
            </Pressable>
          </div>

          {state.streak >= 3 && (
            <div className="sj-combo-chip">
              Streak {state.streak}
            </div>
          )}

          {state.isCountingIn && (
            <div className="sj-count-in" role="status">
              <strong>Listen for the count-in</strong>
              <small>{config.tempoBpm} BPM · {meterSpec.label}</small>
            </div>
          )}

          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {feedbackAnnouncement} {targetAnnouncement}
          </p>

          {state.feedback && state.feedbackToken > 0 && (
            <div
              key={`sj-feedback-${state.feedbackToken}`}
              className={`sj-feedback-toast sj-feedback-toast--${state.feedback}`}
              aria-hidden
            >
              {state.feedback === 'perfect'
                ? 'Perfect pitch'
                : state.feedback === 'good'
                  ? 'Landed'
                  : state.feedback === 'timeout'
                    ? 'Time’s up'
                    : 'Wrong note'}
              {timingLabel && <em className={`sj-feedback-toast__timing sj-timing--${state.timing}`}>{timingLabel}</em>}
            </div>
          )}

          {!state.isFalling && (
            <div className="sj-target-dock">
              <div className="sj-target-dock__meta">
                <span>{target.patternName}</span>
                <span>{DIFFICULTY_LABELS[config.difficulty]}</span>
              </div>
              <div className="sj-target-dock__notes">
                <div className="sj-target-note">
                  <small>Target</small>
                  <strong>{targetDisplay}</strong>
                </div>
                <div className={`sj-detected-note ${isPlayableMatch ? 'sj-detected-note--match' : ''}`}>
                  <small>Detected</small>
                  <strong>{detectedNote}</strong>
                </div>
              </div>
              <p className={`sj-target-dock__hint ${isPlayableMatch ? 'sj-target-dock__hint--match' : ''}`}>
                {responseHint}
              </p>
              <div
                className="sj-turn-timer"
                key={`sj-turn-${state.sequenceStep}-${state.missToken}`}
                style={
                  {
                    '--sj-turn-remaining': `${turnRemainingMs}ms`,
                    '--sj-turn-fraction': turnFraction,
                  } as CSSProperties
                }
                aria-hidden
              >
                <span />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
