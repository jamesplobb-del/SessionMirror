import type { PerformancePanelState } from '../types'
import { timelineOffsetMsForTake } from './multitrackBeatSchedule'

/** Four quarter-note pulses before timeline zero; never changes clip placement. */
export function playbackCountOffSec(bpm: number): number {
  return 4 * 60 / Math.max(40, Math.min(300, Number.isFinite(bpm) ? bpm : 120))
}

/** Extra boxes keep that same four-beat count-off on screen instead of popping in. */
export function overlayLeadInSec(panel: Pick<PerformancePanelState, 'overlay'>, bpm: number): number {
  return panel.overlay ? playbackCountOffSec(bpm) : 0
}

/** Shift trim/offset so export and monitor can play the recorded count-off before the extra appears. */
export function withOverlayLeadIn(
  panel: PerformancePanelState,
  bpm: number,
  trimStart: number,
  offsetMs: number,
): { trimStart: number; offsetMs: number; leadIn: number } {
  const leadIn = overlayLeadInSec(panel, bpm)
  if (!leadIn) return { trimStart, offsetMs, leadIn: 0 }
  return {
    trimStart: Math.max(0, trimStart - leadIn),
    offsetMs: offsetMs + leadIn * 1000,
    leadIn,
  }
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

/** A backing track can define the song length until the user chooses an end. */
export function projectDurationSec(partEndSec: number, backingEndSec: number, explicitEndSec?: number): number {
  if (explicitEndSec !== undefined) return explicitEndSec
  return Math.max(0, Number.isFinite(partEndSec) ? partEndSec : 0,
    Number.isFinite(backingEndSec) ? backingEndSec : 0)
}

/** Play at the end means replay, including the final display-frame rounding. */
export function playbackStartPosition(requested: number, duration: number): number {
  const position = Number.isFinite(requested) ? Math.max(0, requested) : 0
  return Number.isFinite(duration) && duration > 0 && position >= Math.max(0, duration - 0.05) ? 0 : position
}

/** Editor overdubs follow the bar grid; appending must never land before the playhead. */
export function recordingStartAtPlayhead(requested: number, barSec: number, appendAtEnd = false): number {
  const position = Number.isFinite(requested) ? Math.max(0, requested) : 0
  if (!Number.isFinite(barSec) || barSec <= 0) return position
  const bar = position / barSec
  return Math.max(0, (appendAtEnd ? Math.ceil(bar - 1e-6) : Math.round(bar)) * barSec)
}
