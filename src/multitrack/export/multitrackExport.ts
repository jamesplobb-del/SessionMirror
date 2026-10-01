import { normalizeLayoutStyle } from '../layout/quietWorkspaceLayout'
import { sectionExportWindows } from './sectionExport'
import { Capacitor } from '@capacitor/core'
import type { Take } from '../../types'
import BestTakeAudioPlugin from '../../utils/audioSessionRoute'
import { resolveNativeFileUri } from '../../utils/shareTakeVideo'
import { extensionForBlob, writeBlobToNativeCache } from '../../utils/nativeAssetCache'
import { type LayoutRectPercent } from '../layout/layoutRects'
import { panelOffsetMs, playbackCountOffSec, sourceWindow, withOverlayLeadIn } from '../synchronization/projectTiming'
import { compositionRects } from '../layout/composition'
import { sheetCueWindows, sheetYAt } from '../sheetMusic/sheetMusicTimeline'
import { missingMultitrackFiles } from '../state/multitrackReadiness'
import type { MultitrackLayoutPreset, MultitrackSession, PerformancePanelState } from '../types'

const MULTITRACK_EXPORT_DIR = 'multitrack-export-assets'

export type MultitrackExportFailureReason =
  | 'missing_takes'
  | 'missing_file'
  | 'render_failed'
  | 'share_failed'
  | 'unsupported'
  | 'cancelled'

export type MultitrackExportResult =
  | { ok: true; renderedPath: string; durationSeconds: number; backingSkipped?: 'youtube' }
  | { ok: false; reason: MultitrackExportFailureReason }

export interface MultitrackExportOptions {
  share?: boolean
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

async function fetchBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('An imported file could not be read')
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
  if (missingMultitrackFiles(session).length > 0) {
    return { ok: false, reason: 'missing_file' }
  }
  if (!(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios')) {
    return { ok: false, reason: 'unsupported' }
  }

  const performancePanels = session.panels.filter(
    (panel): panel is PerformancePanelState => panel.kind === 'performance' && !panel.hidden && panel.take !== null,
  )
  if (performancePanels.length === 0) {
    return { ok: false, reason: 'missing_takes' }
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { ok: false, reason: 'missing_takes' }
  const countOffSec = playbackCountOffSec(session.practice.bpm)
  // Same four-beat Play All lead-in. Export timeline 0 is the first click, and
  // each take contributes the footage already in the file from that lead-in
  // (the boxes on screen during count-off), not a black pad before the downbeat.
  const exportDurationSeconds = durationSeconds + countOffSec
  const exportFromSec = -countOffSec
  const { panelRects, musicRect } = compositionRects(session, layout, 0)
  const windows = sectionExportWindows(session, layout, durationSeconds)
  const sources: Array<{
    id: string
    path: string
    rect: LayoutRectPercent
    layoutWindows: Array<{ startSec: number; endSec: number; rect: LayoutRectPercent | null }>
    trimStartSec?: number
    trimEndSec?: number
    timelineOffsetMs?: number
    volume?: number
    muted?: boolean
    mirror?: boolean
    sourceInSec: number
    sourceOutSec: number
    insertAtSec: number
    sectionStartSec?: number
    sectionEndSec?: number
  }> = []
  for (const panel of performancePanels) {
    const rect = windows.find(w => w.panelRects[panel.id])?.panelRects[panel.id] ?? panel.overlay ?? panelRects[panel.id]
    // Audio-only section behavior remains valid when a part is visually absent.
    if (!rect) continue
    const lead = withOverlayLeadIn(
      panel,
      session.practice.bpm,
      panel.trimStartSec ?? 0,
      panelOffsetMs(panel, session.practice.bpm),
    )
    const from = panel.sectionAudio
      ? Math.max(exportFromSec, (panel.sectionStartSec ?? 0) - lead.leadIn)
      : exportFromSec
    const end = Math.min(
      durationSeconds,
      panel.sectionAudio ? panel.sectionEndSec ?? Infinity : Infinity,
    )
    const clip = sourceWindow(lead.trimStart, panel.trimEndSec ?? panel.take!.duration ?? 0,
      lead.offsetMs, from, end)
    if (!clip) continue
    const path = await resolveNativeFileUri(panel.take as Take).catch(() => null)
    if (!path) return { ok: false, reason: 'missing_file' }
    const timelineOffsetMs = panelOffsetMs(panel, session.practice.bpm)
    sources.push({
      id: panel.id,
      mirror: panel.mirrored === true || panel.take?.mirrorPlayback === true,
      sourceInSec: clip.sourceInSec, sourceOutSec: clip.sourceOutSec,
      insertAtSec: clip.timelineDelaySec + from - exportFromSec,
      ...(panel.sectionAudio ? { sectionStartSec: panel.sectionStartSec, sectionEndSec: panel.sectionEndSec } : {}),
      path,
      rect,
      layoutWindows: windows.map((window, index) => ({
        startSec: index === 0 ? 0 : window.startSec + countOffSec,
        endSec: window.endSec + countOffSec,
        rect: window.panelRects[panel.id] ?? null,
      })),
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
    /** PDFs only: the page this cue shows. Older builds always drew page one. */
    pageIndex?: number
    rect: LayoutRectPercent
    x: number
    y: number
    scale: number
    contentMode: 'fill' | 'fit'
    occlusionRects?: LayoutRectPercent[]
    scrollEndY?: number
    scrollDurationSec?: number
  }
  let sheetMusic: ExportSheetLayer | null = null
  let sheetMusicCues: Array<ExportSheetLayer & { startSec: number; endSec?: number }> | undefined
  let backingAudio: { path: string; gain: number; insertAtSec?: number } | null = null
  let backingSkipped: 'youtube' | undefined

  let renderedPath: string
  const exportId = crypto.randomUUID()
  let listener: { remove: () => Promise<void> } | undefined
  const cancel = () => { void BestTakeAudioPlugin.cancelMultitrackExport({ exportId }) }
  try {
    if (options.signal?.aborted) return { ok: false, reason: 'cancelled' }
    listener = await BestTakeAudioPlugin.addListener('multitrackExportProgress', event => {
      if (event.exportId === exportId) options.onProgress?.(event.progress)
    })
    options.signal?.addEventListener('abort', cancel)

    // Every screenshot on the music panel's timeline is written out with the
    // window it owns, so the render cuts line to line exactly as the canvas did.
    const cueWindows = musicRect ? sheetCueWindows(session.sheetMusic) : []
    const layers: Array<ExportSheetLayer & { startSec: number; endSec?: number }> = []
    // Turning a page is the same file again. Copying a 40 MB part into the
    // export cache once per page turn is the difference between a render and a
    // full disk, so each source is written out once and reused by page.
    const written = new Map<string, string>()
    for (const [index, window] of cueWindows.entries()) {
      const asset = window.asset
      let path = written.get(asset.src)
      if (path === undefined) {
        const blob = await fetchBlob(asset.src)
        const extension = extensionForBlob(blob, asset.fileName)
        path = await writeBlobToNativeCache(
          MULTITRACK_EXPORT_DIR,
          `sheet-${Date.now()}-${index}.${extension}`,
          blob,
        )
        written.set(asset.src, path)
      }
      const isPdf = asset.mimeType === 'application/pdf'
      for (const layoutWindow of windows) {
        const startSec = Math.max(window.startSec, layoutWindow.startSec)
        const endSec = Math.min(window.endSec ?? durationSeconds, layoutWindow.endSec)
        if (endSec <= startSec || !layoutWindow.musicRect) continue
        layers.push({
        path,
        fileType: isPdf ? 'pdf' : 'image',
        ...(isPdf ? { pageIndex: Math.max(0, asset.pageIndex ?? 0) } : null),
        rect: layoutWindow.musicRect,
        x: asset.x ?? 0.5,
        y: sheetYAt(asset, startSec - window.startSec),
        ...(asset.scrollEndY !== undefined ? {
          scrollEndY: sheetYAt(asset, endSec - window.startSec),
          scrollDurationSec: Math.min(endSec - startSec, Math.max(.1, (asset.scrollDurationSec ?? 10) - (startSec - window.startSec))),
        } : {}),
        scale: asset.scale ?? 1,
        contentMode: isPdf ? 'fit' : (asset.contentMode ?? 'fill'),
        startSec: startSec + countOffSec, endSec: endSec + countOffSec,
        occlusionRects: session.panels.flatMap(p => p.kind === 'performance' && (p.overlay || p.frame) && layoutWindow.panelRects[p.id] ? [layoutWindow.panelRects[p.id]] : []),
        })
      }
    }
    if (layers.length > 0) {
      // The first layer doubles as the static payload older native builds read.
      const [first] = layers
      sheetMusic = {
        path: first.path,
        fileType: first.fileType,
        ...(first.pageIndex !== undefined ? { pageIndex: first.pageIndex } : null),
        rect: first.rect,
        x: first.x,
        y: first.y,
        scale: first.scale,
        contentMode: first.contentMode,
      }
      sheetMusicCues = layers
    }

    if (session.backing.kind === 'audio') {
      const blob = await fetchBlob(session.backing.src)
      const extension = extensionForBlob(blob, session.backing.fileName)
      const path = await writeBlobToNativeCache(
        MULTITRACK_EXPORT_DIR,
        `backing-${Date.now()}.${extension}`,
        blob,
      )
      backingAudio = { path, gain: session.backing.volume, insertAtSec: countOffSec }
    } else if (session.backing.kind === 'youtube') {
      // YouTube's audio stream isn't capturable/mixable natively — the caller
      // is expected to warn the user before invoking this, but skip cleanly
      // either way rather than failing the whole export.
      backingSkipped = 'youtube'
    }

    if (options.signal?.aborted) return { ok: false, reason: 'cancelled' }
    const overlayRects = session.panels.flatMap(panel =>
      panel.kind === 'performance' && panel.overlay && panelRects[panel.id] ? [panelRects[panel.id]] : [],
    )
    const overlayIds = new Set(
      session.panels.flatMap(panel => panel.kind === 'performance' && panel.overlay ? [panel.id] : []),
    )
    const baseGridRects = Object.entries(panelRects)
      .filter(([id]) => !overlayIds.has(id))
      .map(([, rect]) => rect)
    const rendered = await BestTakeAudioPlugin.renderMultitrackVideo({
      exportId,
      aspectRatio: '9:16',
      cornerRadius: normalizeLayoutStyle(session.layoutStyle).cornerRadius,
      cornerWindows: windows.map((window, index) => ({
        startSec: index === 0 ? 0 : window.startSec + countOffSec,
        endSec: window.endSec + countOffSec,
        rects: session.panels.flatMap(panel => panel.kind === 'performance' && window.panelRects[panel.id] ? [{ rect: window.panelRects[panel.id], overlay: !!panel.overlay }] : [])
          .sort((a, b) => Number(a.overlay) - Number(b.overlay)).map(item => item.rect),
      })),
      durationSeconds: exportDurationSeconds,
      sources: [...sources].reverse().sort((a, b) => Number(!!session.panels.find(p => p.id === b.id && p.kind === 'performance' && p.overlay)) - Number(!!session.panels.find(p => p.id === a.id && p.kind === 'performance' && p.overlay))),
      gridRects: windows.length > 1 ? [] : baseGridRects,
      overlayRects: windows.length > 1 ? [] : overlayRects,
      sheetMusic,
      ...(sheetMusicCues ? { sheetMusicCues } : null),
      backingAudio,
    })
    renderedPath = rendered.path
    durationSeconds = rendered.durationSeconds ?? exportDurationSeconds
  } catch (error) {
    console.warn('[Multitrack] export render failed', error)
    return { ok: false, reason: options.signal?.aborted ? 'cancelled' : 'render_failed' }
  } finally {
    options.signal?.removeEventListener('abort', cancel)
    await listener?.remove()
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
