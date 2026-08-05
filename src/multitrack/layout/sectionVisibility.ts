import type { MultitrackPanelState, PerformancePanelState } from '../types'

/** A box with no section window set is present for the whole song. */
export function hasSectionWindow(panel: PerformancePanelState): boolean {
  return panel.sectionStartSec !== undefined || panel.sectionEndSec !== undefined
}

export function isPanelActiveAt(panel: PerformancePanelState, timeSec: number): boolean {
  const { sectionStartSec: start, sectionEndSec: end } = panel
  if (start === undefined && end === undefined) return true
  if (start !== undefined && timeSec < start) return false
  if (end !== undefined && timeSec >= end) return false
  return true
}

/**
 * Ids of the performance boxes that hold a grid slot at `timeSec`. Boxes outside
 * their section window drop out so the rest reflow to fill the canvas. If every
 * box would drop out, they all stay — an empty canvas is never the right answer.
 */
export function activePanelIdsAt(panels: MultitrackPanelState[], timeSec: number): string[] {
  const performance = panels.filter(
    (panel): panel is PerformancePanelState => panel.kind === 'performance',
  )
  const active = performance.filter((panel) => isPanelActiveAt(panel, timeSec))
  return (active.length > 0 ? active : performance).map((panel) => panel.id)
}
