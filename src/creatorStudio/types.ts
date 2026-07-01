import type { Take } from '../types'

export type CreatorStudioTool = 'trim' | 'crop' | 'audio' | 'overlay' | 'export'

export type CreatorStudioAspectRatio = '9:16' | '1:1' | '16:9'

export type CreatorStudioAudioSource =
  | 'original'
  | 'practice_mix'
  | 'accompaniment'
  | 'mute'

export type CreatorStudioOverlayKind =
  | 'title'
  | 'subtitle'
  | 'watermark'
  | 'instrument'
  | 'practiceDate'

export interface CreatorStudioPosition {
  x: number
  y: number
}

export interface CreatorStudioTrimRange {
  start: number
  end: number | null
}

export interface CreatorStudioOverlayModule {
  id: string
  kind: CreatorStudioOverlayKind
  label: string
  text: string
  enabled: boolean
  position: CreatorStudioPosition
}

export interface CreatorStudioSheetMusicLayer {
  id: string
  name: string
  fileType: 'image' | 'pdf'
  sourceUrl: string
  enabled: boolean
  position: CreatorStudioPosition
  scale: number
}

export interface CreatorStudioAudioMix {
  source: CreatorStudioAudioSource
  instrumentVolume: number
  backingTrackVolume: number
  hasPracticeMix: boolean
  hasAccompaniment: boolean
}

export interface CreatorStudioEditorState {
  takeId: string
  takeName: string
  selectedTool: CreatorStudioTool
  aspectRatio: CreatorStudioAspectRatio
  trim: CreatorStudioTrimRange
  overlays: CreatorStudioOverlayModule[]
  sheetMusicLayers: CreatorStudioSheetMusicLayer[]
  audio: CreatorStudioAudioMix
}

export interface CreatorStudioSessionContext {
  take: Take
  projectName?: string | null
}

export interface CreatorStudioPreviewModel {
  aspectRatio: CreatorStudioAspectRatio
  trim: CreatorStudioTrimRange
  overlays: CreatorStudioOverlayModule[]
  sheetMusicLayers: CreatorStudioSheetMusicLayer[]
  audio: CreatorStudioAudioMix
}

export type CreatorStudioExportResult =
  | { ok: true }
  | { ok: false; reason: 'missing_file' | 'share_failed' | 'unsupported' }
