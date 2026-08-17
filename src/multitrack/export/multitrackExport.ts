import { Capacitor } from '@capacitor/core'
import type { Take } from '../../types'
import BestTakeAudioPlugin from '../../utils/audioSessionRoute'
import { resolveNativeFileUri } from '../../utils/shareTakeVideo'
import { extensionForBlob, writeBlobToNativeCache } from '../../utils/nativeAssetCache'
import { computeMultitrackLayoutRects, type LayoutRectPercent } from '../layout/layoutRects'
import { timelineOffsetMsForTake } from '../synchronization/multitrackBeatSchedule'
import { sheetCueWindows, sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'
import type { MultitrackLayoutPreset, MultitrackSession, PerformancePanelState } from '../types'

const MULTITRACK_EXPORT_DIR = 'multitrack-export-assets'
const MULTITRACK_EXPORT_ASPECT_RATIO = '9:16'

export type MultitrackExportFailureReason =
  | 'missing_takes'
  | 'missing_file'
  | 'render_failed'
  | 'share_failed'
  | 'unsupported'

export type MultitrackExportResult =
  | { ok: true; renderedPath: string; durationSeconds: number; backingSkipped?: 'youtube' }
  | { ok: false; reason: MultitrackExportFailureReason }

export interface MultitrackExportOptions {
  share?: boolean
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  return response.blob()
}

/**
 * Renders every performance panel's take into one grid-composited video
 * (matching the on-screen layout), burns in the sheet-music overlay if
 * present and mixes in an uploaded backing track. Sharing is optional so the
 * exact same rendered file can instead be persisted into the Take Vault.
 * iOS-native only — the multitrack recording pipeline itself is native-only.
 */
export async function exportMultitrackSession(
  session: MultitrackSession,
  layout: MultitrackLayoutPreset,
  durationSeconds: number,
  options: MultitrackExportOptions = {},
): Promise<MultitrackExportResult> {
  if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios')) {
    return { ok: false, reason: 'unsupported' }
  }

  const performancePanels = session.panels.filter(
    (panel): panel is PerformancePanelState => panel.kind === 'performance' && panel.take !== null,
  )
  if (performancePanels.length === 0) {
    return { ok: false, reason: 'missing_takes' }
  }

  const { panelRects, musicRect } = computeMultitrackLayoutRects(
    layout,
    sheetLayoutAsset(session.sheetMusic),
  )

  const sources: Array<{
    id: string
    path: string
    rect: LayoutRectPercent
    trimStartSec?: number
    trimEndSec?: number
    timelineOffsetMs?: number
    volume?: number
    muted?: boolean
  }> = []
  for (const panel of performancePanels) {
    const rect = panelRects[panel.id]
    if (!rect) continue
    const path = await resolveNativeFileUri(panel.take as Take)
    if (!path) return { ok: false, reason: 'missing_file' }
    const timelineOffsetMs = timelineOffsetMsForTake(panel.take!, session.practice.bpm)
    sources.push({
      id: panel.id,
      path,
      rect,
      ...(panel.trimStartSec ? { trimStartSec: panel.trimStartSec } : null),
      ...(panel.trimEndSec !== undefined ? { trimEndSec: panel.trimEndSec } : null),
      ...(timelineOffsetMs ? { timelineOffsetMs } : null),
      // Carry the mixer state through so the exported video matches what the
      // user hears on Play All (unset volume defaults to unity gain on the
      // native side, so untouched panels export exactly as before).
      ...(panel.volume !== undefined ? { volume: panel.volume } : null),
      ...(panel.muted ? { muted: true } : null),
    })
  }
  if (sources.length === 0) return { ok: false, reason: 'missing_takes' }

  interface ExportSheetLayer {
    path: string
    fileType: string
    rect: LayoutRectPercent
    x: number
    y: number
    scale: number
    contentMode: 'fill' | 'fit'
  }
  let sheetMusic: ExportSheetLayer | null = null
  let sheetMusicCues: Array<ExportSheetLayer & { startSec: number; endSec?: number }> | undefined
  let backingAudio: { path: string; gain: number } | null = null
  let backingSkipped: 'youtube' | undefined

  let renderedPath: string
  try {
    // Every screenshot on the music panel's timeline is written out with the
    // window it owns, so the render cuts line to line exactly as the canvas did.
    const cueWindows = musicRect ? sheetCueWindows(session.sheetMusic) : []
    const layers: Array<ExportSheetLayer & { startSec: number; endSec?: number }> = []
    for (const [index, window] of cueWindows.entries()) {
      const asset = window.asset
      const blob = await fetchBlob(asset.src)
      const extension = extensionForBlob(blob, asset.fileName)
      const path = await writeBlobToNativeCache(
        MULTITRACK_EXPORT_DIR,
        `sheet-${Date.now()}-${index}.${extension}`,
        blob,
      )
      const isPdf = asset.mimeType === 'application/pdf'
      layers.push({
        path,
        fileType: isPdf ? 'pdf' : 'image',
        rect: musicRect!,
        x: asset.x ?? 0.5,
        y: asset.y ?? 0.5,
        scale: asset.scale ?? 1,
        contentMode: isPdf ? 'fit' : (asset.contentMode ?? 'fill'),
        startSec: window.startSec,
        ...(window.endSec !== undefined ? { endSec: window.endSec } : null),
      })
    }
    if (layers.length > 0) {
      // The first layer doubles as the static payload older native builds read.
      const [first] = layers
      sheetMusic = {
        path: first.path,
        fileType: first.fileType,
        rect: first.rect,
        x: first.x,
        y: first.y,
        scale: first.scale,
        contentMode: first.contentMode,
      }
      if (layers.length > 1) sheetMusicCues = layers
    }

    if (session.backing.kind === 'audio') {
      const blob = await fetchBlob(session.backing.src)
      const extension = extensionForBlob(blob, session.backing.fileName)
      const path = await writeBlobToNativeCache(
        MULTITRACK_EXPORT_DIR,
        `backing-${Date.now()}.${extension}`,
        blob,
      )
      backingAudio = { path, gain: session.backing.volume }
    } else if (session.backing.kind === 'youtube') {
      // YouTube's audio stream isn't capturable/mixable natively — the caller
      // is expected to warn the user before invoking this, but skip cleanly
      // either way rather than failing the whole export.
      backingSkipped = 'youtube'
    }

    const rendered = await BestTakeAudioPlugin.renderMultitrackVideo({
      aspectRatio: MULTITRACK_EXPORT_ASPECT_RATIO,
      durationSeconds,
      sources,
      gridRects: Object.values(panelRects),
      sheetMusic,
      ...(sheetMusicCues ? { sheetMusicCues } : null),
      backingAudio,
    })
    renderedPath = rendered.path
    durationSeconds = rendered.durationSeconds ?? durationSeconds
  } catch (error) {
    console.warn('[Multitrack] export render failed', error)
    return { ok: false, reason: 'render_failed' }
  }

  if (options.share) {
    try {
      await BestTakeAudioPlugin.shareMediaFile({
        path: renderedPath,
        title: 'BestTake Multitrack',
        audioGain: 1,
      })
    } catch (error) {
      console.warn('[Multitrack] export share failed', error)
      return { ok: false, reason: 'share_failed' }
    }
  }

  return backingSkipped
    ? { ok: true, renderedPath, durationSeconds, backingSkipped }
    : { ok: true, renderedPath, durationSeconds }
}
