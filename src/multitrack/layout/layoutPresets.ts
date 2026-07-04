import type { MultitrackLayoutPreset, MultitrackPanelState } from '../types'

export const MULTITRACK_LAYOUT_PRESETS: MultitrackLayoutPreset[] = [
  { id: 'solo', label: 'Solo', panelCount: 1, areas: ['a'], columns: '1fr', rows: '1fr', defaultKinds: ['performance'] },
  { id: 'duo-h', label: 'Duo', panelCount: 2, areas: ['a b'], columns: '1fr 1fr', rows: '1fr', defaultKinds: ['performance', 'performance'] },
  { id: 'duo-v', label: 'Stack', panelCount: 2, areas: ['a', 'b'], columns: '1fr', rows: '1fr 1fr', defaultKinds: ['performance', 'sheet-music'] },
  { id: 'trio', label: 'Trio', panelCount: 3, areas: ['a a', 'b c'], columns: '1fr 1fr', rows: '1fr 1fr', defaultKinds: ['performance', 'performance', 'sheet-music'] },
  { id: 'quad', label: 'Quad', panelCount: 4, areas: ['a b', 'c d'], columns: '1fr 1fr', rows: '1fr 1fr', defaultKinds: ['performance', 'performance', 'sheet-music', 'sheet-music'] },
  { id: 'six', label: 'Six', panelCount: 6, areas: ['a b c', 'd e f'], columns: '1fr 1fr 1fr', rows: '1fr 1fr', defaultKinds: ['performance', 'performance', 'sheet-music', 'performance', 'sheet-music', 'sheet-music'] },
]

export function getLayoutPreset(id: string): MultitrackLayoutPreset {
  return MULTITRACK_LAYOUT_PRESETS.find((preset) => preset.id === id) ?? MULTITRACK_LAYOUT_PRESETS[0]
}

export function createPanelsForLayout(preset: MultitrackLayoutPreset): MultitrackPanelState[] {
  const slotIds = ['a', 'b', 'c', 'd', 'e', 'f']
  return preset.defaultKinds.map((kind, index) => {
    const id = slotIds[index]
    return kind === 'sheet-music' ? { kind: 'sheet-music', id, asset: null } : { kind: 'performance', id, take: null }
  })
}
