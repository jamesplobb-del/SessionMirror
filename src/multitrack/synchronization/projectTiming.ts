import type { PerformancePanelState } from '../types'
import { timelineOffsetMsForTake } from './multitrackBeatSchedule'

export function panelOffsetMs(panel: PerformancePanelState, bpm: number): number {
  return panel.timelineOffsetMs ?? (panel.take ? timelineOffsetMsForTake(panel.take, bpm) : 0)
}

/** Intersect a media clip with a project interval, preserving the source time mapping. */
export function sourceWindow(trimStart: number, trimEnd: number, offsetMs: number,
  fromSec: number, toSec = Infinity) {
  const offset = offsetMs / 1000
  const start = Math.max(fromSec, -offset)
  const end = Math.min(toSec, trimEnd - trimStart - offset)
  if (!Number.isFinite(start) || end <= start) return null
  return { sourceInSec: start + trimStart + offset,
    sourceOutSec: end + trimStart + offset, timelineDelaySec: start - fromSec }
}

export function panelEndSec(panel: PerformancePanelState, bpm: number): number {
  const rawEnd = panel.trimEndSec ?? panel.take?.duration ?? 0
  return Math.max(0, rawEnd - (panel.trimStartSec ?? 0) - panelOffsetMs(panel, bpm) / 1000)
}
