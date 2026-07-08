import { Capacitor } from '@capacitor/core'
import type { Take } from '../../types'
import BestTakeAudioPlugin from '../../utils/audioSessionRoute'
import { resolveNativeFileUri } from '../../utils/shareTakeVideo'
import { extensionForBlob, writeBlobToNativeCache } from '../../utils/nativeAssetCache'
import { computeMultitrackLayoutRects, type LayoutRectPercent } from '../layout/layoutRects'
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
  | { ok: true; backingSkipped?: 'youtube' }
  | { ok: false; reason: MultitrackExportFailureReason }

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  return response.blob()
}

/**
 * Renders every performance panel's take into one grid-composited video
 * (matching the on-screen layout), burns in the sheet-music overlay if
 * present, mixes in an uploaded MP3 backing track, and opens the share sheet.
 * iOS-native only — the multitrack recording pipeline itself is native-only.
 */
export async function exportMultitrackSession(
  session: MultitrackSession,
  layout: MultitrackLayoutPreset,
  durationSeconds: number,
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

  const { panelRects, musicRect } = computeMultitrackLayoutRects(layout, session.sheetMusic.asset)

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
    sources.push({
      id: panel.id,
      path,
      rect,
      ...(panel.trimStartSec ? { trimStartSec: panel.trimStartSec } : null),
      ...(panel.trimEndSec !== undefined ? { trimEndSec: panel.trimEndSec } : null),
      ...(panel.take?.timelineOffsetMs ? { timelineOffsetMs: panel.take.timelineOffsetMs } : null),
      // Carry the mixer state through so the exported video matches what the
      // user hears on Play All (unset volume defaults to unity gain on the
      // native side, so untouched panels export exactly as before).
      ...(panel.volume !== undefined ? { volume: panel.volume } : null),
      ...(panel.muted ? { muted: true } : null),
    })
  }
  if (sources.length === 0) return { ok: false, reason: 'missing_takes' }

  let sheetMusic: { path: string; fileType: string; rect: LayoutRectPercent } | null = null
  let backingAudio: { path: string; gain: number } | null = null
  let backingSkipped: 'youtube' | undefined

  let renderedPath: string
  try {
    const musicAsset = session.sheetMusic.asset
    if (musicAsset && musicRect) {
      const blob = await fetchBlob(musicAsset.src)
      const extension = extensionForBlob(blob, musicAsset.fileName)
      const path = await writeBlobToNativeCache(
        MULTITRACK_EXPORT_DIR,
        `sheet-${Date.now()}.${extension}`,
        blob,
      )
      sheetMusic = {
        path,
        fileType: musicAsset.mimeType === 'application/pdf' ? 'pdf' : 'image',
        rect: musicRect,
      }
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
      sheetMusic,
      backingAudio,
    })
    renderedPath = rendered.path
  } catch (error) {
    console.warn('[Multitrack] export render failed', error)
    return { ok: false, reason: 'render_failed' }
  }

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

  return backingSkipped ? { ok: true, backingSkipped } : { ok: true }
}
