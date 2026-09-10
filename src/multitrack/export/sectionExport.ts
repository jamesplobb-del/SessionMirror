import type { MultitrackSession, MultitrackLayoutPreset } from '../types'
import { activePanelIdsAt } from '../layout/sectionVisibility'
import { computeMultitrackLayoutRects } from '../layout/layoutRects'
import { sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'

/** The same visibility and grid model as the live canvas, sampled at every section boundary. */
export function sectionExportWindows(session: MultitrackSession, layout: MultitrackLayoutPreset, duration: number) {
  const boundaries = new Set([0, duration])
  for (const panel of session.panels) {
    if (panel.kind !== 'performance' || !panel.take) continue
    for (const time of [panel.sectionStartSec, panel.sectionEndSec]) {
      if (time !== undefined && Number.isFinite(time) && time > 0 && time < duration) boundaries.add(time)
    }
  }
  const times = [...boundaries].sort((a, b) => a - b)
  return times.slice(0, -1).map((startSec, i) => ({
    startSec, endSec: times[i + 1],
    ...computeMultitrackLayoutRects(layout, sheetLayoutAsset(session.sheetMusic), activePanelIdsAt(session.panels, startSec)),
  }))
}
