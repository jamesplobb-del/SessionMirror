import type { PerformancePanelState } from '../types'
import { timelineOffsetMsForTake } from './multitrackBeatSchedule'

/** Four quarter-note pulses before timeline zero; never changes clip placement. */
export function playbackCountOffSec(bpm: number): number {
  return 4 * 60 / Math.max(40, Math.min(300, Number.isFinite(bpm) ? bpm : 120))
}

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

/** Play at the end means replay, including the final display-frame rounding. */
export function playbackStartPosition(requested: number, duration: number): number {
  const position = Number.isFinite(requested) ? Math.max(0, requested) : 0
  return Number.isFinite(duration) && duration > 0 && position >= Math.max(0, duration - 0.05) ? 0 : position
}
