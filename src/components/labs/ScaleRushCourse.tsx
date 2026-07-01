import { useEffect, useMemo, useState, type CSSProperties } from 'react'
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

type LaneVisual = 'field' | 'road' | 'river' | 'tracks'

function laneVisual(row: CourseRow): LaneVisual {
  if (row.terrain === 'road') return row.rowOffset % 2 === 1 ? 'tracks' : 'road'
  if (row.terrain === 'river') return 'river'
  return 'field'
}

function laneSurfaceStyle(visual: LaneVisual): CSSProperties | undefined {
  if (visual === 'river') {
    return {
      backgroundImage: `url(${SCALE_RUSH_ASSETS.water})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  if (visual === 'field') {
    return {
      backgroundImage: `url(${SCALE_RUSH_ASSETS.grass})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return undefined
}

function Scenery({ side, lane, seed }: { side: 'left' | 'right'; lane: LaneVisual; seed: number }) {
  if (lane === 'road' || lane === 'tracks' || lane === 'river') return null
  const flip = side === 'right'
  const kind = (seed + (flip ? 2 : 0)) % 3
  if (kind === 0) {
    return (
      <span className={`sr-scenery sr-tree ${flip ? 'sr-tree--tall' : ''}`}>
        <span className="sr-tree__shadow" />
        <span className="sr-tree__crown" />
        <span className="sr-tree__trunk" />
      </span>
    )
  }
  if (kind === 1) {
    return (
      <span className="sr-scenery sr-rock">
        <span className="sr-rock__shadow" />
        <span className="sr-rock__body" />
      </span>
    )
  }
  return (
    <span className={`sr-scenery sr-flowers ${flip ? 'sr-flowers--orange' : ''}`}>
      <span className="sr-flowers__shadow" />
      <span className="sr-flowers__bloom" />
      <span className="sr-flowers__bloom" />
      <span className="sr-flowers__bloom" />
    </span>
  )
}

function LaneHazards({ lane, seed }: { lane: LaneVisual; seed: number }) {
  const delay = `${(seed % 4) * -0.6}s`
  if (lane === 'road') {
    const colors = ['orange', 'white', 'purple'] as const
    return (
      <div className="sr-hazard sr-hazard--road" aria-hidden>
        <span
          className={`sr-car sr-car--${colors[seed % 3]} sr-car--left`}
          style={{ animationDelay: delay } as CSSProperties}
        />
        <span
          className={`sr-car sr-car--${colors[(seed + 1) % 3]} sr-car--right`}
          style={{ animationDelay: delay } as CSSProperties}
        />
      </div>
    )
  }
  if (lane === 'tracks') {
    return (
      <div className="sr-hazard sr-hazard--tracks" aria-hidden>
        <span className="sr-signal" />
        <span className="sr-train" style={{ animationDelay: delay } as CSSProperties} />
      </div>
    )
  }
  if (lane === 'river') {
    return (
      <div className="sr-hazard sr-hazard--river" aria-hidden>
        <span className="sr-log sr-log--a" style={{ animationDelay: delay } as CSSProperties} />
        <span className="sr-log sr-log--b" style={{ animationDelay: delay } as CSSProperties} />
      </div>
    )
  }
  return null
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
    () => buildCourseRows(config, sequenceStep, 8),
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
      <div className="sr-world__sun" />
      <div className="sr-world__clouds">
        <span className="sr-cloud sr-cloud--a" />
        <span className="sr-cloud sr-cloud--b" />
      </div>

      {feedbackLabel && (
        <p
          key={feedbackToken}
          className={`sr-world__feedback sr-world__feedback--${feedbackTone}`}
          role="status"
        >
          {feedbackLabel}
        </p>
      )}

      <div className={`sr-world__stage ${hopping ? 'sr-world__stage--hop' : ''}`}>
        <div
          className="sr-world__track"
          style={{ '--sr-scroll': scrollBump } as CSSProperties}
        >
          {aheadRows.map((row, index) => {
            const depth = aheadRows.length - index
            const visual = laneVisual(row)
            return (
              <div
                key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
                className={`sr-lane sr-lane--${visual}`}
                style={
                  {
                    '--sr-depth': depth,
                    ...laneSurfaceStyle(visual),
                  } as CSSProperties
                }
              >
                <LaneHazards lane={visual} seed={row.rowOffset + sequenceStep} />
                <div className="sr-lane__scenery sr-lane__scenery--left">
                  <Scenery side="left" lane={visual} seed={row.rowOffset} />
                </div>
                <div className="sr-lane__path">
                  <ScaleRushTile
                    row={row}
                    variant={row.isTarget ? 'target' : 'ahead'}
                    depthIndex={depth}
                  />
                </div>
                <div className="sr-lane__scenery sr-lane__scenery--right">
                  <Scenery side="right" lane={visual} seed={row.rowOffset + 1} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="sr-world__player">
          {playerRow && (
            <ScaleRushTile
              row={playerRow}
              variant={playerRow.isStart ? 'start' : 'landed'}
              depthIndex={0}
            />
          )}
          <ScaleRushCharacter hopping={hopping} landing={landing} hit={hit} />
          {scorePopToken > 0 && feedback !== 'wrong' && feedback !== 'timeout' && (
            <span key={scorePopToken} className="sr-score-pop" aria-hidden>
              +1
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
