import type { SheetMusicAsset, SheetMusicCue, SheetMusicPanelState } from '../types'

/**
 * The music panel is a slideshow, not a single picture. `asset` is line one and
 * always covers timeline zero; every cue cuts in at its own second and holds the
 * panel until the next cue starts. These helpers are the single source of truth
 * for that ordering — the panel, the align timeline, and the native export all
 * read the same windows.
 */

export const SHEET_BASE_CUE_ID = 'base'

export interface SheetCueWindow {
  id: string
  asset: SheetMusicAsset
  startSec: number
  /** Undefined means "until the end of the song". */
  endSec: number | undefined
  /** True for the implicit cue built from `panel.asset`, which cannot be retimed. */
  isBase: boolean
}

/** Cues in play order. A cue added before any base image becomes the base itself. */
export function sortedSheetCues(panel: SheetMusicPanelState): SheetMusicCue[] {
  return [...(panel.cues ?? [])].sort((a, b) => a.startSec - b.startSec)
}

export function hasAnySheetImage(panel: SheetMusicPanelState): boolean {
  return panel.asset !== null || (panel.cues?.length ?? 0) > 0
}

/**
 * Every image with the timeline window it owns. The base image starts at zero;
 * when there is no base image the first cue is promoted to cover the opening so
 * the panel is never a blank hole in the grid.
 */
export function sheetCueWindows(panel: SheetMusicPanelState): SheetCueWindow[] {
  const cues = sortedSheetCues(panel)
  const windows: SheetCueWindow[] = []

  if (panel.asset) {
    windows.push({
      id: SHEET_BASE_CUE_ID,
      asset: panel.asset,
      startSec: 0,
      endSec: undefined,
      isBase: true,
    })
  }

  for (const cue of cues) {
    windows.push({
      id: cue.id,
      asset: cue.asset,
      // Without a base image the opening cue still has to cover timeline zero.
      startSec: windows.length === 0 ? 0 : Math.max(0, cue.startSec),
      endSec: undefined,
      isBase: false,
    })
  }

  for (let i = 0; i < windows.length - 1; i += 1) {
    windows[i].endSec = windows[i + 1].startSec
  }
  return windows
}

/** The image on screen at `timeSec` — the last one to have cut in. */
export function activeSheetAssetAt(
  panel: SheetMusicPanelState,
  timeSec: number,
): SheetMusicAsset | null {
  const windows = sheetCueWindows(panel)
  if (windows.length === 0) return null
  let active = windows[0]
  for (const window of windows) {
    if (window.startSec <= timeSec) active = window
  }
  return active.asset
}

/**
 * The image that decides where the music panel sits in the grid. Placement is a
 * property of the panel, not of each screenshot, so it always comes from the
 * first image and every later cue inherits it.
 */
export function sheetLayoutAsset(panel: SheetMusicPanelState): SheetMusicAsset | null {
  const windows = sheetCueWindows(panel)
  return windows[0]?.asset ?? null
}

export function createSheetCueId(): string {
  return `cue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
