import type { CSSProperties } from 'react'
import type { MultitrackLayoutPreset, SheetMusicAsset } from '../types'

type MusicFramePosition = NonNullable<SheetMusicAsset['framePosition']>

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

function areasWithMusic(preset: MultitrackLayoutPreset, position: MusicFramePosition): { areas: string[]; columns: string; rows: string } {
  const sideColumns = preset.panelCount <= 1 ? 1 : 2
  const rows = performanceRows(preset.panelCount, sideColumns)

  if (position === 'left' || position === 'right') {
    const musicRows = rows.map((row) => (position === 'left' ? `music ${row}` : `${row} music`))
    const columns = position === 'left'
      ? 'minmax(6.5rem, var(--music-frame-scale)) repeat(var(--music-panel-cols), minmax(0, 1fr))'
      : 'repeat(var(--music-panel-cols), minmax(0, 1fr)) minmax(6.5rem, var(--music-frame-scale))'
    return { areas: musicRows, columns, rows: `repeat(${rows.length}, minmax(0, 1fr))` }
  }

  const musicCols = preset.panelCount >= 5 ? 3 : Math.max(1, Math.min(2, preset.panelCount))
  const topBottomRows = performanceRows(preset.panelCount, musicCols)
  const musicRow = Array.from({ length: musicCols }, () => 'music').join(' ')
  const areas = position === 'bottom' ? [...topBottomRows, musicRow] : [musicRow, ...topBottomRows]
  const musicTrack = 'minmax(6.5rem, var(--music-frame-scale))'
  const panelTracks = `repeat(${topBottomRows.length}, minmax(0, 1fr))`
  return {
    areas,
    columns: `repeat(${musicCols}, minmax(0, 1fr))`,
    rows: position === 'bottom' ? `${panelTracks} ${musicTrack}` : `${musicTrack} ${panelTracks}`,
  }
}

export function layoutGridStyle(preset: MultitrackLayoutPreset, musicAsset: SheetMusicAsset | null = null): CSSProperties {
  const position = musicAsset?.framePosition ?? 'top'
  const musicFrameScale = `${clampMusicScale(musicAsset)}fr`
  const withMusic = musicAsset ? areasWithMusic(preset, position) : null
  const areas = withMusic?.areas ?? preset.areas
  const columns = withMusic?.columns ?? preset.columns
  const rows = withMusic?.rows ?? preset.rows

  return {
    display: 'grid',
    gridTemplateAreas: areas.map((row) => `"${row}"`).join(' '),
    gridTemplateColumns: columns,
    gridTemplateRows: rows,
    '--music-frame-scale': musicFrameScale,
    '--music-panel-cols': preset.panelCount <= 1 ? 1 : 2,
    gap: '0.375rem',
    width: '100%',
    height: '100%',
    minHeight: 0,
  } as CSSProperties
}

export function panelAreaStyle(panelId: string): CSSProperties {
  return { gridArea: panelId }
}
