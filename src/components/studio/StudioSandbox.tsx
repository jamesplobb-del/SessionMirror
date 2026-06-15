import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Download, Music2, Play, SkipBack, Square } from 'lucide-react'
import Pressable from '../ui/Pressable'

// ─── Layout constant ──────────────────────────────────────────────────────────
// Percentage of each track row occupied by the left control panel.
const TRACK_HEADER_PCT = 36

// ─── Track definitions ────────────────────────────────────────────────────────
interface TrackDef {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly initialHasContent: boolean
}

const TRACKS: TrackDef[] = [
  { id: 'track-1', label: 'Track 1', color: '#38bdf8', initialHasContent: true },
  { id: 'track-2', label: 'Track 2', color: '#c084fc', initialHasContent: true },
  { id: 'track-3', label: 'Track 3', color: '#34d399', initialHasContent: false },
  { id: 'track-4', label: 'Track 4', color: '#fb923c', initialHasContent: false },
]

// ─── Pre-computed waveform data ───────────────────────────────────────────────
function makeWaveBars(seedA: number, seedB: number, count = 72): readonly number[] {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.sin(i * 0.29 + seedA) * 0.38
    const b = Math.sin(i * 0.18 + seedB * 1.4) * 0.28
    const c = Math.sin(i * 0.44 + seedA * 0.6) * 0.16
    const envelope = Math.pow(Math.sin((i / count) * Math.PI), 0.35)
    return Math.max(0.04, Math.min(0.95, (a + b + c + 0.58) * envelope))
  })
}

const WAVE_DATA: readonly (readonly number[])[] = [
  makeWaveBars(1.72, 3.14),
  makeWaveBars(4.20, 0.89),
  makeWaveBars(2.77, 5.11),
  makeWaveBars(0.33, 1.99),
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  const cs = Math.floor((secs % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

// ─── Waveform SVG ─────────────────────────────────────────────────────────────
function WaveformBars({
  bars,
  color,
  dimmed,
}: {
  bars: readonly number[]
  color: string
  dimmed: boolean
}) {
  const barCount = bars.length
  return (
    <svg
      viewBox={`0 0 ${barCount} 1`}
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i + 0.1}
          y={(1 - h) / 2}
          width={0.65}
          height={h}
          fill={color}
          opacity={dimmed ? 0.35 : 0.82}
          rx={0.12}
        />
      ))}
    </svg>
  )
}

// ─── Track Row ────────────────────────────────────────────────────────────────
interface TrackRowProps {
  idx: number
  label: string
  color: string
  waveData: readonly number[]
  hasContent: boolean
  isArmed: boolean
  isMuted: boolean
  isSolo: boolean
  volume: number
  trimStart: number // 0–100
  trimEnd: number // 0–100
  isPlaying: boolean
  onArmToggle: () => void
  onMuteToggle: () => void
  onSoloToggle: () => void
  onVolumeChange: (v: number) => void
  onTrimChange: (start: number, end: number) => void
}

function TrackRow({
  idx,
  label,
  color,
  waveData,
  hasContent,
  isArmed,
  isMuted,
  isSolo,
  volume,
  trimStart,
  trimEnd,
  isPlaying,
  onArmToggle,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onTrimChange,
}: TrackRowProps) {
  const MIN_TRIM_GAP = 3 // minimum % between handles

  // ── Pointer drag for trim handles ─────────────────────────────────────────
  // Each handle div calls parentElement.getBoundingClientRect() to measure
  // the timeline container — no extra refs needed.

  const makeHandlePointerDown = (side: 'start' | 'end') => (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const makeHandlePointerMove = (side: 'start' | 'end') => (
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const rect = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    if (side === 'start') {
      onTrimChange(Math.min(pct, trimEnd - MIN_TRIM_GAP), trimEnd)
    } else {
      onTrimChange(trimStart, Math.max(pct, trimStart + MIN_TRIM_GAP))
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const isLastTrack = idx === TRACKS.length - 1

  return (
    <div
      className={`flex min-h-0 flex-1 ${!isLastTrack ? 'border-b border-slate-800/70' : ''}`}
    >
      {/* ── Left control panel ──────────────────────────────────────────── */}
      <div
        className="relative flex shrink-0 flex-col gap-2 border-r border-slate-800/70 bg-slate-900/55 px-2.5 py-2"
        style={{ width: `${TRACK_HEADER_PCT}%` }}
      >
        {/* Accent stripe */}
        <div
          className="absolute inset-y-0 left-0 w-0.5 rounded-r"
          style={{ background: color }}
          aria-hidden
        />

        {/* Label + R M S */}
        <div className="flex items-center justify-between gap-1">
          <p
            className="truncate text-[11px] font-bold tracking-wide"
            style={{ color }}
          >
            {label}
          </p>
          <div className="flex gap-0.5">
            {/* R — Record Arm */}
            <button
              type="button"
              aria-label="Record arm"
              onClick={onArmToggle}
              className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded text-[9px] font-bold transition-all active:scale-90 ${
                isArmed
                  ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.75)]'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              R
            </button>
            {/* M — Mute */}
            <button
              type="button"
              aria-label="Mute"
              onClick={onMuteToggle}
              className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded text-[9px] font-bold transition-all active:scale-90 ${
                isMuted
                  ? 'bg-amber-400 text-slate-900 shadow-[0_0_8px_rgba(251,191,36,0.65)]'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              M
            </button>
            {/* S — Solo */}
            <button
              type="button"
              aria-label="Solo"
              onClick={onSoloToggle}
              className={`flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded text-[9px] font-bold transition-all active:scale-90 ${
                isSolo
                  ? 'bg-green-400 text-slate-900 shadow-[0_0_8px_rgba(74,222,128,0.65)]'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              S
            </button>
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[8px] font-semibold tracking-widest text-slate-600">
            VOL
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            aria-label="Track volume"
            className="studio-vol-slider min-w-0 flex-1"
          />
        </div>
      </div>

      {/* ── Right timeline panel ─────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden bg-slate-900/25">
        {hasContent ? (
          <>
            {/* Waveform bars */}
            <WaveformBars bars={waveData} color={color} dimmed={isMuted} />

            {/* Trim overlays — dark blocks outside the active region */}
            {trimStart > 0 && (
              <div
                className="pointer-events-none absolute inset-y-0 left-0 z-[2] bg-slate-950/72"
                style={{ width: `${trimStart}%` }}
              />
            )}
            {trimEnd < 100 && (
              <div
                className="pointer-events-none absolute inset-y-0 right-0 z-[2] bg-slate-950/72"
                style={{ width: `${100 - trimEnd}%` }}
              />
            )}

            {/* Active selection border */}
            <div
              className="pointer-events-none absolute inset-y-[10%] z-[3]"
              style={{
                left: `${trimStart}%`,
                width: `${trimEnd - trimStart}%`,
                borderLeft: '1.5px solid rgba(255,255,255,0.5)',
                borderRight: '1.5px solid rgba(255,255,255,0.5)',
              }}
              aria-hidden
            />

            {/* Left trim handle */}
            <div
              role="slider"
              aria-label="Trim start"
              className="absolute inset-y-0 z-[4] flex w-4 cursor-ew-resize touch-none select-none items-center justify-center"
              style={{ left: `calc(${trimStart}% - 8px)` }}
              onPointerDown={makeHandlePointerDown('start')}
              onPointerMove={makeHandlePointerMove('start')}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div className="h-[45%] w-[3px] rounded-full bg-white/80 shadow-[0_0_5px_rgba(255,255,255,0.45)]" />
            </div>

            {/* Right trim handle */}
            <div
              role="slider"
              aria-label="Trim end"
              className="absolute inset-y-0 z-[4] flex w-4 cursor-ew-resize touch-none select-none items-center justify-center"
              style={{ left: `calc(${trimEnd}% - 8px)` }}
              onPointerDown={makeHandlePointerDown('end')}
              onPointerMove={makeHandlePointerMove('end')}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div className="h-[45%] w-[3px] rounded-full bg-white/80 shadow-[0_0_5px_rgba(255,255,255,0.45)]" />
            </div>

            {/* Playing indicator glow */}
            {isPlaying && (
              <div
                className="pointer-events-none absolute inset-0 z-[1] animate-pulse"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${color}14 50%, transparent 100%)`,
                }}
                aria-hidden
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center gap-1.5">
            <div
              className="h-[2px] w-3 rounded-full"
              style={{ background: `${color}55` }}
              aria-hidden
            />
            <p className="text-[10px] font-medium text-slate-700">Arm to Record</p>
            <div
              className="h-[2px] w-3 rounded-full"
              style={{ background: `${color}55` }}
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StudioSandbox ────────────────────────────────────────────────────────────
interface StudioSandboxProps {
  onExit: () => void
}

const MOCK_DURATION_SEC = 10 // visual demo playback length

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  // ── Per-track UI state ────────────────────────────────────────────────────
  const [armedId, setArmedId] = useState<string | null>(null)
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set())
  const [soloedIds, setSoloedIds] = useState<Set<string>>(new Set())
  const [volumes, setVolumes] = useState<Record<string, number>>(
    Object.fromEntries(TRACKS.map((t, i) => [t.id, i < 2 ? 0.8 : 0.9])),
  )
  const [trims, setTrims] = useState<Record<string, [number, number]>>(() => {
    const initial: Record<string, [number, number]> = {}
    TRACKS.forEach((t, i) => {
      initial[t.id] = t.initialHasContent
        ? [i === 0 ? 7 : 4, i === 0 ? 91 : 88]
        : [0, 100]
    })
    return initial
  })

  // ── Transport state ───────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [playheadPct, setPlayheadPct] = useState(0)

  // Keep elapsed in a ref so the rAF loop doesn't recreate on each tick
  const elapsedRef = useRef(elapsed)
  elapsedRef.current = elapsed

  // ── rAF playback loop (visual only) ──────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) return

    const wallStart = performance.now() - elapsedRef.current * 1000
    let rafId = 0

    const tick = () => {
      const secs = Math.min(MOCK_DURATION_SEC, (performance.now() - wallStart) / 1000)
      setElapsed(secs)
      setPlayheadPct((secs / MOCK_DURATION_SEC) * 100)
      if (secs >= MOCK_DURATION_SEC) {
        setIsPlaying(false)
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Transport handlers ────────────────────────────────────────────────────
  const handleRewind = useCallback(() => {
    setIsPlaying(false)
    setElapsed(0)
    setPlayheadPct(0)
  }, [])

  const handlePlay = useCallback(() => {
    if (playheadPct >= 100) {
      setElapsed(0)
      setPlayheadPct(0)
    }
    setIsPlaying(true)
  }, [playheadPct])

  const handleStop = useCallback(() => {
    setIsPlaying(false)
  }, [])

  // ── Track state toggles ───────────────────────────────────────────────────
  const toggleArmed = useCallback((id: string) => {
    setArmedId((prev) => (prev === id ? null : id))
  }, [])

  const toggleMuted = useCallback((id: string) => {
    setMutedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSoloed = useCallback((id: string) => {
    setSoloedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setVolume = useCallback((id: string, v: number) => {
    setVolumes((prev) => ({ ...prev, [id]: v }))
  }, [])

  const setTrim = useCallback((id: string, start: number, end: number) => {
    setTrims((prev) => ({ ...prev, [id]: [start, end] }))
  }, [])

  // ── Playhead pixel position ────────────────────────────────────────────────
  // Spans only the timeline (right) panels: starts at TRACK_HEADER_PCT% from the
  // left edge of the track grid and advances across the remaining width.
  const playheadLeftPct =
    TRACK_HEADER_PCT + ((100 - TRACK_HEADER_PCT) * playheadPct) / 100

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800/70 bg-slate-900/80 px-4 py-2.5">
        <Pressable
          type="button"
          intensity="soft"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 active:scale-95"
          aria-label="Exit Studio Mode"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Standard
        </Pressable>

        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-sky-400" aria-hidden />
          <div>
            <h1 className="text-[13px] font-bold tracking-tight">Studio Sandbox</h1>
            <p className="text-[9px] text-slate-600">4-track overdub · multi-track practice</p>
          </div>
        </div>

        {/* BPM pill */}
        <div className="flex items-end gap-0.5 rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 py-1">
          <span className="font-mono text-sm font-bold text-slate-200">120</span>
          <span className="mb-px text-[8px] font-semibold text-slate-600">BPM</span>
        </div>
      </header>

      {/* ── 4-Track Grid ────────────────────────────────────────────────── */}
      <main className="relative flex min-h-0 flex-1 flex-col py-1">
        {TRACKS.map((track, idx) => {
          const trim = trims[track.id] ?? [0, 100]
          return (
            <TrackRow
              key={track.id}
              idx={idx}
              label={track.label}
              color={track.color}
              waveData={WAVE_DATA[idx] ?? []}
              hasContent={track.initialHasContent}
              isArmed={armedId === track.id}
              isMuted={mutedIds.has(track.id)}
              isSolo={soloedIds.has(track.id)}
              volume={volumes[track.id] ?? 1}
              trimStart={trim[0]}
              trimEnd={trim[1]}
              isPlaying={isPlaying}
              onArmToggle={() => toggleArmed(track.id)}
              onMuteToggle={() => toggleMuted(track.id)}
              onSoloToggle={() => toggleSoloed(track.id)}
              onVolumeChange={(v) => setVolume(track.id, v)}
              onTrimChange={(s, e) => setTrim(track.id, s, e)}
            />
          )
        })}

        {/* ── Playhead — one vertical red line through all timeline panels ── */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-30 w-px"
          style={{
            left: `${playheadLeftPct}%`,
            background: 'rgba(239, 68, 68, 0.9)',
            boxShadow: '0 0 6px 1px rgba(239, 68, 68, 0.55), 0 0 2px rgba(239,68,68,0.9)',
          }}
          aria-hidden
        />
      </main>

      {/* ── Transport Bar ────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 border-t border-slate-800/70 bg-slate-900/92 backdrop-blur-md"
        style={{
          paddingBottom: 'max(0.9rem, env(safe-area-inset-bottom))',
          paddingTop: '0.75rem',
          paddingInline: '1rem',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: transport buttons */}
          <div className="flex items-center gap-1.5">
            {/* Rewind */}
            <button
              type="button"
              aria-label="Rewind to start"
              onClick={handleRewind}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 transition-all active:scale-90 hover:bg-slate-700"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            {/* Play */}
            <button
              type="button"
              aria-label="Play"
              onClick={handlePlay}
              disabled={isPlaying}
              className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all active:scale-90 ${
                isPlaying
                  ? 'border-green-500/50 bg-green-500/20 shadow-[0_0_14px_rgba(74,222,128,0.4)] cursor-default'
                  : 'border-slate-600 bg-slate-700 hover:bg-slate-600'
              }`}
            >
              <Play
                className={`h-5 w-5 ${isPlaying ? 'text-green-300' : 'text-slate-100'}`}
                fill={isPlaying ? 'currentColor' : 'none'}
              />
            </button>

            {/* Stop */}
            <button
              type="button"
              aria-label="Stop"
              onClick={handleStop}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-300 transition-all active:scale-90 hover:bg-slate-700"
            >
              <Square className="h-4 w-4" fill="currentColor" />
            </button>
          </div>

          {/* Center: LCD timer */}
          <div className="flex flex-col items-center rounded-xl border border-slate-700/60 bg-slate-950 px-3.5 py-1.5">
            <span
              className="font-mono text-xl font-bold tracking-widest tabular-nums text-green-400"
              style={{ textShadow: '0 0 12px rgba(74, 222, 128, 0.6)' }}
            >
              {formatTimer(elapsed)}
            </span>
            <span className="text-[7px] font-semibold uppercase tracking-[0.2em] text-slate-700">
              Position
            </span>
          </div>

          {/* Right: Mixdown */}
          <button
            type="button"
            aria-label="Mixdown and save to vault"
            className="flex h-10 items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-500/14 px-3.5 text-[11px] font-bold text-sky-200 transition-all active:scale-95 hover:bg-sky-500/22"
          >
            <Download className="h-3.5 w-3.5" />
            Mix &amp; Save
          </button>
        </div>
      </footer>
    </div>
  )
}
