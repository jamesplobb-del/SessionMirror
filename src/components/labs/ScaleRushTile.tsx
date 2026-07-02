import { SCALE_RUSH_ASSETS } from '../../labs/scaleRush/scaleRushAssets'
import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'

export type ScaleRushTileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface ScaleRushTileProps {
  row: CourseRow
  variant: ScaleRushTileVariant
}

/**
 * Center path tile — grass.png IS the tile; note label from buildCourseRows().
 */
export default function ScaleRushTile({ row, variant }: ScaleRushTileProps) {
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
        !isStart && !isTarget && !isLanded && 'sr-tile--ahead',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sr-tile__shadow" aria-hidden />
      <img
        className="sr-tile__sprite"
        src={SCALE_RUSH_ASSETS.grass}
        alt=""
        draggable={false}
      />
      <span className="sr-tile__label">{isStart ? 'GO' : row.noteLabel}</span>
    </div>
  )
}
