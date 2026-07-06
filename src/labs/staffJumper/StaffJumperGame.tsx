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
  getStaffScrollX,
  noteheadHeightForKind,
  noteStemPointsDown,
  PLAYER_ANCHOR_X_PX,
  STAFF_BOTTOM_Y,
  STAFF_CANVAS_HEIGHT,
  STAFF_CLEF_X,
  STAFF_LINE_Y_LIST,
  STAFF_LINE_YPX,
  STAFF_TOP_Y,
} from './staffNotationMap'
import Pressable from '../../components/ui/Pressable'

interface StaffJumperGameProps {
  state: StaffJumperState
  readout: PitchReadout
  onPause: () => void
  onFallComplete: () => void
}

const PLAYER_HEIGHT_PX = 52
const STAFF_WORLD_WIDTH_PX = 4800
const VISIBLE_NOTE_COUNT = 6

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <div className="sj-hud-hearts" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`sj-hud-heart ${index < count ? 'sj-hud-heart--full' : 'sj-hud-heart--empty'}`}
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
  const [layout, setLayout] = useState({ scale: 1.65, baseY: 24 })

  const platforms = useMemo(
    () => getVisiblePlatforms(config, state.sequenceStep, VISIBLE_NOTE_COUNT),
    [config, state.sequenceStep],
  )

  const keySignature = useMemo(
    () => (showKeySignature(config.difficulty) ? getKeySignatureMarkers(config.key, config.scaleMode) : []),
    [config.difficulty, config.key, config.scaleMode],
  )

  const scrollX = getStaffScrollX(state.sequenceStep)

  const landedPlatform = platforms.find((p) => p.role === 'landed')
  const targetPlatform = platforms.find((p) => p.role === 'target')
  const standNote = landedPlatform?.note ?? targetPlatform?.note ?? target
  const headHeight = noteheadHeightForKind(standNote.kind)
  const playerWorldY = standNote.yPx - headHeight / 2
  const playerScreenY = layout.baseY + playerWorldY * layout.scale - PLAYER_HEIGHT_PX
  const playerScreenX =
    landedPlatform != null
      ? PLAYER_ANCHOR_X_PX
      : PLAYER_ANCHOR_X_PX - (state.sequenceStep === 0 ? 36 : 0)

  const prevAdvanceRef = useRef(state.advanceToken)
  const prevMissRef = useRef(state.missToken)
  const jumpActive = state.advanceToken > prevAdvanceRef.current
  const missActive = state.missToken > prevMissRef.current

  useLayoutEffect(() => {
    const measure = () => {
      const el = playfieldRef.current
      if (!el) return
      const scale = (el.clientHeight * 0.78) / STAFF_CANVAS_HEIGHT
      const baseY = (el.clientHeight - STAFF_CANVAS_HEIGHT * scale) / 2
      setLayout({ scale, baseY })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    prevAdvanceRef.current = state.advanceToken
  }, [state.advanceToken])

  useEffect(() => {
    prevMissRef.current = state.missToken
  }, [state.missToken])

  useEffect(() => {
    if (!state.isFalling) return
    const timer = window.setTimeout(onFallComplete, 1100)
    return () => window.clearTimeout(timer)
  }, [state.isFalling, onFallComplete])

  return (
    <div className="sj-screen sj-screen--playing">
      <div className="sj-playfield" ref={playfieldRef}>
        <div className="sj-staff-viewport">
          <div
            className="sj-staff-world"
            style={{
              transform: `translateX(${scrollX}px) translateY(${layout.baseY}px) scale(${layout.scale})`,
              transformOrigin: '0 0',
              height: `${STAFF_CANVAS_HEIGHT}px`,
              width: `${STAFF_WORLD_WIDTH_PX}px`,
            }}
          >
            <div
              className="sj-staff-band"
              style={{
                top: `${STAFF_TOP_Y}px`,
                height: `${STAFF_BOTTOM_Y - STAFF_TOP_Y}px`,
                width: `${STAFF_WORLD_WIDTH_PX}px`,
              }}
            />

            <div className="sj-staff-lines">
              {STAFF_LINE_Y_LIST.map((yPx) => (
                <div
                  key={yPx}
                  className="sj-staff-line"
                  style={{ top: `${yPx}px`, width: `${STAFF_WORLD_WIDTH_PX}px` }}
                />
              ))}
            </div>

            <span className="sj-treble-clef" style={{ top: `${STAFF_LINE_YPX.B4}px`, left: `${STAFF_CLEF_X}px` }}>
              𝄞
            </span>

            {keySignature.length > 0 && (
              <div className="sj-key-signature" style={{ left: `${STAFF_CLEF_X + 54}px` }}>
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

            <div className="sj-noteheads">
              {platforms.map((slot) => {
                const shake = missActive && !state.isFalling && slot.role === 'target'
                const crack = state.isFalling && slot.role === 'target'
                const stemDown = noteStemPointsDown(slot.note.yPx)
                return (
                  <div
                    key={slot.step}
                    className={[
                      'sj-note',
                      `sj-note--${slot.note.kind}`,
                      slot.role === 'target' ? 'sj-note--target' : '',
                      slot.role === 'future' ? 'sj-note--future' : '',
                      shake ? 'sj-note--shake' : '',
                      crack ? 'sj-note--crack' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      left: `${slot.xPx}px`,
                      top: `${slot.note.yPx}px`,
                      opacity: slot.opacity,
                    }}
                  >
                    {slot.note.kind === 'ledger' && (
                      <span className="sj-note__ledger" aria-hidden />
                    )}
                    {slot.note.accidental && (
                      <span className="sj-note__accidental" aria-hidden>
                        {slot.note.accidental}
                      </span>
                    )}
                    <div
                      className={[
                        'sj-note__glyph',
                        stemDown ? 'sj-note__glyph--stem-down' : 'sj-note__glyph--stem-up',
                      ].join(' ')}
                    >
                      <span className="sj-note__stem" aria-hidden />
                      <span className="sj-note__head" aria-hidden />
                    </div>
                    {slot.note.showLabel && (
                      <span className="sj-note__label">{slot.note.noteLabel}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

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
            <div
              className={`sj-hud-panel sj-hud-panel--detected ${isMatch ? 'sj-hud-panel--match' : ''}`}
            >
              <p className="sj-hud-panel__label">Detected</p>
              <p className="sj-hud-panel__value">{detectedNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
