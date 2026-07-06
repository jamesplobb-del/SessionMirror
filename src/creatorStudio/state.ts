import { getTakeMediaType } from '../utils/mediaType'
import type { Take } from '../types'
import type { CreatorStudioEditorState, StudioCanvasObject } from './types'
import {
  createDefaultRecordingObject,
  createDefaultWatermark,
  createInitialCanvasObjects,
} from './canvasObjects'
import { loadCreatorStudioProject } from './projectStorage'

export function createInitialCreatorStudioState(take: Take): CreatorStudioEditorState {
  const isVideo = getTakeMediaType(take) === 'video'
  const persisted = loadCreatorStudioProject(take.id)

  const base: CreatorStudioEditorState = {
    takeId: take.id,
    takeName: take.name,
    selectedTool: 'trim',
    aspectRatio: isVideo ? '9:16' : '1:1',
    trim: { start: 0, end: null },
    objects: createInitialCanvasObjects(),
    audio: {
      source: 'original',
      instrumentVolume: 100,
      backingTrackVolume: 80,
      hasPracticeMix: false,
      hasAccompaniment: false,
      backingTrack: null,
    },
  }

  if (!persisted || persisted.takeId !== take.id) {
    return base
  }

  return {
    ...base,
    aspectRatio: persisted.aspectRatio ?? base.aspectRatio,
    trim: persisted.trim ?? base.trim,
    objects: mergeCanvasObjects(persisted.objects, base.objects),
    audio: {
      ...base.audio,
      ...persisted.audio,
      backingTrack: persisted.audio?.backingTrack ?? null,
    },
  }
}

function mergeCanvasObjects(
  saved: StudioCanvasObject[] | undefined,
  defaults: StudioCanvasObject[],
): StudioCanvasObject[] {
  if (!saved?.length) return defaults

  const recording =
    saved.find((object) => object.kind === 'recording') ??
    defaults.find((object) => object.kind === 'recording') ??
    createDefaultRecordingObject()

  const watermark =
    saved.find((object) => object.kind === 'watermark') ??
    defaults.find((object) => object.kind === 'watermark') ??
    createDefaultWatermark()

  const others = saved.filter(
    (object) => object.kind === 'sheetMusic' || object.kind === 'text',
  )

  return [recording, ...others, watermark]
}
