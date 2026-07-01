import type {
  CreatorStudioEditorState,
  CreatorStudioExportResult,
  CreatorStudioPreviewModel,
} from './types'
import { sortCanvasObjects } from './canvasObjects'

export function renderCreatorStudioPreviewModel(
  state: CreatorStudioEditorState,
): CreatorStudioPreviewModel {
  return {
    aspectRatio: state.aspectRatio,
    trim: state.trim,
    objects: sortCanvasObjects(state.objects).filter((object) => {
      if (object.kind === 'watermark') return object.visible
      return true
    }),
    audio: state.audio,
  }
}

export function validateCreatorStudioExport(state: CreatorStudioEditorState): CreatorStudioExportResult {
  if (state.trim.end !== null && state.trim.end <= state.trim.start) {
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}
