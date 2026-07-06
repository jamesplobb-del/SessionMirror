import type { MultitrackLayoutPreset, SheetMusicAsset } from '../types'

// Numeric twin of layoutGrid.ts's CSS grid math (areasWithMusic/performanceRows/
// clampMusicScale) — duplicated rather than shared so refactoring this export-only
// path can never regress the on-screen CSS layout. Keep in sync with layoutGrid.ts.

const PANEL_IDS = ['a', 'b', 'c', 'd', 'e', 'f']

function clampMusicScale(asset: SheetMusicAsset | null): number {
  return Math.min(1.8, Math.max(0.65, asset?.frameScale ?? 1))
}

function performanceRows(panelCount: number, columns: number): string[] {
  return Array.from({ length: Math.ceil(panelCount / columns) }, (_, rowIndex) => {
    const ids = PANEL_IDS.slice(rowIndex * columns, rowIndex * columns + columns)
    while (ids.length < columns) ids.push(ids[ids.length - 1] ?? 'a')
    return ids.join(' ')
  })
}

interface GridModel {
  areas: string[]
  columnWeights: number[]
  rowWeights: number[]
}

function resolveGridModel(preset: MultitrackLayoutPreset, musicAsset: SheetMusicAsset | null): GridModel {
  if (!musicAsset) {
    return {
      areas: preset.areas,
      columnWeights: Array(preset.areas[0].trim().split(/\s+/).length).fill(1),
      rowWeights: Array(preset.areas.length).fill(1),
    }
  }

  const position = musicAsset.framePosition ?? 'top'
  const musicScale = clampMusicScale(musicAsset)

  if (position === 'left' || position === 'right') {
    const sideColumns = preset.panelCount <= 1 ? 1 : 2
    const rows = performanceRows(preset.panelCount, sideColumns)
    const areas = rows.map((row) => (position === 'left' ? `music ${row}` : `${row} music`))
    const panelWeights = Array(sideColumns).fill(1)
    return {
      areas,
      columnWeights: position === 'left' ? [musicScale, ...panelWeights] : [...panelWeights, musicScale],
      rowWeights: Array(rows.length).fill(1),
    }
  }

  const musicCols = preset.panelCount >= 5 ? 3 : Math.max(1, Math.min(2, preset.panelCount))
  const topBottomRows = performanceRows(preset.panelCount, musicCols)
  const musicRow = Array.from({ length: musicCols }, () => 'music').join(' ')
  const areas = position === 'bottom' ? [...topBottomRows, musicRow] : [musicRow, ...topBottomRows]
  const panelRowWeights = Array(topBottomRows.length).fill(1)

  return {
    areas,
    columnWeights: Array(musicCols).fill(1),
    rowWeights: position === 'bottom' ? [...panelRowWeights, musicScale] : [musicScale, ...panelRowWeights],
  }
}

/** Cumulative percent boundaries for a set of fr-style weights, e.g. [1,1] -> [0,50,100]. */
function cumulativePercents(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const bounds = [0]
  let running = 0
  for (const weight of weights) {
    running += weight
    bounds.push((running / total) * 100)
  }
  return bounds
}

export interface LayoutRectPercent {
  xPercent: number
  yPercent: number
  widthPercent: number
  heightPercent: number
}

/**
 * Numeric equivalent of layoutGridStyle(preset, musicAsset)'s CSS grid — returns
 * each panel id's (and the sheet-music panel's, if present) bounding rect as a
 * percentage of the overall canvas, for native multitrack export compositing.
 */
export function computeMultitrackLayoutRects(
  preset: MultitrackLayoutPreset,
  musicAsset: SheetMusicAsset | null,
): { panelRects: Record<string, LayoutRectPercent>; musicRect: LayoutRectPercent | null } {
  const { areas, columnWeights, rowWeights } = resolveGridModel(preset, musicAsset)
  const colBounds = cumulativePercents(columnWeights)
  const rowBounds = cumulativePercents(rowWeights)
  const cells = areas.map((row) => row.trim().split(/\s+/))

  const spans = new Map<string, { minRow: number; maxRow: number; minCol: number; maxCol: number }>()
  cells.forEach((row, rowIndex) => {
    row.forEach((name, colIndex) => {
      if (name === '.') return
      const existing = spans.get(name)
      if (!existing) {
        spans.set(name, { minRow: rowIndex, maxRow: rowIndex, minCol: colIndex, maxCol: colIndex })
        return
      }
      existing.minRow = Math.min(existing.minRow, rowIndex)
      existing.maxRow = Math.max(existing.maxRow, rowIndex)
      existing.minCol = Math.min(existing.minCol, colIndex)
      existing.maxCol = Math.max(existing.maxCol, colIndex)
    })
  })

  const panelRects: Record<string, LayoutRectPercent> = {}
  let musicRect: LayoutRectPercent | null = null

  for (const [name, span] of spans) {
    const rect: LayoutRectPercent = {
      xPercent: colBounds[span.minCol],
      yPercent: rowBounds[span.minRow],
      widthPercent: colBounds[span.maxCol + 1] - colBounds[span.minCol],
      heightPercent: rowBounds[span.maxRow + 1] - rowBounds[span.minRow],
    }
    if (name === 'music') {
      musicRect = rect
    } else {
      panelRects[name] = rect
    }
  }

  return { panelRects, musicRect }
}
