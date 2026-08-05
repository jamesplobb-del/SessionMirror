import type { CSSProperties } from 'react'
import type { MultitrackLayoutPreset, SheetMusicAsset } from '../types'
import { resolveMultitrackGridModel, resolveMultitrackGridModelForIds } from './layoutRects'

export function layoutGridStyle(
  preset: MultitrackLayoutPreset,
  musicAsset: SheetMusicAsset | null = null,
  /** When set, only these box ids hold a slot — the grid reflows around them. */
  visibleIds?: string[],
): CSSProperties {
  const { areas, columnWeights, rowWeights } = visibleIds
    ? resolveMultitrackGridModelForIds(preset, musicAsset, visibleIds)
    : resolveMultitrackGridModel(preset, musicAsset)

  return {
    display: 'grid',
    gridTemplateAreas: areas.map((row) => `"${row}"`).join(' '),
    gridTemplateColumns: columnWeights.map((weight) => `minmax(0, ${weight}fr)`).join(' '),
    gridTemplateRows: rowWeights.map((weight) => `minmax(0, ${weight}fr)`).join(' '),
    gap: '0.375rem',
    width: '100%',
    height: '100%',
    minHeight: 0,
  }
}

export function panelAreaStyle(panelId: string): CSSProperties {
  return { gridArea: panelId }
}
