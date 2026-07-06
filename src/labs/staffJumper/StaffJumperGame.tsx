import { useEffect, useMemo, useRef } from 'react'
import { Pause } from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import {
  computeAccuracy,
  getDetectedPitchClass,
  getTargetNoteAtStep,
  getVisiblePlatforms,
  pitchClassLabel,
  pitchClassesMatch,
  type StaffJumperState,
} from './staffJumperMusicLogic'
import {
  getStaffPositionForMidi,
  noteStemPointsDown,
  STAFF_BOTTOM_Y,
  STAFF_LINE_GAP,
  STAFF_LINE_Y_LIST,
  STAFF_LINE_YPX,
  STAFF_TOP_Y,
  TREBLE_NOTE_YPX,
} from './staffNotationMap'
import Pressable from '../../components/ui/Pressable'

interface StaffJumperGameProps {
  state: StaffJumperState
  readout: PitchReadout
  onPause: () => void
  onFallComplete: () => void
}

const PLATFORM_SPACING_PX = 88
const PLAYER_OFFSET_PX = 110
const STAFF_CANVAS_HEIGHT = STAFF_TOP_Y + STAFF_LINE_GAP * 6

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

  const platforms = useMemo(
    () => getVisiblePlatforms(config, state.sequenceStep, 6),
    [config, state.sequenceStep],
  )

  const scrollOffset = state.sequenceStep * PLATFORM_SPACING_PX

  const landedPlatform = platforms.find((p) => p.role === 'landed')
  const targetPlatform = platforms.find((p) => p.role === 'target')
  const characterY =
    landedPlatform?.note.yPx ??
    (targetPlatform ? targetPlatform.note.yPx + STAFF_LINE_GAP : TREBLE_NOTE_YPX.C4!)
  const characterX = landedPlatform
    ? PLAYER_OFFSET_PX
    : PLAYER_OFFSET_PX - PLATFORM_SPACING_PX * 0.35

  const prevAdvanceRef = useRef(state.advanceToken)
  const prevMissRef = useRef(state.missToken)
  const jumpActive = state.advanceToken > prevAdvanceRef.current
  const missActive = state.missToken > prevMissRef.current

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
      <div className="sj-playfield">
        <div
          className="sj-staff-scroll"
          style={{
            transform: `translateX(${-scrollOffset}px)`,
            height: `${STAFF_CANVAS_HEIGHT}px`,
          }}
        >
          <div
            className="sj-staff-band"
            style={{
              top: `${STAFF_TOP_Y}px`,
              height: `${STAFF_BOTTOM_Y - STAFF_TOP_Y}px`,
            }}
          />

          <div className="sj-staff-lines">
            {STAFF_LINE_Y_LIST.map((yPx) => (
              <div key={yPx} className="sj-staff-line" style={{ top: `${yPx}px` }} />
            ))}
            {platforms
              .filter((p) => getStaffPositionForMidi(p.note.midi).kind === 'ledger')
              .map((p, index) => (
                <div
                  key={`ledger-${p.step}`}
                  className="sj-staff-ledger"
                  style={{
                    top: `${p.note.yPx}px`,
                    left: `${PLAYER_OFFSET_PX + index * PLATFORM_SPACING_PX}px`,
                  }}
                />
              ))}
          </div>

          <span
            className="sj-treble-clef"
            style={{ top: `${STAFF_LINE_YPX.B4}px` }}
            aria-hidden
          >
            𝄞
          </span>

          <div className="sj-platforms">
            {platforms.map((slot, index) => {
              const xPx = PLAYER_OFFSET_PX + index * PLATFORM_SPACING_PX
              const missedStep = missActive ? state.sequenceStep - 1 : null
              const isCrack = missedStep != null && slot.step === missedStep
              const isShake = isCrack
              return (
                <div
                  key={slot.step}
                  className={[
                    'sj-platform',
                    slot.role === 'target' ? 'sj-platform--target' : '',
                    slot.role === 'future' ? 'sj-platform--future' : '',
                    isShake ? 'sj-platform--shake' : '',
                    isCrack ? 'sj-platform--crack' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    left: `${xPx}px`,
                    top: `${slot.note.yPx}px`,
                    opacity: slot.opacity,
                  }}
                >
                  <div
                    className={[
                      'sj-note__glyph',
                      noteStemPointsDown(slot.note.yPx)
                        ? 'sj-note__glyph--stem-down'
                        : 'sj-note__glyph--stem-up',
                    ].join(' ')}
                  >
                    <span className="sj-note__stem" aria-hidden />
                    <span className="sj-note__head" aria-hidden />
                  </div>
                  <span className="sj-platform__label">{slot.note.noteLabel}</span>
                </div>
              )
            })}
          </div>

          <div
            className={[
              'sj-character',
              jumpActive ? 'sj-character--jump' : '',
              state.isFalling ? 'sj-character--fall' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${characterX}px`, top: `${characterY}px` }}
          >
            <div className="sj-character__body" />
          </div>
        </div>

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
              <Pause className="h-4 w-4" strokeWidth={3} />
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
