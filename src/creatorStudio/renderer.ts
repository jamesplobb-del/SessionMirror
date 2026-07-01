import type {
  CreatorStudioEditorState,
  CreatorStudioExportResult,
  CreatorStudioPreviewModel,
} from './types'
import { createDefaultRecordingObject, sortCanvasObjects } from './canvasObjects'

export function renderCreatorStudioPreviewModel(
  state: CreatorStudioEditorState,
): CreatorStudioPreviewModel {
  const hasRecording = state.objects.some((object) => object.kind === 'recording')
  const objects = sortCanvasObjects(
    hasRecording ? state.objects : [createDefaultRecordingObject(), ...state.objects],
  ).filter((object) => {
    if (object.kind === 'watermark') return object.visible
    return true
  })

  return {
    aspectRatio: state.aspectRatio,
    trim: state.trim,
    objects,
    audio: state.audio,
  }
}

export function validateCreatorStudioExport(state: CreatorStudioEditorState): CreatorStudioExportResult {
  if (state.trim.end !== null && state.trim.end <= state.trim.start) {
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}
