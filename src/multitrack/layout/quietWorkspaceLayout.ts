import { getLayoutPreset, MULTITRACK_PANEL_SLOT_IDS } from './layoutPresets'
import type { MultitrackSession, PerformancePanelState } from '../types'

export interface MultitrackLayoutStyle { gap: number; cornerRadius: number }
export const DEFAULT_LAYOUT_STYLE: MultitrackLayoutStyle = { gap: 0, cornerRadius: 12 }
export function normalizeLayoutStyle(style?: Partial<MultitrackLayoutStyle>): MultitrackLayoutStyle {
  const bounded = (value: number | undefined, fallback: number, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, value!)) : fallback
  // Keep the legacy field for project compatibility; boxes always meet now.
  return { gap: 0, cornerRadius: bounded(style?.cornerRadius, 0, 24) }
}
/** Pure draft update: changing the visible grid never discards a take or extra box. */
export function withPortraitLayout(session: MultitrackSession, layoutId: string): MultitrackSession {
  const preset = getLayoutPreset(layoutId)
  const changingPreset = session.layoutId !== preset.id
  const base = session.panels.filter((p): p is PerformancePanelState => p.kind === 'performance' && !p.overlay)
  const extras = session.panels.filter(p => p.kind === 'performance' && p.overlay)
  const available = MULTITRACK_PANEL_SLOT_IDS.filter(id => !session.panels.some(p => p.id === id))
  while (base.length < preset.panelCount && available.length) base.push({ kind: 'performance', id: available.shift()!, take: null })
  // A moved/resized base box has an absolute frame that overrides every preset.
  // Keep it while reopening the same layout, but let a new preset place the box.
  return { ...session, aspectRatio: '9:16', layoutId: preset.id, panels: [...base.map((p, i) => ({ ...p, hidden: i >= preset.panelCount, frame: changingPreset ? undefined : p.frame })), ...extras] }
}
export function withExtraBox(session: MultitrackSession, id: string): MultitrackSession {
  if (session.panels.filter(p => p.kind === 'performance' && p.overlay).length >= 4 || session.panels.some(p => p.id === id)) return session
  return { ...session, panels: [...session.panels, { kind: 'performance', id, take: null, overlay: { xPercent: 64, yPercent: 64, widthPercent: 32, heightPercent: 28 }, sectionAudio: true }] }
}
