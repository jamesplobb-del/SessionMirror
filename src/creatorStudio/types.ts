import type { Take } from '../types'

export type CreatorStudioTool = 'trim' | 'crop' | 'audio' | 'export'

export type CreatorStudioAspectRatio = '9:16' | '1:1' | '16:9'

export type StudioObjectKind = 'recording' | 'sheetMusic' | 'text' | 'watermark'

export type SheetMusicDisplayMode = 'overlay' | 'separate'

export type CreatorStudioAudioSource =
  | 'original'
  | 'practice_mix'
  | 'accompaniment'
  | 'mute'

export interface CreatorStudioTrimRange {
  start: number
  end: number | null
}

export interface StudioTransform {
  /** Center X as percent of stage width */
  x: number
  /** Center Y as percent of stage height */
  y: number
  scale: number
  rotation: number
  zIndex: number
  /** Bounding width as percent of stage */
  width: number
}

export interface StudioRecordingObject {
  id: 'recording'
  kind: 'recording'
  transform: StudioTransform
}

export interface StudioSheetMusicObject {
  id: string
  kind: 'sheetMusic'
  name: string
  fileType: 'image' | 'pdf'
  sourceUrl: string
  storageKey: string
  displayMode: SheetMusicDisplayMode
  /** Video share when displayMode is separate (30–70). */
  separateRatio: number
  transform: StudioTransform
}

export interface StudioTextObject {
  id: string
  kind: 'text'
  text: string
  transform: StudioTransform
}

export interface StudioWatermarkObject {
  id: 'watermark'
  kind: 'watermark'
  text: string
  visible: boolean
  transform: StudioTransform
}

export type StudioCanvasObject =
  | StudioRecordingObject
  | StudioSheetMusicObject
  | StudioTextObject
  | StudioWatermarkObject

export interface CreatorStudioBackingTrack {
  name: string
  mimeType: string
  storageKey: string
  trim: CreatorStudioTrimRange
  syncOffsetMs: number
  volume: number
}

export interface CreatorStudioAudioMix {
  source: CreatorStudioAudioSource
  instrumentVolume: number
  backingTrackVolume: number
  hasPracticeMix: boolean
  hasAccompaniment: boolean
  backingTrack: CreatorStudioBackingTrack | null
}

export interface CreatorStudioEditorState {
  takeId: string
  takeName: string
  selectedTool: CreatorStudioTool
  aspectRatio: CreatorStudioAspectRatio
  trim: CreatorStudioTrimRange
  objects: StudioCanvasObject[]
  audio: CreatorStudioAudioMix
}

export interface CreatorStudioSessionContext {
  take: Take
  projectName?: string | null
}

export interface CreatorStudioPreviewModel {
  aspectRatio: CreatorStudioAspectRatio
  trim: CreatorStudioTrimRange
  objects: StudioCanvasObject[]
  audio: CreatorStudioAudioMix
}

export type CreatorStudioExportResult =
  | { ok: true }
  | { ok: false; reason: 'missing_file' | 'share_failed' | 'unsupported' }

export type CreatorStudioPersistedState = Omit<
  CreatorStudioEditorState,
  'takeName' | 'selectedTool'
>

export interface StudioGuideLine {
  orientation: 'horizontal' | 'vertical'
  position: number
}
