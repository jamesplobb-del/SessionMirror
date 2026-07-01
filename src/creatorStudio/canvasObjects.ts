import type {
  StudioCanvasObject,
  StudioSheetMusicObject,
  StudioTextObject,
  StudioTransform,
  StudioWatermarkObject,
} from './types'

export const DEFAULT_RECORDING_TRANSFORM: StudioTransform = {
  x: 50,
  y: 42,
  scale: 1,
  rotation: 0,
  zIndex: 20,
  width: 88,
}

export const DEFAULT_WATERMARK_TRANSFORM: StudioTransform = {
  x: 78,
  y: 91,
  scale: 1,
  rotation: 0,
  zIndex: 40,
  width: 30,
}

export const DEFAULT_TEXT_TRANSFORM: StudioTransform = {
  x: 50,
  y: 18,
  scale: 1,
  rotation: 0,
  zIndex: 30,
  width: 72,
}

export function createDefaultWatermark(): StudioWatermarkObject {
  return {
    id: 'watermark',
    kind: 'watermark',
    text: 'BestTake',
    visible: true,
    transform: { ...DEFAULT_WATERMARK_TRANSFORM },
  }
}

export function createDefaultRecordingObject(): StudioCanvasObject {
  return {
    id: 'recording',
    kind: 'recording',
    transform: { ...DEFAULT_RECORDING_TRANSFORM },
  }
}

export function createInitialCanvasObjects(): StudioCanvasObject[] {
  return [createDefaultRecordingObject(), createDefaultWatermark()]
}

export function createTextObject(text = 'Text'): StudioTextObject {
  return {
    id: `text-${Date.now()}`,
    kind: 'text',
    text,
    transform: { ...DEFAULT_TEXT_TRANSFORM },
  }
}

export function createSheetMusicObject(
  file: File,
  sourceUrl: string,
  storageKey: string,
): StudioSheetMusicObject {
  const fileType = file.type === 'application/pdf' ? 'pdf' : 'image'
  return {
    id: `sheet-${Date.now()}`,
    kind: 'sheetMusic',
    name: file.name || (fileType === 'pdf' ? 'Sheet music.pdf' : 'Sheet music'),
    fileType,
    sourceUrl,
    storageKey,
    displayMode: 'overlay',
    separateRatio: 60,
    transform: {
      x: 50,
      y: 58,
      scale: 1,
      rotation: 0,
      zIndex: 10,
      width: 78,
    },
  }
}

export function sortCanvasObjects(objects: StudioCanvasObject[]): StudioCanvasObject[] {
  return [...objects].sort((a, b) => a.transform.zIndex - b.transform.zIndex)
}

export function updateCanvasObject(
  objects: StudioCanvasObject[],
  id: string,
  patch: Partial<StudioCanvasObject> | ((object: StudioCanvasObject) => StudioCanvasObject),
): StudioCanvasObject[] {
  return objects.map((object) => {
    if (object.id !== id) return object
    return typeof patch === 'function' ? patch(object) : ({ ...object, ...patch } as StudioCanvasObject)
  })
}

export function removeCanvasObject(objects: StudioCanvasObject[], id: string): StudioCanvasObject[] {
  if (id === 'recording') return objects
  return objects.filter((object) => object.id !== id)
}

export function bringCanvasObjectForward(
  objects: StudioCanvasObject[],
  id: string,
): StudioCanvasObject[] {
  const sorted = sortCanvasObjects(objects)
  const index = sorted.findIndex((object) => object.id === id)
  if (index < 0 || index >= sorted.length - 1) return objects
  const nextZ = sorted[index + 1].transform.zIndex + 1
  return updateCanvasObject(objects, id, (object) => ({
    ...object,
    transform: { ...object.transform, zIndex: nextZ },
  }))
}

export function sendCanvasObjectBackward(
  objects: StudioCanvasObject[],
  id: string,
): StudioCanvasObject[] {
  const sorted = sortCanvasObjects(objects)
  const index = sorted.findIndex((object) => object.id === id)
  if (index <= 0) return objects
  const nextZ = Math.max(1, sorted[index - 1].transform.zIndex - 1)
  return updateCanvasObject(objects, id, (object) => ({
    ...object,
    transform: { ...object.transform, zIndex: nextZ },
  }))
}

export function getSeparateSheet(
  objects: StudioCanvasObject[],
): StudioSheetMusicObject | null {
  const sheet = objects.find(
    (object): object is StudioSheetMusicObject =>
      object.kind === 'sheetMusic' && object.displayMode === 'separate',
  )
  return sheet ?? null
}
