import { useEffect, useMemo, useState } from 'react'
import { buildCourseRows } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushConfig } from '../../labs/scaleRush/types'

interface ScaleRushCourseProps {
  config: ScaleRushConfig
  sequenceStep: number
  advanceToken: number
  missToken: number
}

function RowObstacle({ row }: { row: CourseRow }) {
  if (row.isStart) {
    return (
      <div className="sr-tile sr-tile--start">
        <span className="sr-tile__label">GO</span>
      </div>
    )
  }

  if (row.terrain === 'road') {
    return (
      <div className={`sr-tile sr-tile--road ${row.isTarget ? 'sr-tile--target' : ''}`}>
        <div className="sr-car">
          <span className="sr-tile__label sr-tile__label--on-obstacle">{row.noteLabel}</span>
        </div>
      </div>
    )
  }

  if (row.terrain === 'river') {
    return (
      <div className={`sr-tile sr-tile--river ${row.isTarget ? 'sr-tile--target' : ''}`}>
        <div className="sr-log">
          <span className="sr-tile__label sr-tile__label--on-obstacle">{row.noteLabel}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`sr-tile sr-tile--grass ${row.isTarget ? 'sr-tile--target' : ''}`}>
      <div className="sr-grass-pad">
        <span className="sr-tile__label">{row.noteLabel}</span>
      </div>
    </div>
  )
}

export default function ScaleRushCourse({
  config,
  sequenceStep,
  advanceToken,
  missToken,
}: ScaleRushCourseProps) {
  const [hopping, setHopping] = useState(false)
  const [shaking, setShaking] = useState(false)

  const rows = useMemo(
    () => buildCourseRows(config, sequenceStep, 7),
    [config, sequenceStep],
  )

  const aheadRows = rows.filter((row) => !row.isPlayerRow).reverse()

  useEffect(() => {
    if (advanceToken === 0) return
    setHopping(true)
    const timer = window.setTimeout(() => setHopping(false), 420)
    return () => window.clearTimeout(timer)
  }, [advanceToken])

  useEffect(() => {
    if (missToken === 0) return
    setShaking(true)
    const timer = window.setTimeout(() => setShaking(false), 400)
    return () => window.clearTimeout(timer)
  }, [missToken])

  return (
    <div
      className={`sr-course ${shaking ? 'sr-course--shake' : ''}`}
      aria-label="Scale Rush course"
    >
      <div className="sr-course__sky" />
      <div className="sr-course__lanes">
        {aheadRows.map((row) => (
          <div
            key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
            className={`sr-course__row sr-course__row--${row.terrain}`}
          >
            <div className="sr-course__lane sr-course__lane--left" />
            <div className="sr-course__lane sr-course__lane--center">
              <RowObstacle row={row} />
            </div>
            <div className="sr-course__lane sr-course__lane--right" />
          </div>
        ))}
      </div>

      <div className="sr-course__player-row">
        <div className="sr-course__lane sr-course__lane--left" />
        <div className="sr-course__lane sr-course__lane--center">
          <div className={`sr-player ${hopping ? 'sr-player--hop' : ''}`} aria-hidden>
            <div className="sr-player__body" />
            <div className="sr-player__shadow" />
          </div>
        </div>
        <div className="sr-course__lane sr-course__lane--right" />
      </div>
    </div>
  )
}
