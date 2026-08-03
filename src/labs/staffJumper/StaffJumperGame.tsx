import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { STAFF_JUMPER_ASSETS } from './staffJumperAssets'
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
  LEDGER_LINE_W,
  noteheadHalfHeight,
  NOTEHEAD_W,
  NOTEHEAD_H,
  PLAYER_ANCHOR_X_PX,
  STAFF_BOTTOM_Y,
  STAFF_CANVAS_HEIGHT,
  STAFF_CLEF_X,
  STAFF_FIRST_NOTE_X,
  STAFF_LINE_Y_LIST,
  STAFF_MIDDLE_Y,
  STAFF_TOP_Y,
  NOTE_SPACING_PX,
  TREBLE_CLEF_FONT_SIZE,
} from './staffNotationMap'
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
const VISIBLE_NOTE_COUNT = 7
const LANDING_ANIMATION_MS = 430

function accidentalGlyph(accidental: '#' | 'b'): string {
  return accidental === '#' ? '♯' : '♭'
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
  const detectedPc = getDetectedPitchClass(readout)
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
  const [layout, setLayout] = useState({ scale: 1.1, baseY: 40, viewportWidth: 390 })

  useLayoutEffect(() => {
    const measure = () => {
      const el = playfieldRef.current
      if (!el) return
      const staffHeight = STAFF_BOTTOM_Y - STAFF_TOP_Y
      const scale = Math.max(0.62, Math.min(1.05, (el.clientHeight * 0.19) / staffHeight))
      const staffCenterScreenY = el.clientHeight * 0.47
      const baseY = staffCenterScreenY - STAFF_MIDDLE_Y * scale
      setLayout({ scale, baseY, viewportWidth: el.clientWidth })
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
    () => (showKeySignature(config.difficulty) ? getKeySignatureMarkers(config.key, config.scaleMode) : []),
    [config.difficulty, config.key, config.scaleMode],
  )

  /**
   * Keep the camera on the previous note during the hop. The character moves
   * to the new target first; only after landing does the staff pan to recenter
   * both of them. That makes the character do the jumping, not the platform.
   */
  const [cameraStep, setCameraStep] = useState(state.sequenceStep)

  useEffect(() => {
    if (cameraStep === state.sequenceStep) return
    const timer = window.setTimeout(() => setCameraStep(state.sequenceStep), LANDING_ANIMATION_MS)
    return () => window.clearTimeout(timer)
  }, [cameraStep, state.sequenceStep])

  const focusWorldX = STAFF_FIRST_NOTE_X + cameraStep * NOTE_SPACING_PX
  const scrollX = PLAYER_ANCHOR_X_PX - focusWorldX * layout.scale
  const visibleWorldWidth = layout.viewportWidth / Math.max(layout.scale, 0.1)
  const staffWorldWidth = Math.max(
    1200,
    focusWorldX + visibleWorldWidth + NOTE_SPACING_PX * 3,
    STAFF_FIRST_NOTE_X + (state.sequenceStep + VISIBLE_NOTE_COUNT + 3) * NOTE_SPACING_PX,
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

  // Player position — visible feet meet the top edge of the current target notehead.
  const targetPlatform = platforms.find((p) => p.role === 'target')
  const standNote = targetPlatform?.note ?? target
  const targetWorldX = targetPlatform?.xPx ?? STAFF_FIRST_NOTE_X + state.sequenceStep * NOTE_SPACING_PX
  const headTopWorld = standNote.yPx - noteheadHalfHeight()
  const playerFeetScreen = layout.baseY + headTopWorld * layout.scale
  const playerScreenY = playerFeetScreen - PLAYER_FEET_OFFSET_PX
  const playerScreenX = targetWorldX * layout.scale + scrollX

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
        {/* ── Scrolling staff world ── */}
        <div className="sj-staff-viewport">
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
              transform: `translateX(${scrollX}px) translateY(${layout.baseY}px) scale(${layout.scale})`,
              transformOrigin: '0 0',
              height: `${STAFF_CANVAS_HEIGHT}px`,
              width: `${staffWorldWidth}px`,
            }}
          >
            {/* Light band behind the staff */}
            <div
              className="sj-staff-band"
              style={{
                top: `${STAFF_TOP_Y}px`,
                height: `${STAFF_BOTTOM_Y - STAFF_TOP_Y}px`,
                width: `${staffWorldWidth}px`,
              }}
            />

            {/* 5 staff lines */}
            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{ top: `${yPx}px`, width: `${staffWorldWidth}px` }}
                />
              ))}
            </div>

            {/* Treble clef centered across the five-line staff. */}
            <span
              className="sj-treble-clef"
              style={{
                top: `${STAFF_MIDDLE_Y}px`,
                left: `${STAFF_CLEF_X}px`,
                fontSize: `${TREBLE_CLEF_FONT_SIZE}px`,
              }}
              aria-hidden
            >
              𝄞
            </span>

            {/* Key signature (hard mode only) */}
            {keySignature.length > 0 && (
              <div className="sj-key-signature" style={{ left: `${STAFF_CLEF_X + 60}px` }}>
                {keySignature.map((marker, index) => (
                  <span
                    key={`${marker.symbol}-${marker.yPx}-${index}`}
                    className="sj-key-signature__symbol"
                    data-accidental={marker.symbol}
                    style={{ top: `${marker.yPx}px`, left: `${index * 14}px` }}
                  >
                    {accidentalGlyph(marker.symbol)}
                  </span>
                ))}
              </div>
            )}

            {/* Noteheads */}
            <div className="sj-noteheads">
              {platforms.map((slot) => {
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
                        }}
                        aria-hidden
                      />
                    ))}

                    {/* Accidental to the left */}
                    {slot.note.accidental && (
                      <span
                        className="sj-note__accidental"
                        data-accidental={slot.note.accidental}
                        aria-hidden
                      >
                        {accidentalGlyph(slot.note.accidental)}
                      </span>
                    )}

                    {/* Notehead oval — centered at (0, 0) = note center */}
                    <span
                      className="sj-note__head"
                      style={{ width: `${NOTEHEAD_W}px`, height: `${NOTEHEAD_H}px`, opacity: slot.opacity }}
                      aria-hidden
                    />

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
        </div>

        {/* ── Trumpet player — positioned in screen coordinates ── */}
        <img
          src={STAFF_JUMPER_ASSETS.trumpetPlayer}
          alt=""
          className={[
            'sj-player',
            jumpActive ? 'sj-player--hop' : '',
            missActive && !state.isFalling ? 'sj-player--stumble' : '',
            state.isFalling ? 'sj-player--fall' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ left: `${playerScreenX}px`, top: `${playerScreenY}px` }}
          draggable={false}
        />

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
            </div>
          )}

          {!state.isFalling && (
            <div className="sj-target-dock">
              <div className="sj-target-dock__meta">
                <span>Note {state.sequenceStep + 1}</span>
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
