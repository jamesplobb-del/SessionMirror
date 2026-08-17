import { MULTITRACK_LAYOUT_PRESETS, MULTITRACK_PANEL_SLOT_IDS } from './layoutPresets'
import type { MultitrackLayoutPreset, SheetMusicAsset } from '../types'

const PANEL_IDS: readonly string[] = MULTITRACK_PANEL_SLOT_IDS

function clampMusicScale(asset: SheetMusicAsset | null): number {
  return Math.min(1.8, Math.max(0.65, asset?.frameScale ?? 1))
}

/** Boxes beside a vertical music panel; wider grids need a third column so nine
    boxes don't become five stacked rows of slivers. */
function sideColumnsFor(panelCount: number): number {
  if (panelCount <= 1) return 1
  return panelCount <= 6 ? 2 : 3
}

function performanceRows(panelCount: number, columns: number): string[] {
  // Only slots this preset actually has may appear. Slicing the full id list
  // would name boxes that do not exist and leave holes in the grid.
  const slots = PANEL_IDS.slice(0, panelCount)
  return Array.from({ length: Math.ceil(panelCount / columns) }, (_, rowIndex) => {
    const ids = slots.slice(rowIndex * columns, rowIndex * columns + columns)
    // A short final row stretches its last box across the remainder.
    while (ids.length < columns) ids.push(ids[ids.length - 1] ?? 'a')
    return ids.join(' ')
  })
}

export interface MultitrackGridModel {
  areas: string[]
  columnWeights: number[]
  rowWeights: number[]
}

/**
 * One grid model drives both the CSS preview and the native renderer. Keeping
 * the area map and fr weights here prevents sheet-music placement from subtly
 * changing between the editor and the exported movie.
 */
export function resolveMultitrackGridModel(
  preset: MultitrackLayoutPreset,
  musicAsset: SheetMusicAsset | null,
): MultitrackGridModel {
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
    const sideColumns = sideColumnsFor(preset.panelCount)
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

/**
 * Grid model covering only `visibleIds` — used when boxes carry a section window
 * and drop in and out mid-song. The preset whose panelCount matches the visible
 * count supplies the arrangement, then its slot letters are remapped onto the
 * ids that are actually showing, so three visible boxes lay out exactly like the
 * stock 3-box preset regardless of which slots they came from.
 */
export function resolveMultitrackGridModelForIds(
  preset: MultitrackLayoutPreset,
  musicAsset: SheetMusicAsset | null,
  visibleIds: string[],
): MultitrackGridModel {
  if (visibleIds.length === 0 || visibleIds.length === preset.panelCount) {
    // Same set of boxes as the preset — no remap needed, keep their own slots.
    const identity = visibleIds.every((id, index) => id === PANEL_IDS[index])
    if (visibleIds.length === 0 || identity) return resolveMultitrackGridModel(preset, musicAsset)
  }

  const effectivePreset =
    MULTITRACK_LAYOUT_PRESETS.find((candidate) => candidate.panelCount === visibleIds.length) ?? preset
  const model = resolveMultitrackGridModel(effectivePreset, musicAsset)
  const slotToId = new Map(
    PANEL_IDS.slice(0, visibleIds.length).map((slot, index) => [slot, visibleIds[index]] as const),
  )

  return {
    ...model,
    areas: model.areas.map((row) =>
      row
        .trim()
        .split(/\s+/)
        .map((token) => slotToId.get(token) ?? token)
        .join(' '),
    ),
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
  const { areas, columnWeights, rowWeights } = resolveMultitrackGridModel(preset, musicAsset)
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
