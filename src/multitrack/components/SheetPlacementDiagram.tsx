import { computeMultitrackLayoutRects, type LayoutRectPercent } from '../layout/layoutRects'
import type { MultitrackLayoutPreset, SheetMusicAsset } from '../types'

function rectStyle(rect: LayoutRectPercent) {
  return {
    left: `${rect.xPercent}%`,
    top: `${rect.yPercent}%`,
    width: `${rect.widthPercent}%`,
    height: `${rect.heightPercent}%`,
  }
}

export default function SheetPlacementDiagram({
  preset,
  asset,
  position,
}: {
  preset: MultitrackLayoutPreset
  asset: SheetMusicAsset
  position: 'top' | 'bottom' | 'left' | 'right'
}) {
  const { panelRects, musicRect } = computeMultitrackLayoutRects(preset, { ...asset, framePosition: position })

  return (
    <div className="multitrack-placement-diagram" aria-hidden="true">
      {Object.values(panelRects).map((rect, index) => (
        <span key={index} className="multitrack-placement-diagram__panel" style={rectStyle(rect)} />
      ))}
      {musicRect ? <span className="multitrack-placement-diagram__music" style={rectStyle(musicRect)} /> : null}
    </div>
  )
}
