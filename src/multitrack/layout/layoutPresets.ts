import type { MultitrackLayoutPreset, MultitrackPanelState } from '../types'

export const MULTITRACK_LAYOUT_PRESETS: MultitrackLayoutPreset[] = [
  { id: 'one', label: '1 box', panelCount: 1, areas: ['a'], columns: '1fr', rows: '1fr' },
  { id: 'two', label: '2 boxes', panelCount: 2, areas: ['a b'], columns: '1fr 1fr', rows: '1fr' },
  { id: 'three', label: '3 boxes', panelCount: 3, areas: ['a a', 'b c'], columns: '1fr 1fr', rows: '1fr 1fr' },
  { id: 'four', label: '4 boxes', panelCount: 4, areas: ['a b', 'c d'], columns: '1fr 1fr', rows: '1fr 1fr' },
  { id: 'five', label: '5 boxes', panelCount: 5, areas: ['a b c', 'd e e'], columns: '1fr 1fr 1fr', rows: '1fr 1fr' },
  { id: 'six', label: '6 boxes', panelCount: 6, areas: ['a b c', 'd e f'], columns: '1fr 1fr 1fr', rows: '1fr 1fr' },
  // Seven and eight fill their last row with wider boxes rather than leaving a
  // hole, so a big section still reads as a deliberate grid on a 9:16 canvas.
  { id: 'seven', label: '7 boxes', panelCount: 7, areas: ['a b c', 'd e f', 'g g g'], columns: '1fr 1fr 1fr', rows: '1fr 1fr 1fr' },
  { id: 'eight', label: '8 boxes', panelCount: 8, areas: ['a a b b c c', 'd d e e f f', 'g g g h h h'], columns: 'repeat(6, 1fr)', rows: '1fr 1fr 1fr' },
  { id: 'nine', label: '9 boxes', panelCount: 9, areas: ['a b c', 'd e f', 'g h i'], columns: '1fr 1fr 1fr', rows: '1fr 1fr 1fr' },
  { id: 'ten', label: '10 boxes', panelCount: 10, areas: ['a b c', 'd e f', 'g h i', 'j j j'], columns: 'repeat(3, 1fr)', rows: 'repeat(4, 1fr)' },
  { id: 'eleven', label: '11 boxes', panelCount: 11, areas: ['a a b b c c', 'd d e e f f', 'g g h h i i', 'j j j k k k'], columns: 'repeat(6, 1fr)', rows: 'repeat(4, 1fr)' },
  { id: 'twelve', label: '12 boxes', panelCount: 12, areas: ['a b c', 'd e f', 'g h i', 'j k l'], columns: 'repeat(3, 1fr)', rows: 'repeat(4, 1fr)' },
]

export function getLayoutPreset(id: string): MultitrackLayoutPreset {
  return MULTITRACK_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? MULTITRACK_LAYOUT_PRESETS[0]
}

export const MULTITRACK_PANEL_SLOT_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] as const

export function createPanelsForLayout(preset: MultitrackLayoutPreset): MultitrackPanelState[] {
  return MULTITRACK_PANEL_SLOT_IDS
    .slice(0, preset.panelCount)
    .map((id) => ({ kind: 'performance', id, take: null }))
}

/**
 * Panels for `preset`, carrying every existing box's contents across by slot id.
 * Used when the layout changes and when a new box is added mid-session — a
 * growing grid must never drop takes that are already on the canvas.
 */
export function mergePanelsIntoLayout(
  preset: MultitrackLayoutPreset,
  previousPanels: MultitrackPanelState[],
): MultitrackPanelState[] {
  const previousById = new Map(
    previousPanels
      .filter((panel) => panel.kind === 'performance')
      .map((panel) => [panel.id, panel] as const),
  )
  const ids = new Set([...createPanelsForLayout(preset).map(p => p.id), ...previousById.keys()])
  return [...ids].map((id, index) => ({
    kind: 'performance' as const, id, take: null,
    ...previousById.get(id),
    hidden: index >= preset.panelCount,
  }))
}
