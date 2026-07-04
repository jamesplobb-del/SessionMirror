import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import { layoutGridStyle, panelAreaStyle } from '../layout/layoutGrid'
import type { MultitrackLayoutPreset, MultitrackPanelState, MultitrackRecordingPhase, SheetMusicAsset } from '../types'

export default function MultitrackPanelGrid({ layout, panels, recordingTargetPanelId, recordingPhase, onTapEmptyPerformance, onRemoveTake, onSheetMusicChange, onRegisterMedia }: {
  layout: MultitrackLayoutPreset; panels: MultitrackPanelState[]; recordingTargetPanelId: string | null; recordingPhase: MultitrackRecordingPhase
  onTapEmptyPerformance: (id: string) => void; onRemoveTake: (id: string) => void; onSheetMusicChange: (id: string, asset: SheetMusicAsset | null) => void
  onRegisterMedia: (id: string, el: HTMLMediaElement | null) => void
}) {
  return (
    <div className="multitrack-grid" style={layoutGridStyle(layout)}>
      {panels.map((panel) => (
        <div key={panel.id} style={panelAreaStyle(panel.id)} className="multitrack-grid__cell">
          {panel.kind === 'performance' ? (
            <PerformancePanel panel={panel} isRecordingTarget={recordingTargetPanelId === panel.id} recordingPhase={recordingPhase} onTapEmpty={() => onTapEmptyPerformance(panel.id)} onRemoveTake={() => onRemoveTake(panel.id)} onRegisterMedia={onRegisterMedia} />
          ) : (
            <SheetMusicPanel panel={panel} onAssetChange={(asset) => onSheetMusicChange(panel.id, asset)} />
          )}
        </div>
      ))}
    </div>
  )
}
