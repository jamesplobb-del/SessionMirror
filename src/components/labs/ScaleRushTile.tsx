import type { CSSProperties } from 'react'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'
import { SCALE_RUSH_ASSETS } from '../../labs/scaleRush/scaleRushAssets'

export type ScaleRushTileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface ScaleRushTileProps {
  row: CourseRow
  variant: ScaleRushTileVariant
  depthIndex?: number
}

/**
 * Grass voxel tile — note label from buildCourseRows() (single source of truth).
 */
export default function ScaleRushTile({ row, variant, depthIndex = 0 }: ScaleRushTileProps) {
  const isStart = variant === 'start' || row.isStart
  const isTarget = !isStart && (variant === 'target' || row.isTarget)
  const isLanded = variant === 'landed'

  return (
    <div
      className={[
        'sr-tile',
        isStart && 'sr-tile--start',
        isTarget && 'sr-tile--target',
        isLanded && 'sr-tile--landed',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--sr-depth': depthIndex } as CSSProperties}
    >
      <div className="sr-tile__shadow" aria-hidden />
      <div className="sr-tile__block">
        <img
          className="sr-tile__grass-img"
          src={SCALE_RUSH_ASSETS.grass}
          alt=""
          draggable={false}
        />
        <span className="sr-tile__label">{isStart ? 'GO' : row.noteLabel}</span>
      </div>
    </div>
  )
}
