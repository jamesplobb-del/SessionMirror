import type { CSSProperties } from 'react'
import type { MultitrackLayoutPreset } from '../types'

export function layoutGridStyle(preset: MultitrackLayoutPreset): CSSProperties {
  return {
    display: 'grid',
    gridTemplateAreas: preset.areas.map((row) => `"${row}"`).join(' '),
    gridTemplateColumns: preset.columns,
    gridTemplateRows: preset.rows,
    gap: '0.375rem',
    width: '100%',
    height: '100%',
    minHeight: 0,
  }
}

export function panelAreaStyle(panelId: string): CSSProperties {
  return { gridArea: panelId }
}
