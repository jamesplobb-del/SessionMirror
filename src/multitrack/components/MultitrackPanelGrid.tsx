import type { RefObject } from 'react'
import PerformancePanel from '../performance/PerformancePanel'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import { layoutGridStyle, panelAreaStyle } from '../layout/layoutGrid'
import { activePanelIdsAt } from '../layout/sectionVisibility'
import type { Take } from '../../types'
import type {
  MultitrackLayoutPreset,
  MultitrackPanelState,
  MultitrackRecordingPhase,
  SheetMusicAsset,
  SheetMusicPanelState,
} from '../types'

export default function MultitrackPanelGrid({ layout, panels, sheetMusicPanel, recordingTargetPanelId, recordingPhase, streamRef, streamGeneration, nativeLivePreviewActive, nativeCameraBridgeEnabled, countInRemaining, recordingElapsed, reviewTake, reviewMediaRef, onTapPerformance, onRemoveTake, onSheetMusicChange, onEditSheetMusic, onRegisterMedia, currentTimeSec }: {
  layout: MultitrackLayoutPreset; panels: MultitrackPanelState[]; sheetMusicPanel: SheetMusicPanelState; recordingTargetPanelId: string | null; recordingPhase: MultitrackRecordingPhase
  streamRef?: RefObject<MediaStream | null>; streamGeneration?: number; nativeLivePreviewActive?: boolean; nativeCameraBridgeEnabled?: boolean
  countInRemaining?: number; recordingElapsed?: number; reviewTake?: Take | null; reviewMediaRef?: RefObject<HTMLMediaElement | null>
  onTapPerformance: (id: string) => void; onRemoveTake: (id: string) => void; onSheetMusicChange: (id: string, asset: SheetMusicAsset | null) => void
  onEditSheetMusic?: () => void
  onRegisterMedia: (id: string, el: HTMLMediaElement | null) => void
  /** Timeline position — drives which section-scoped boxes hold a slot. */
  currentTimeSec?: number
}) {
  const hasMusic = Boolean(sheetMusicPanel.asset)
  const activeIds = activePanelIdsAt(panels, currentTimeSec ?? 0)
  const activeIdSet = new Set(activeIds)
  return (
    <div className="multitrack-grid" style={layoutGridStyle(layout, sheetMusicPanel.asset, activeIds)}>
      {hasMusic ? (
        <div style={panelAreaStyle(sheetMusicPanel.id)} className="multitrack-grid__cell">
          <SheetMusicPanel panel={sheetMusicPanel} onAssetChange={(asset) => onSheetMusicChange(sheetMusicPanel.id, asset)} onEdit={onEditSheetMusic} />
        </div>
      ) : null}
      {panels.map((panel) => (
        // Out-of-window boxes stay mounted and merely hidden — unmounting would
        // tear down their <video> and force a reload when the section comes back.
        <div
          key={panel.id}
          style={
            panel.kind !== 'performance' || activeIdSet.has(panel.id)
              ? panelAreaStyle(panel.id)
              : { ...panelAreaStyle(panel.id), display: 'none' }
          }
          className="multitrack-grid__cell"
        >
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
