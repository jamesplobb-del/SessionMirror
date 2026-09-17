import type { MultitrackLayoutPreset, MultitrackSession } from '../types'
import { computeMultitrackLayoutRects, type LayoutRectPercent } from './layoutRects'
import { isPanelActiveAt } from './sectionVisibility'
import { overlayLeadInSec } from '../synchronization/projectTiming'
import { sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'

/** Identical rectangles for the live canvas and the exported movie. Floating
 * harmonies never resize the base videos or the scrolling music panel. */
export function compositionRects(
  session: Pick<MultitrackSession, 'panels' | 'sheetMusic'> & { practice?: { bpm?: number } },
  layout: MultitrackLayoutPreset, time: number) {
  const bpm = session.practice?.bpm ?? 120
  const base = session.panels.filter(p => p.kind === 'performance' && !p.hidden && !p.overlay)
  const activeBase = base.filter(p => p.kind === 'performance' && isPanelActiveAt(p, time))
  const music = sheetLayoutAsset(session.sheetMusic)
  const model = activeBase.length ? computeMultitrackLayoutRects(layout, music, activeBase.map(p => p.id))
    : { panelRects: {} as Record<string, LayoutRectPercent>, musicRect: music
      ? { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 100 } : null }
  for (const panel of activeBase) {
    if (panel.kind === 'performance' && panel.frame) model.panelRects[panel.id] = panel.frame
  }
  for (const panel of session.panels) {
    if (panel.kind === 'performance' && !panel.hidden && panel.overlay
      && isPanelActiveAt(panel, time, overlayLeadInSec(panel, bpm))) {
      model.panelRects[panel.id] = panel.overlay
    }
  }
  return model
}
