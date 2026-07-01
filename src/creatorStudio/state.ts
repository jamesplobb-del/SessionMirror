import { getTakeMediaType } from '../utils/mediaType'
import type { Take } from '../types'
import type { CreatorStudioEditorState } from './types'
import { createDefaultCreatorStudioOverlays } from './overlays'

export function createInitialCreatorStudioState(take: Take): CreatorStudioEditorState {
  const isVideo = getTakeMediaType(take) === 'video'

  return {
    takeId: take.id,
    takeName: take.name,
    selectedTool: 'trim',
    aspectRatio: isVideo ? '9:16' : '1:1',
    trim: {
      start: 0,
      end: null,
    },
    overlays: createDefaultCreatorStudioOverlays(take),
    sheetMusicLayers: [],
    audio: {
      source: 'original',
      instrumentVolume: 100,
      backingTrackVolume: 80,
      hasPracticeMix: false,
      hasAccompaniment: false,
    },
  }
}
