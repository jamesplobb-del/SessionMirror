import type {
  CreatorStudioEditorState,
  CreatorStudioExportResult,
  CreatorStudioPreviewModel,
} from './types'

export function renderCreatorStudioPreviewModel(
  state: CreatorStudioEditorState,
): CreatorStudioPreviewModel {
  return {
    aspectRatio: state.aspectRatio,
    trim: state.trim,
    overlays: state.overlays.filter((overlay) => overlay.enabled),
    sheetMusicLayers: state.sheetMusicLayers.filter((layer) => layer.enabled),
    audio: state.audio,
  }
}

export function validateCreatorStudioExport(state: CreatorStudioEditorState): CreatorStudioExportResult {
  if (state.trim.end !== null && state.trim.end <= state.trim.start) {
    return { ok: false, reason: 'unsupported' }
  }

  return { ok: true }
}
