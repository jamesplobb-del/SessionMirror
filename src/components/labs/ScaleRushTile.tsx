import type { CSSProperties } from 'react'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import { noteTileColor } from '../../labs/scaleRush/scaleRushMusicLogic'

export type ScaleRushTileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface ScaleRushTileProps {
  row: CourseRow
  variant: ScaleRushTileVariant
  depthIndex?: number
}

function obstacleKind(terrain: CourseRow['terrain']): 'vehicle' | 'log' | null {
  if (terrain === 'road') return 'vehicle'
  if (terrain === 'river') return 'log'
  return null
}

/**
 * Isometric note block — label comes from buildCourseRows() (single source of truth).
 */
export default function ScaleRushTile({ row, variant, depthIndex = 0 }: ScaleRushTileProps) {
  const isStart = variant === 'start' || row.isStart
  const isTarget = !isStart && (variant === 'target' || row.isTarget)
  const isLanded = variant === 'landed'
  const color = isStart ? '#64748b' : noteTileColor(row.pitchClass)
  const obstacle = obstacleKind(row.terrain)

  return (
    <div
      className={[
        'sr-block',
        isStart && 'sr-block--start',
        isTarget && 'sr-block--target',
        isLanded && 'sr-block--landed',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--sr-tile-color': color,
          '--sr-depth': depthIndex,
        } as CSSProperties
      }
    >
      {obstacle && !isStart && (
        <div className={`sr-block__obstacle sr-block__obstacle--${obstacle}`} aria-hidden />
      )}
      <div className="sr-block__cap">
        <span className="sr-block__label">{isStart ? 'GO' : row.noteLabel}</span>
      </div>
      <div className="sr-block__edge sr-block__edge--front" />
      <div className="sr-block__edge sr-block__edge--side" />
      <div className="sr-block__shadow" />
    </div>
  )
}
