import type { CSSProperties } from 'react'
import type { MultitrackLayoutPreset } from '../types'

function areasWithMusic(preset: MultitrackLayoutPreset): string[] {
  if (preset.panelCount <= 1) return ['music', 'a']
  if (preset.panelCount === 2) return ['music music', 'a b']
  if (preset.panelCount === 3) return ['music music', 'a b', 'c c']
  if (preset.panelCount === 4) return ['music music', 'a b', 'c d']
  return ['music music music', 'a b c', 'd e f']
}

export function layoutGridStyle(preset: MultitrackLayoutPreset, hasMusic = false): CSSProperties {
  const areas = hasMusic ? areasWithMusic(preset) : preset.areas
  const columns = hasMusic && preset.panelCount >= 5 ? '1fr 1fr 1fr' : preset.columns
  const rows = hasMusic
    ? `minmax(9rem, 1.15fr) repeat(${areas.length - 1}, minmax(0, 1fr))`
    : preset.rows

  return {
    display: 'grid',
    gridTemplateAreas: areas.map((row) => `"${row}"`).join(' '),
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
    gap: '0.375rem',
    width: '100%',
    height: '100%',
    minHeight: 0,
  }
}

export function panelAreaStyle(panelId: string): CSSProperties {
  return { gridArea: panelId }
}
