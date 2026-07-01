import type { Take } from '../types'
import { shareTakeToSystem } from '../utils/shareTakeVideo'
import { renderCreatorStudioPreviewModel, validateCreatorStudioExport } from './renderer'
import type { CreatorStudioEditorState, CreatorStudioExportResult } from './types'

export async function exportCreatorStudioTake(
  take: Take,
  state: CreatorStudioEditorState,
): Promise<CreatorStudioExportResult> {
  const validation = validateCreatorStudioExport(state)
  if (!validation.ok) return validation

  const previewModel = renderCreatorStudioPreviewModel(state)
  console.log('[CreatorStudio] export requested', {
    takeId: take.id,
    aspectRatio: previewModel.aspectRatio,
    objectCount: previewModel.objects.length,
    sheetMusicLayers: previewModel.objects.filter((object) => object.kind === 'sheetMusic').length,
    audioSource: previewModel.audio.source,
  })

  const result = await shareTakeToSystem(take)
  if (result.ok) return { ok: true }
  return { ok: false, reason: result.reason }
}
