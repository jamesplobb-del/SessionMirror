import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildCourseRows } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushFeedback } from '../../labs/scaleRush/scaleRushTypes'
import type { ScaleRushConfig } from '../../labs/scaleRush/scaleRushTypes'
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
      className={`sr-iso-course ${shaking ? 'sr-iso-course--shake' : ''}`}
      aria-label="Scale Rush isometric course"
    >
      <div className="sr-iso-course__sky" />
      <div className="sr-iso-course__horizon" />

      {feedbackLabel && (
        <p
          key={feedbackToken}
          className={`sr-iso-feedback sr-iso-feedback--${feedbackTone}`}
          role="status"
        >
          {feedbackLabel}
        </p>
      )}

      <div
        className="sr-iso-course__world"
        style={{ '--sr-scroll-bump': scrollBump } as CSSProperties}
      >
        <div className="sr-iso-course__rows">
          {aheadRows.map((row, index) => (
            <div
              key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
              className={`sr-iso-row sr-iso-row--${row.terrain}`}
              style={{ '--sr-row-depth': aheadRows.length - index } as CSSProperties}
            >
              <div className="sr-iso-row__decor sr-iso-row__decor--left" />
              <div className="sr-iso-row__center">
                <ScaleRushTile
                  row={row}
                  variant={row.isTarget ? 'target' : 'ahead'}
                  depthIndex={aheadRows.length - index}
                />
              </div>
              <div className="sr-iso-row__decor sr-iso-row__decor--right" />
            </div>
          ))}
        </div>
      </div>

      <div className="sr-iso-course__player-dock">
        {playerRow && !playerRow.isStart && (
          <ScaleRushTile row={playerRow} variant="landed" depthIndex={0} />
        )}
        <ScaleRushCharacter hopping={hopping} landing={landing} />
      </div>
    </div>
  )
}
