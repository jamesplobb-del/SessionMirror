import type { CSSProperties } from 'react'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import { noteTileColor } from '../../labs/scaleRush/scaleRushMusicLogic'

export type ScaleRushTileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface ScaleRushTileProps {
  row: CourseRow
  variant: ScaleRushTileVariant
  depthIndex?: number
}

function obstacleClass(terrain: CourseRow['terrain']): string | null {
  if (terrain === 'road') return 'vehicle'
  if (terrain === 'river') return 'log'
  return null
}

/**
 * Isometric note block — label comes from buildCourseRows() (single source of truth).
 */
export default function ScaleRushTile({ row, variant, depthIndex = 0 }: ScaleRushTileProps) {
  if (variant === 'start' || row.isStart) {
    return (
      <div className="sr-iso-tile sr-iso-tile--start" style={{ '--sr-depth': depthIndex } as CSSProperties}>
        <div className="sr-iso-tile__cube">
          <div className="sr-iso-tile__top">
            <span>GO</span>
          </div>
          <div className="sr-iso-tile__left" />
          <div className="sr-iso-tile__right" />
        </div>
        <div className="sr-iso-tile__shadow" />
      </div>
    )
  }

  const color = noteTileColor(row.pitchClass)
  const obstacle = obstacleClass(row.terrain)
  const isTarget = variant === 'target' || row.isTarget
  const isLanded = variant === 'landed'

  return (
    <div
      className={`sr-iso-tile ${isTarget ? 'sr-iso-tile--target' : ''} ${isLanded ? 'sr-iso-tile--landed' : ''}`}
      style={
        {
          '--sr-tile-color': color,
          '--sr-depth': depthIndex,
        } as CSSProperties
      }
    >
      {obstacle && row.terrain !== 'grass' && (
        <div className={`sr-iso-obstacle sr-iso-obstacle--${row.terrain}`} aria-hidden>
          <span className={`sr-iso-obstacle__shape sr-iso-obstacle__shape--${obstacle}`} />
        </div>
      )}
      <div className="sr-iso-tile__cube">
        <div className="sr-iso-tile__top">
          <span>{row.noteLabel}</span>
        </div>
        <div className="sr-iso-tile__left" />
        <div className="sr-iso-tile__right" />
      </div>
      <div className="sr-iso-tile__shadow" />
    </div>
  )
}
