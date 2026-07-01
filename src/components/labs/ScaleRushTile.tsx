import type { CourseRow } from '../../labs/scaleRush/scaleRushMusicLogic'

export type ScaleRushTileVariant = 'ahead' | 'target' | 'landed' | 'start'

interface ScaleRushTileProps {
  row: CourseRow
  variant: ScaleRushTileVariant
}

/**
 * Center path pad — note label from buildCourseRows() (single source of truth).
 * Lane textures live on the full-width lane, not on this pad.
 */
export default function ScaleRushTile({ row, variant }: ScaleRushTileProps) {
  const isStart = variant === 'start' || row.isStart
  const isTarget = !isStart && (variant === 'target' || row.isTarget)
  const isLanded = variant === 'landed'

  return (
    <div
      className={[
        'sr-pad',
        isStart && 'sr-pad--start',
        isTarget && 'sr-pad--target',
        isLanded && 'sr-pad--landed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sr-pad__shadow" aria-hidden />
      <div className="sr-pad__cube">
        <div className="sr-pad__top">
          <span className="sr-pad__label">{isStart ? 'GO' : row.noteLabel}</span>
        </div>
        <div className="sr-pad__face sr-pad__face--front" />
        <div className="sr-pad__face sr-pad__face--side" />
      </div>
    </div>
  )
}
