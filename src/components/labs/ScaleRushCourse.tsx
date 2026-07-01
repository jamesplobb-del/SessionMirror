import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildCourseRows } from '../../labs/scaleRush/scaleRushMusicLogic'
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
  perfect: 'Perfect!',
  good: 'Good!',
  wrong: 'Wrong note',
  timeout: 'Too late',
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
  const [shaking, setShaking] = useState(false)
  const [scrollBump, setScrollBump] = useState(0)

  const rows = useMemo(
    () => buildCourseRows(config, sequenceStep, 7),
    [config, sequenceStep],
  )

  const aheadRows = rows.filter((row) => !row.isPlayerRow).reverse()
  const playerRow = rows.find((row) => row.isPlayerRow)

  useEffect(() => {
    if (advanceToken === 0) return
    setHopping(true)
    setLanding(false)
    setScrollBump((value) => value + 1)
    const hopEnd = window.setTimeout(() => {
      setHopping(false)
      setLanding(true)
    }, 380)
    const landEnd = window.setTimeout(() => setLanding(false), 620)
    return () => {
      window.clearTimeout(hopEnd)
      window.clearTimeout(landEnd)
    }
  }, [advanceToken])

  useEffect(() => {
    if (missToken === 0) return
    setShaking(true)
    const timer = window.setTimeout(() => setShaking(false), 450)
    return () => window.clearTimeout(timer)
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
      className={`sr-course ${shaking ? 'sr-course--shake' : ''}`}
      aria-label="Scale Rush course"
    >
      <div className="sr-course__backdrop">
        <div className="sr-course__sky" />
        <div className="sr-course__ground" />
        <div className="sr-course__path-glow" />
      </div>

      {feedbackLabel && (
        <p
          key={feedbackToken}
          className={`sr-course__feedback sr-course__feedback--${feedbackTone}`}
          role="status"
        >
          {feedbackLabel}
        </p>
      )}

      <div className="sr-course__scene">
        <div
          className="sr-course__track"
          style={{ '--sr-scroll-bump': scrollBump } as CSSProperties}
        >
          {aheadRows.map((row, index) => {
            const depth = aheadRows.length - index
            return (
              <div
                key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
                className={`sr-lane sr-lane--${row.terrain}`}
                style={{ '--sr-lane-depth': depth } as CSSProperties}
              >
                <div className="sr-lane__side sr-lane__side--left">
                  {row.terrain === 'grass' && <span className="sr-tree" />}
                </div>
                <div className="sr-lane__slot">
                  <ScaleRushTile
                    row={row}
                    variant={row.isTarget ? 'target' : 'ahead'}
                    depthIndex={depth}
                  />
                </div>
                <div className="sr-lane__side sr-lane__side--right">
                  {row.terrain === 'grass' && <span className="sr-tree" />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="sr-course__player">
          {playerRow && (
            <ScaleRushTile
              row={playerRow}
              variant={playerRow.isStart ? 'start' : 'landed'}
              depthIndex={0}
            />
          )}
          <ScaleRushCharacter hopping={hopping} landing={landing} />
        </div>
      </div>
    </div>
  )
}
