import type { MultitrackSession, MultitrackLayoutPreset } from '../types'
import { compositionRects } from '../layout/composition'
import { overlayLeadInSec } from '../synchronization/projectTiming'

/** The same visibility and grid model as the live canvas, sampled at every section boundary. */
export function sectionExportWindows(session: MultitrackSession, layout: MultitrackLayoutPreset, duration: number) {
  const boundaries = new Set([0, duration])
  for (const panel of session.panels) {
    if (panel.kind !== 'performance' || !panel.take) continue
    const leadIn = overlayLeadInSec(panel, session.practice.bpm)
    if (panel.sectionStartSec !== undefined && Number.isFinite(panel.sectionStartSec)) {
      const appearAt = panel.sectionStartSec - leadIn
      if (appearAt > 0 && appearAt < duration) boundaries.add(appearAt)
      if (panel.sectionStartSec > 0 && panel.sectionStartSec < duration) boundaries.add(panel.sectionStartSec)
    }
    if (panel.sectionEndSec !== undefined && Number.isFinite(panel.sectionEndSec)
      && panel.sectionEndSec > 0 && panel.sectionEndSec < duration) {
      boundaries.add(panel.sectionEndSec)
    }
  }
  const times = [...boundaries].sort((a, b) => a - b)
  return times.slice(0, -1).map((startSec, i) => ({
    startSec, endSec: times[i + 1],
    ...compositionRects(session, layout, startSec),
  }))
}
