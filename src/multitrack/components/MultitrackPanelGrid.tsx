import type { RefObject } from 'react'
import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import { layoutGridStyle, panelAreaStyle } from '../layout/layoutGrid'
import type { Take } from '../../types'
import type {
  MultitrackLayoutPreset,
  MultitrackPanelState,
  MultitrackRecordingPhase,
  SheetMusicAsset,
  SheetMusicPanelState,
} from '../types'

export default function MultitrackPanelGrid({ layout, panels, sheetMusicPanel, recordingTargetPanelId, recordingPhase, streamRef, streamGeneration, nativeLivePreviewActive, nativeCameraBridgeEnabled, countInRemaining, recordingElapsed, reviewTake, reviewMediaRef, onTapPerformance, onRemoveTake, onSheetMusicChange, onEditSheetMusic, onRegisterMedia }: {
  layout: MultitrackLayoutPreset; panels: MultitrackPanelState[]; sheetMusicPanel: SheetMusicPanelState; recordingTargetPanelId: string | null; recordingPhase: MultitrackRecordingPhase
  streamRef?: RefObject<MediaStream | null>; streamGeneration?: number; nativeLivePreviewActive?: boolean; nativeCameraBridgeEnabled?: boolean
  countInRemaining?: number; recordingElapsed?: number; reviewTake?: Take | null; reviewMediaRef?: RefObject<HTMLMediaElement | null>
  onTapPerformance: (id: string) => void; onRemoveTake: (id: string) => void; onSheetMusicChange: (id: string, asset: SheetMusicAsset | null) => void
  onEditSheetMusic?: () => void
  onRegisterMedia: (id: string, el: HTMLMediaElement | null) => void
}) {
  const hasMusic = Boolean(sheetMusicPanel.asset)
  return (
    <div className="multitrack-grid" style={layoutGridStyle(layout, sheetMusicPanel.asset)}>
      {hasMusic ? (
        <div style={panelAreaStyle(sheetMusicPanel.id)} className="multitrack-grid__cell">
          <SheetMusicPanel panel={sheetMusicPanel} onAssetChange={(asset) => onSheetMusicChange(sheetMusicPanel.id, asset)} onEdit={onEditSheetMusic} />
        </div>
      ) : null}
      {panels.map((panel) => (
        <div key={panel.id} style={panelAreaStyle(panel.id)} className="multitrack-grid__cell">
          {panel.kind === 'performance' ? (
            <PerformancePanel
              panel={panel}
              isRecordingTarget={recordingTargetPanelId === panel.id}
              recordingPhase={recordingPhase}
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              nativeLivePreviewActive={nativeLivePreviewActive}
              nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
              countInRemaining={countInRemaining}
              recordingElapsed={recordingElapsed}
              reviewTake={reviewTake}
              reviewMediaRef={reviewMediaRef}
              onTap={() => onTapPerformance(panel.id)}
              onRemoveTake={() => onRemoveTake(panel.id)}
              onRegisterMedia={onRegisterMedia}
            />
          ) : (
            <SheetMusicPanel panel={panel} onAssetChange={(asset) => onSheetMusicChange(panel.id, asset)} onEdit={onEditSheetMusic} />
          )}
        </div>
      ))}
    </div>
  )
}
