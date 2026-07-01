import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildCourseRows, noteTileColor } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushConfig } from '../../labs/scaleRush/types'

interface ScaleRushCourseProps {
  config: ScaleRushConfig
  sequenceStep: number
  advanceToken: number
  missToken: number
}

function NoteTile({ row }: { row: CourseRow }) {
  if (row.isStart) {
    return (
      <div className="sr-note-tile sr-note-tile--start">
        <span>GO</span>
      </div>
    )
  }

  const color = noteTileColor(row.pitchClass)
  return (
    <div
      className={`sr-note-tile ${row.isTarget ? 'sr-note-tile--target' : ''}`}
      style={{ '--sr-tile-color': color } as CSSProperties}
    >
      <span>{row.noteLabel}</span>
    </div>
  )
}

function RowDecor({ terrain }: { terrain: CourseRow['terrain'] }) {
  if (terrain === 'road') {
    return (
      <>
        <div className="sr-decor sr-decor--car sr-decor--left" aria-hidden />
        <div className="sr-decor sr-decor--car sr-decor--right" aria-hidden />
      </>
    )
  }
  if (terrain === 'river') {
    return (
      <>
        <div className="sr-decor sr-decor--log sr-decor--left" aria-hidden />
        <div className="sr-decor sr-decor--log sr-decor--right" aria-hidden />
      </>
    )
  }
  return (
    <>
      <div className="sr-decor sr-decor--tree sr-decor--left" aria-hidden />
      <div className="sr-decor sr-decor--tree sr-decor--right" aria-hidden />
    </>
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
  const playerRow = rows.find((row) => row.isPlayerRow)

  useEffect(() => {
    if (advanceToken === 0) return
    setHopping(true)
    const timer = window.setTimeout(() => setHopping(false), 480)
    return () => window.clearTimeout(timer)
  }, [advanceToken])

  useEffect(() => {
    if (missToken === 0) return
    setShaking(true)
    const timer = window.setTimeout(() => setShaking(false), 420)
    return () => window.clearTimeout(timer)
  }, [missToken])

  return (
    <div
      className={`sr-course ${shaking ? 'sr-course--shake' : ''}`}
      aria-label="Scale Rush course"
    >
      <div className="sr-course__sky" />
      <div className="sr-course__path-glow" />

      <div className="sr-course__lanes">
        {aheadRows.map((row) => (
          <div
            key={`${sequenceStep}-${row.rowOffset}-${row.sequenceIndex}`}
            className={`sr-course__row sr-course__row--${row.terrain}`}
          >
            <div className="sr-course__lane sr-course__lane--side">
              <RowDecor terrain={row.terrain} />
            </div>
            <div className="sr-course__lane sr-course__lane--center">
              <NoteTile row={row} />
            </div>
            <div className="sr-course__lane sr-course__lane--side">
              <RowDecor terrain={row.terrain} />
            </div>
          </div>
        ))}
      </div>

      <div className="sr-course__player-row">
        <div className="sr-course__lane sr-course__lane--side" />
        <div className="sr-course__lane sr-course__lane--center">
          {playerRow && !playerRow.isStart && (
            <div
              className="sr-note-tile sr-note-tile--landed"
              style={
                { '--sr-tile-color': noteTileColor(playerRow.pitchClass) } as CSSProperties
              }
            >
              <span>{playerRow.noteLabel}</span>
            </div>
          )}
          <div className={`sr-player ${hopping ? 'sr-player--hop' : ''}`} aria-hidden>
            <div className="sr-player__body" />
            <div className="sr-player__shadow" />
          </div>
        </div>
        <div className="sr-course__lane sr-course__lane--side" />
      </div>
    </div>
  )
}
