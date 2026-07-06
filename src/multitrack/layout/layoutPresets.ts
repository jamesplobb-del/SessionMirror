import type { MultitrackLayoutPreset, MultitrackPanelState } from '../types'

export const MULTITRACK_LAYOUT_PRESETS: MultitrackLayoutPreset[] = [
  { id: 'one', label: '1 box', panelCount: 1, areas: ['a'], columns: '1fr', rows: '1fr' },
  { id: 'two', label: '2 boxes', panelCount: 2, areas: ['a b'], columns: '1fr 1fr', rows: '1fr' },
  { id: 'three', label: '3 boxes', panelCount: 3, areas: ['a a', 'b c'], columns: '1fr 1fr', rows: '1fr 1fr' },
  { id: 'four', label: '4 boxes', panelCount: 4, areas: ['a b', 'c d'], columns: '1fr 1fr', rows: '1fr 1fr' },
  { id: 'five', label: '5 boxes', panelCount: 5, areas: ['a b c', 'd e .'], columns: '1fr 1fr 1fr', rows: '1fr 1fr' },
  { id: 'six', label: '6 boxes', panelCount: 6, areas: ['a b c', 'd e f'], columns: '1fr 1fr 1fr', rows: '1fr 1fr' },
]

export function getLayoutPreset(id: string): MultitrackLayoutPreset {
  return MULTITRACK_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? MULTITRACK_LAYOUT_PRESETS[0]
}

export function createPanelsForLayout(preset: MultitrackLayoutPreset): MultitrackPanelState[] {
  const slotIds = ['a', 'b', 'c', 'd', 'e', 'f']
  return slotIds
    .slice(0, preset.panelCount)
    .map((id) => ({ kind: 'performance', id, take: null }))
}
