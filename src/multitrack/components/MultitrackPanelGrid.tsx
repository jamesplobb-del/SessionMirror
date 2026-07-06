import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import { layoutGridStyle, panelAreaStyle } from '../layout/layoutGrid'
import type {
  MultitrackLayoutPreset,
  MultitrackPanelState,
  MultitrackRecordingPhase,
  SheetMusicAsset,
  SheetMusicPanelState,
} from '../types'

export default function MultitrackPanelGrid({ layout, panels, sheetMusicPanel, recordingTargetPanelId, recordingPhase, onTapPerformance, onRemoveTake, onSheetMusicChange, onRegisterMedia }: {
  layout: MultitrackLayoutPreset; panels: MultitrackPanelState[]; sheetMusicPanel: SheetMusicPanelState; recordingTargetPanelId: string | null; recordingPhase: MultitrackRecordingPhase
  onTapPerformance: (id: string) => void; onRemoveTake: (id: string) => void; onSheetMusicChange: (id: string, asset: SheetMusicAsset | null) => void
  onRegisterMedia: (id: string, el: HTMLMediaElement | null) => void
}) {
  const hasMusic = Boolean(sheetMusicPanel.asset)
  return (
    <div className="multitrack-grid" style={layoutGridStyle(layout, sheetMusicPanel.asset)}>
      {hasMusic ? (
        <div style={panelAreaStyle(sheetMusicPanel.id)} className="multitrack-grid__cell">
          <SheetMusicPanel panel={sheetMusicPanel} onAssetChange={(asset) => onSheetMusicChange(sheetMusicPanel.id, asset)} />
        </div>
      ) : null}
      {panels.map((panel) => (
        <div key={panel.id} style={panelAreaStyle(panel.id)} className="multitrack-grid__cell">
          {panel.kind === 'performance' ? (
            <PerformancePanel panel={panel} isRecordingTarget={recordingTargetPanelId === panel.id} recordingPhase={recordingPhase} onTap={() => onTapPerformance(panel.id)} onRemoveTake={() => onRemoveTake(panel.id)} onRegisterMedia={onRegisterMedia} />
          ) : (
            <SheetMusicPanel panel={panel} onAssetChange={(asset) => onSheetMusicChange(panel.id, asset)} />
          )}
        </div>
      ))}
    </div>
  )
}
