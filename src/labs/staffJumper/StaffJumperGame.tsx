import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import { STAFF_JUMPER_ASSETS } from './staffJumperAssets'
import {
  computeAccuracy,
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
  STAFF_LINE_YPX,
  STAFF_TOP_Y,
  NOTE_SPACING_PX,
  TREBLE_CLEF_FONT_SIZE,
} from './staffNotationMap'
import Pressable from '../../components/ui/Pressable'

interface StaffJumperGameProps {
  state: StaffJumperState
  readout: PitchReadout
  onPause: () => void
  onFallComplete: () => void
}

/** Screen height of the trumpet player image (CSS px). */
const PLAYER_IMG_HEIGHT = 52
const STAFF_WORLD_WIDTH_PX = 5000
const VISIBLE_NOTE_COUNT = 7

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
  onFallComplete,
}: StaffJumperGameProps) {
  const config = state.config!
  const target = getTargetNoteAtStep(config, state.sequenceStep)
  const detectedPc = getDetectedPitchClass(readout)
  const detectedNote = detectedPc != null ? pitchClassLabel(detectedPc, config.key) : '—'
  const isMatch = detectedPc != null && pitchClassesMatch(detectedPc, target.pitchClass)
  const accuracy = computeAccuracy(state.correctCount, state.missCount)

  const playfieldRef = useRef<HTMLDivElement>(null)

  /**
   * layout.scale: world-px → screen-px multiplier.
   * Scale the full canvas (staff + ledger room) to ~46% of playfield height
   * so the staff dominates without feeling zoomed in.
   *
   * layout.baseY: screen Y of world Y=0 — vertically centers the canvas.
   */
  const [layout, setLayout] = useState({ scale: 1.1, baseY: 40 })

  useLayoutEffect(() => {
    const measure = () => {
      const el = playfieldRef.current
      if (!el) return
      const scale = (el.clientHeight * 0.46) / STAFF_CANVAS_HEIGHT
      const baseY = (el.clientHeight - STAFF_CANVAS_HEIGHT * scale) / 2
      setLayout({ scale, baseY })
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
   * Scroll so the "focus" note (the one the player stands on, or the first target)
   * aligns with PLAYER_ANCHOR_X_PX on screen.
   *
   * Screen X of a world point wx = wx * scale + scrollX
   * ⇒  scrollX = PLAYER_ANCHOR_X_PX - focusWorldX * scale
   */
  const focusStep = state.sequenceStep > 0 ? state.sequenceStep - 1 : 0
  const focusWorldX = STAFF_FIRST_NOTE_X + focusStep * NOTE_SPACING_PX
  const scrollX = PLAYER_ANCHOR_X_PX - focusWorldX * layout.scale

  // Player position — feet on top surface of notehead
  const landedPlatform = platforms.find((p) => p.role === 'landed')
  const targetPlatform = platforms.find((p) => p.role === 'target')
  const standNote = landedPlatform?.note ?? targetPlatform?.note ?? target
  const headTopWorld = standNote.yPx - noteheadHalfHeight()
  const playerFeetScreen = layout.baseY + headTopWorld * layout.scale
  const playerScreenY = playerFeetScreen - PLAYER_IMG_HEIGHT
  const playerScreenX = PLAYER_ANCHOR_X_PX - (state.sequenceStep === 0 && !landedPlatform ? 40 : 0)

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
              width: `${STAFF_WORLD_WIDTH_PX}px`,
            }}
          >
            {/* Light band behind the staff */}
            <div
              className="sj-staff-band"
              style={{
                top: `${STAFF_TOP_Y}px`,
                height: `${STAFF_BOTTOM_Y - STAFF_TOP_Y}px`,
                width: `${STAFF_WORLD_WIDTH_PX}px`,
              }}
            />

            {/* 5 staff lines */}
            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{ top: `${yPx}px`, width: `${STAFF_WORLD_WIDTH_PX}px` }}
                />
              ))}
            </div>

            {/* Treble clef — curl centered on G4 (second line), engraved scale. */}
            <span
              className="sj-treble-clef"
              style={{
                top: `${STAFF_LINE_YPX.G4}px`,
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
                    key={`${marker.symbol}-${marker.yPx}`}
                    className="sj-key-signature__symbol"
                    style={{ top: `${marker.yPx}px`, left: `${index * 14}px` }}
                  >
                    {marker.symbol}
                  </span>
                ))}
              </div>
            )}

            {/* Noteheads */}
            <div className="sj-noteheads">
              {platforms.map((slot) => {
                const shake = missActive && !state.isFalling && slot.role === 'target'
                const crack = state.isFalling && slot.role === 'target'
                const isLedger = slot.note.kind === 'ledger'

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
                    {/* Ledger line — same center as the notehead */}
                    {isLedger && (
                      <span
                        className="sj-note__ledger"
                        style={{ width: `${LEDGER_LINE_W}px` }}
                        aria-hidden
                      />
                    )}

                    {/* Accidental to the left */}
                    {slot.note.accidental && (
                      <span className="sj-note__accidental" aria-hidden>
                        {slot.note.accidental}
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
            <Hearts count={state.hearts} />
            <Pressable
              type="button"
              intensity="soft"
              onClick={onPause}
              className="sj-hud-pause"
              aria-label="Pause"
            >
              <Pause className="h-4 w-4" strokeWidth={2.5} />
            </Pressable>
          </div>

          <div className="sj-hud-stats">
            <div className="sj-hud-panel">
              <p className="sj-hud-panel__label">Score</p>
              <p className="sj-hud-panel__value">{state.score}</p>
            </div>
            <div className="sj-hud-panel">
              <p className="sj-hud-panel__label">Streak</p>
              <p className="sj-hud-panel__value">{state.streak}</p>
            </div>
            <div className="sj-hud-panel">
              <p className="sj-hud-panel__label">Accuracy</p>
              <p className="sj-hud-panel__value">{accuracy}%</p>
            </div>
          </div>

          <div className="sj-hud-bottom">
            <div className="sj-hud-panel sj-hud-panel--target">
              <p className="sj-hud-panel__label">Target</p>
              <p className="sj-hud-panel__value">{target.noteLabel}</p>
            </div>
            <div className={`sj-hud-panel sj-hud-panel--detected ${isMatch ? 'sj-hud-panel--match' : ''}`}>
              <p className="sj-hud-panel__label">Detected</p>
              <p className="sj-hud-panel__value">{detectedNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
