import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { buildCourseRows } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import { SCALE_RUSH_ASSETS } from '../../labs/scaleRush/scaleRushAssets'
import type { ScaleRushConfig, ScaleRushFeedback } from '../../labs/scaleRush/scaleRushTypes'
import ScaleRushCharacter from './ScaleRushCharacter'
import ScaleRushTile from './ScaleRushTile'

interface ScaleRushCourseProps {
  config: ScaleRushConfig
  sequenceStep: number
  advanceToken: number
  missToken: number
  feedback: ScaleRushFeedback
  feedbackToken: number
}

const FEEDBACK_LABELS: Record<Exclude<ScaleRushFeedback, null>, string> = {
  perfect: '★ Perfect!',
  good: 'Good!',
  wrong: 'Wrong note',
  timeout: '⚠ Too late',
}

/** Crossy Road lane order — visual only, does not affect note logic. */
const LANE_PATTERN = ['grass', 'road', 'grass', 'river', 'grass', 'tracks', 'grass'] as const
type LaneVisual = (typeof LANE_PATTERN)[number]

function laneVisualForRow(row: CourseRow): LaneVisual {
  return LANE_PATTERN[row.rowOffset % LANE_PATTERN.length]!
}

function LaneDecor({ lane, seed }: { lane: LaneVisual; seed: number }) {
  if (lane !== 'grass') return null
  const kind = seed % 3
  if (kind === 0) {
    return (
      <>
        <span className="sr-decor sr-decor--left sr-tree">
          <span className="sr-tree__crown" />
          <span className="sr-tree__trunk" />
        </span>
        <span className="sr-decor sr-decor--right sr-tree sr-tree--tall">
          <span className="sr-tree__crown" />
          <span className="sr-tree__trunk" />
        </span>
      </>
    )
  }
  if (kind === 1) {
    return (
      <>
        <span className="sr-decor sr-decor--left sr-rock" />
        <span className="sr-decor sr-decor--right sr-flowers">
          <span /><span /><span />
        </span>
      </>
    )
  }
  return (
    <>
      <span className="sr-decor sr-decor--left sr-flowers sr-flowers--orange">
        <span /><span /><span />
      </span>
      <span className="sr-decor sr-decor--right sr-rock" />
    </>
  )
}

function LaneHazards({ lane, seed }: { lane: LaneVisual; seed: number }) {
  const delay = `${(seed % 4) * -0.6}s`
  if (lane === 'road') {
    const colors = ['orange', 'white', 'purple'] as const
    return (
      <>
        <span
          className={`sr-car sr-car--${colors[seed % 3]} sr-car--west`}
          style={{ animationDelay: delay } as CSSProperties}
        />
        <span
          className={`sr-car sr-car--${colors[(seed + 1) % 3]} sr-car--east`}
          style={{ animationDelay: delay } as CSSProperties}
        />
      </>
    )
  }
  if (lane === 'tracks') {
    return (
      <>
        <span className="sr-signal sr-signal--east" />
        <span className="sr-train" style={{ animationDelay: delay } as CSSProperties} />
      </>
    )
  }
  if (lane === 'river') {
    return (
      <>
        <span className="sr-log sr-log--west" style={{ animationDelay: delay } as CSSProperties} />
        <span className="sr-log sr-log--east" style={{ animationDelay: delay } as CSSProperties} />
      </>
    )
  }
  return null
}

interface LaneProps {
  row: CourseRow
  variant: 'ahead' | 'target' | 'landed' | 'start'
  depth: number
  isPlayer?: boolean
  children?: ReactNode
}

function Lane({ row, variant, depth, isPlayer = false, children }: LaneProps) {
  const visual = laneVisualForRow(row)
  const surfaceUrl =
    visual === 'river'
      ? SCALE_RUSH_ASSETS.waterLane
      : visual === 'grass'
        ? SCALE_RUSH_ASSETS.grassLane
        : visual === 'road'
          ? SCALE_RUSH_ASSETS.roadLane
        : null

  return (
    <div
      className={[
        `sr-lane sr-lane--${visual}`,
        isPlayer && 'sr-lane--player',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--sr-depth': depth } as CSSProperties}
    >
      {surfaceUrl && (
        <div
          className="sr-lane__texture"
          style={{ backgroundImage: `url(${surfaceUrl})` }}
          aria-hidden
        />
      )}
      <LaneHazards lane={visual} seed={row.rowOffset} />
      <LaneDecor lane={visual} seed={row.rowOffset} />
      <div className="sr-lane__path">
        <ScaleRushTile row={row} variant={variant} />
        {children}
      </div>
    </div>
  )
}

export default function ScaleRushCourse({
  config,
  sequenceStep,
  advanceToken,
  missToken,
  feedback,
  feedbackToken,
}: ScaleRushCourseProps) {
  const [hopping, setHopping] = useState(false)
  const [landing, setLanding] = useState(false)
  const [hit, setHit] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [scrollBump, setScrollBump] = useState(0)
  const [scorePopToken, setScorePopToken] = useState(0)

  const rows = useMemo(
    () => buildCourseRows(config, sequenceStep, 9),
    [config, sequenceStep],
  )

  const aheadRows = rows.filter((row) => !row.isPlayerRow).reverse()
  const playerRow = rows.find((row) => row.isPlayerRow)

  useEffect(() => {
    if (advanceToken === 0) return
    setHopping(true)
    setLanding(false)
    setScrollBump((value) => value + 1)
    setScorePopToken((value) => value + 1)
    const hopEnd = window.setTimeout(() => {
      setHopping(false)
      setLanding(true)
    }, 340)
    const landEnd = window.setTimeout(() => setLanding(false), 540)
    return () => {
      window.clearTimeout(hopEnd)
      window.clearTimeout(landEnd)
    }
  }, [advanceToken])

  useEffect(() => {
    if (missToken === 0) return
    setShaking(true)
    setHit(true)
    const shakeEnd = window.setTimeout(() => setShaking(false), 450)
    const hitEnd = window.setTimeout(() => setHit(false), 380)
    return () => {
      window.clearTimeout(shakeEnd)
      window.clearTimeout(hitEnd)
    }
  }, [missToken])

  const feedbackLabel = feedback ? FEEDBACK_LABELS[feedback] : null
  const feedbackTone =
    feedback === 'perfect' || feedback === 'good'
      ? 'success'
      : feedback === 'timeout'
        ? 'timeout'
        : 'error'

  return (
    <div
      className={`sr-world ${shaking ? 'sr-world--shake' : ''}`}
      aria-label="Scale Rush course"
    >
      <div className="sr-world__sky" />

      {feedbackLabel && (
        <p
          key={feedbackToken}
          className={`sr-world__feedback sr-world__feedback--${feedbackTone}`}
          role="status"
        >
          {feedbackLabel}
        </p>
      )}

      <div className={`sr-world__viewport ${hopping ? 'sr-world__viewport--hop' : ''}`}>
        <div className="sr-world__ground" />

        <div className="sr-world__scene">
          <div className="sr-world__tilt">
            <div
              className="sr-world__lanes"
              style={{ '--sr-scroll': scrollBump } as CSSProperties}
            >
              {aheadRows.map((row, index) => {
                const depth = aheadRows.length - index
                return (
                  <Lane
                    key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
                    row={row}
                    variant={row.isTarget ? 'target' : 'ahead'}
                    depth={depth}
                  />
                )
              })}
            </div>

            {playerRow && (
              <Lane
                row={playerRow}
                variant={playerRow.isStart ? 'start' : 'landed'}
                depth={0}
                isPlayer
              >
                <div className="sr-lane__actor">
                  <ScaleRushCharacter hopping={hopping} landing={landing} hit={hit} />
                  {scorePopToken > 0 && feedback !== 'wrong' && feedback !== 'timeout' && (
                    <span key={scorePopToken} className="sr-score-pop" aria-hidden>
                      +1
                    </span>
                  )}
                </div>
              </Lane>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
