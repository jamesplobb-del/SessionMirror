import { Capacitor } from '@capacitor/core'
import type { Take } from '../types'
import BestTakeAudioPlugin from '../utils/audioSessionRoute'
import {
  resolveNativeExportAudioGain,
  resolveNativeFileUri,
  shareTakeToSystem,
} from '../utils/shareTakeVideo'
import { extensionForBlob, writeBlobToNativeCache } from '../utils/nativeAssetCache'
import { renderCreatorStudioPreviewModel, validateCreatorStudioExport } from './renderer'
import { loadStudioAssetBlob } from './projectStorage'
import type {
  CreatorStudioEditorState,
  CreatorStudioExportResult,
  StudioCanvasObject,
} from './types'

const CREATOR_STUDIO_EXPORT_DIR = 'creator-studio-export-assets'

async function writeStudioAssetToCache(
  takeId: string,
  objectId: string,
  storageKey: string,
  fallbackName: string,
): Promise<string | null> {
  const blob = await loadStudioAssetBlob(storageKey)
  if (!blob) return null

  const extension = extensionForBlob(blob, fallbackName)
  return writeBlobToNativeCache(CREATOR_STUDIO_EXPORT_DIR, `${takeId}-${objectId}.${extension}`, blob)
}

async function prepareNativeRenderObjects(
  takeId: string,
  objects: StudioCanvasObject[],
): Promise<Array<Record<string, unknown>>> {
  const nativeObjects: Array<Record<string, unknown>> = []

  for (const object of objects) {
    if (object.kind === 'recording') {
      nativeObjects.push({
        kind: object.kind,
        transform: object.transform,
      })
      continue
    }

    if (object.kind === 'text') {
      nativeObjects.push({
        kind: object.kind,
        text: object.text,
        transform: object.transform,
      })
      continue
    }

    if (object.kind === 'watermark') {
      if (!object.visible) continue
      nativeObjects.push({
        kind: object.kind,
        text: object.text,
        transform: object.transform,
      })
      continue
    }

    const path = await writeStudioAssetToCache(
      takeId,
      object.id,
      object.storageKey,
      object.name,
    )
    if (!path) continue

    nativeObjects.push({
      kind: object.kind,
      name: object.name,
      fileType: object.fileType,
      path,
      displayMode: object.displayMode,
      separateRatio: object.separateRatio,
      transform: object.transform,
    })
  }

  return nativeObjects
}

async function exportNativeCreatorStudioTake(
  take: Take,
  state: CreatorStudioEditorState,
): Promise<CreatorStudioExportResult> {
  const sourcePath = await resolveNativeFileUri(take)
  if (!sourcePath) return { ok: false, reason: 'missing_file' }

  const previewModel = renderCreatorStudioPreviewModel(state)
  const rendered = await BestTakeAudioPlugin.renderCreatorStudioVideo({
    sourcePath,
    aspectRatio: previewModel.aspectRatio,
    trimStartPercent: previewModel.trim.start,
    trimEndPercent: previewModel.trim.end,
    audioGain: resolveNativeExportAudioGain(take),
    objects: await prepareNativeRenderObjects(take.id, previewModel.objects),
  })

  await BestTakeAudioPlugin.shareMediaFile({
    path: rendered.path,
    title: `${take.name || 'BestTake'} Creator Studio`,
    audioGain: 1,
  })

  return { ok: true }
}

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

  if (Capacitor.getPlatform() === 'ios' && Capacitor.isNativePlatform()) {
    try {
      return await exportNativeCreatorStudioTake(take, state)
    } catch (error) {
      console.warn('[CreatorStudio] native render export failed', error)
      return { ok: false, reason: 'share_failed' }
    }
  }

  const result = await shareTakeToSystem(take)
  if (result.ok) return { ok: true }
  return { ok: false, reason: result.reason }
}
