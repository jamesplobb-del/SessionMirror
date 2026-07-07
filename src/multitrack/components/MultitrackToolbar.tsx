import { Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { formatTime } from '../../hooks/useVideoPlayback'
import Pressable from '../../components/ui/Pressable'
import { MULTITRACK_LAYOUT_PRESETS } from '../layout/layoutPresets'

/** Tiny live preview of a layout preset — a mini CSS grid of filled cells. */
function LayoutGlyph({ areas, columns, rows }: { areas: string[]; columns: string; rows: string }) {
  const cellNames = [...new Set(areas.flatMap((row) => row.trim().split(/\s+/)))].filter(
    (name) => name !== '.',
  )
  return (
    <span
      className="multitrack-layout-strip__glyph"
      style={{
        gridTemplateColumns: columns,
        gridTemplateRows: rows,
        gridTemplateAreas: areas.map((row) => `"${row}"`).join(' '),
      }}
      aria-hidden
    >
      {cellNames.map((name) => (
        <span key={name} style={{ gridArea: name }} className="multitrack-layout-strip__cell" />
      ))}
    </span>
  )
}

export default function MultitrackToolbar(props: {
  isPlaying: boolean
  currentTime: number
  duration: number
  activeLayoutId: string
  onSelectLayout: (id: string) => void
  onOpenMixer: () => void
  onTogglePlay: () => void
  onRestart: () => void
  onSeek: (t: number) => void
}) {
  const {
    isPlaying,
    currentTime,
    duration,
    activeLayoutId,
    onSelectLayout,
    onOpenMixer,
    onTogglePlay,
    onRestart,
    onSeek,
  } = props
  return (
    <footer className="multitrack-toolbar">
      <div className="multitrack-toolbar__transport">
        <Pressable type="button" intensity="soft" onClick={onRestart} className="multitrack-toolbar__btn" aria-label="Restart">
          <RotateCcw className="h-5 w-5" />
        </Pressable>
        <Pressable type="button" intensity="soft" onClick={onTogglePlay} className="multitrack-toolbar__btn multitrack-toolbar__btn--primary">
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          <span>{isPlaying ? 'Pause' : 'Play all'}</span>
        </Pressable>
        <span className="multitrack-toolbar__time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={currentTime}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="multitrack-toolbar__scrub"
        aria-label="Seek"
      />
      <div className="multitrack-toolbar__row2">
        <div className="multitrack-layout-strip" role="radiogroup" aria-label="Layout">
          {MULTITRACK_LAYOUT_PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              type="button"
              intensity="soft"
              role="radio"
              aria-checked={activeLayoutId === preset.id}
              aria-label={preset.label}
              onClick={() => onSelectLayout(preset.id)}
              className={`multitrack-layout-strip__item ${
                activeLayoutId === preset.id ? 'multitrack-layout-strip__item--active' : ''
              }`}
            >
              <LayoutGlyph areas={preset.areas} columns={preset.columns} rows={preset.rows} />
            </Pressable>
          ))}
        </div>
        <Pressable type="button" intensity="soft" onClick={onOpenMixer} className="multitrack-toolbar__chip" aria-label="Mixer">
          <SlidersHorizontal className="h-4 w-4" />
          Mixer
        </Pressable>
      </div>
    </footer>
  )
}
