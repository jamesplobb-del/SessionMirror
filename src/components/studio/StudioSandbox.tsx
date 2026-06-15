import { useCallback, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Mic,
  MicOff,
  Layers,
  Play,
  Square,
  User,
} from 'lucide-react'
import Pressable from '../ui/Pressable'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CellState {
  isArmed: boolean
  isMuted: boolean
}

interface AudioTrack {
  id: string
  label: string
  color: string
  volume: number
  // Trim positions as % of total timeline width
  trimStart: number
  trimEnd: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL_LABELS = ['Track 1', 'Track 2', 'Track 3', 'Track 4'] as const

const AUDIO_TRACKS: AudioTrack[] = [
  { id: 'a1', label: 'Track 1', color: '#38bdf8', volume: 80, trimStart: 8,  trimEnd: 88 },
  { id: 'a2', label: 'Track 2', color: '#c084fc', volume: 75, trimStart: 5,  trimEnd: 92 },
  { id: 'a3', label: 'Track 3', color: '#34d399', volume: 90, trimStart: 12, trimEnd: 85 },
  { id: 'a4', label: 'Track 4', color: '#fb923c', volume: 70, trimStart: 3,  trimEnd: 90 },
]

// Deterministic fake waveform peaks per track
function makePeaks(seed: number, count = 60): number[] {
  return Array.from({ length: count }, (_, i) => {
    const v =
      Math.abs(Math.sin(i * 0.31 + seed) * 0.42 +
        Math.sin(i * 0.17 + seed * 1.7) * 0.31 +
        Math.sin(i * 0.53 + seed * 0.4) * 0.18 +
        0.12)
    return Math.min(0.95, v)
  })
}

const PEAKS = [makePeaks(1.2), makePeaks(3.8), makePeaks(2.1), makePeaks(5.5)]

// ─── Camera Cell ─────────────────────────────────────────────────────────────

interface CameraCellProps {
  index: number
  label: string
  isArmed: boolean
  isMuted: boolean
  onArmToggle: () => void
  onMuteToggle: () => void
}

function CameraCell({
  index,
  label,
  isArmed,
  isMuted,
  onArmToggle,
  onMuteToggle,
}: CameraCellProps) {
  // Subtle per-cell tint so the grid feels alive even without real video
  const TINTS = ['#0f172a', '#0d1424', '#0a1628', '#0c1220']
  const tint = TINTS[index % TINTS.length]

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-2xl border border-white/8"
      style={{ background: tint }}
    >
      {/* Placeholder person icon */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-20">
        <User className="h-10 w-10 text-white" strokeWidth={1.2} />
        <span className="text-[10px] font-semibold tracking-widest text-white uppercase">
          {label}
        </span>
      </div>

      {/* Top-left overlay controls */}
      <div className="absolute left-2 top-2 flex gap-1.5">
        {/* Record arm */}
        <button
          type="button"
          aria-label={isArmed ? 'Disarm recording' : 'Arm for recording'}
          onClick={onArmToggle}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all active:scale-90 ${
            isArmed
              ? 'border-red-400/60 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
              : 'border-white/20 bg-black/40 backdrop-blur-sm'
          }`}
        >
          {/* Solid red dot when armed, hollow ring when not */}
          <div
            className={`rounded-full transition-all ${
              isArmed ? 'h-2.5 w-2.5 bg-white' : 'h-2.5 w-2.5 border-2 border-white/60'
            }`}
          />
        </button>

        {/* Mute */}
        <button
          type="button"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          onClick={onMuteToggle}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all active:scale-90 ${
            isMuted
              ? 'border-amber-400/60 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
              : 'border-white/20 bg-black/40 backdrop-blur-sm'
          }`}
        >
          {isMuted ? (
            <MicOff className="h-3.5 w-3.5 text-white" />
          ) : (
            <Mic className="h-3.5 w-3.5 text-white/70" />
          )}
        </button>
      </div>

      {/* Bottom-right track label chip */}
      <div className="absolute bottom-2 right-2">
        <span className="rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white/50 uppercase backdrop-blur-sm">
          {label}
        </span>
      </div>
    </div>
  )
}

// ─── Mini waveform for the drawer ─────────────────────────────────────────────

function MiniWaveform({
  peaks,
  color,
  trimStart,
  trimEnd,
}: {
  peaks: number[]
  color: string
  trimStart: number
  trimEnd: number
}) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded">
      {/* Bars */}
      <svg
        viewBox={`0 0 ${peaks.length} 1`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {peaks.map((h, i) => (
          <rect
            key={i}
            x={i + 0.1}
            y={(1 - h) / 2}
            width={0.72}
            height={h}
            fill={color}
            opacity={0.75}
            rx={0.1}
          />
        ))}
      </svg>

      {/* Dark overlay outside trim zone */}
      {trimStart > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/65"
          style={{ width: `${trimStart}%` }}
        />
      )}
      {trimEnd < 100 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/65"
          style={{ width: `${100 - trimEnd}%` }}
        />
      )}

      {/* Trim handle bars */}
      <div
        className="pointer-events-none absolute inset-y-[15%] w-[2px] rounded-full bg-white/70"
        style={{ left: `${trimStart}%` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-[15%] w-[2px] rounded-full bg-white/70"
        style={{ left: `${trimEnd}%` }}
        aria-hidden
      />
    </div>
  )
}

// ─── Audio Drawer ─────────────────────────────────────────────────────────────

interface DrawerTrackState {
  volume: number
}

interface AudioDrawerProps {
  onClose: () => void
}

function AudioDrawer({ onClose }: AudioDrawerProps) {
  const [trackState, setTrackState] = useState<Record<string, DrawerTrackState>>(() =>
    Object.fromEntries(AUDIO_TRACKS.map((t) => [t.id, { volume: t.volume }])),
  )

  const setVolume = (id: string, v: number) =>
    setTrackState((prev) => ({ ...prev, [id]: { ...prev[id], volume: v } }))

  return (
    <>
      {/* Scrim */}
      <div
        className="absolute inset-0 z-30 bg-black/55"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[72%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-900/98 shadow-2xl backdrop-blur-xl">
        {/* Handle pill */}
        <div className="flex shrink-0 flex-col items-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-white/50" />
            <h2 className="text-[13px] font-bold tracking-tight">Audio Mixer</h2>
          </div>
          <button
            type="button"
            aria-label="Close mixer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 transition active:scale-90 hover:bg-white/15"
          >
            <ChevronDown className="h-4 w-4 text-white/70" />
          </button>
        </div>

        {/* Track rows */}
        <div className="flex-1 overflow-y-auto">
          {AUDIO_TRACKS.map((track, idx) => {
            const state = trackState[track.id]
            const vol = state?.volume ?? 80
            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < AUDIO_TRACKS.length - 1 ? 'border-b border-white/6' : ''
                }`}
              >
                {/* Color dot + label */}
                <div className="flex w-16 shrink-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ background: track.color }}
                      aria-hidden
                    />
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: track.color }}
                    >
                      {track.label}
                    </span>
                  </div>
                  <span className="text-[9px] text-white/30 tabular-nums">
                    {vol}%
                  </span>
                </div>

                {/* Volume slider */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vol}
                  onChange={(e) => setVolume(track.id, Number(e.target.value))}
                  aria-label={`${track.label} volume`}
                  className="studio-vol-slider w-20 shrink-0"
                  style={
                    { '--track-color': track.color } as React.CSSProperties
                  }
                />

                {/* Mini waveform + timeline */}
                <div className="min-w-0 flex-1 rounded-lg border border-white/8 bg-black/30 overflow-hidden" style={{ height: 36 }}>
                  <MiniWaveform
                    peaks={PEAKS[idx] ?? []}
                    color={track.color}
                    trimStart={track.trimStart}
                    trimEnd={track.trimEnd}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer spacer for safe-area */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>
  )
}

// ─── StudioSandbox ────────────────────────────────────────────────────────────

interface StudioSandboxProps {
  onExit: () => void
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const [cells, setCells] = useState<CellState[]>(() =>
    CELL_LABELS.map(() => ({ isArmed: false, isMuted: false })),
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [mixerOpen, setMixerOpen] = useState(false)

  const toggleArmed = useCallback((i: number) => {
    setCells((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, isArmed: !c.isArmed } : c)),
    )
  }, [])

  const toggleMuted = useCallback((i: number) => {
    setCells((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, isMuted: !c.isMuted } : c)),
    )
  }, [])

  const handlePlayStop = useCallback(() => {
    setIsPlaying((p) => !p)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between px-4 py-2.5">
        <Pressable
          intensity="soft"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 backdrop-blur-sm active:scale-95"
          aria-label="Exit Studio"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </Pressable>

        <div className="flex flex-col items-center">
          <h1 className="text-[13px] font-bold tracking-tight">Studio</h1>
          <p className="text-[9px] font-medium text-white/35 tracking-widest uppercase">
            Sandbox
          </p>
        </div>

        {/* Recording status dot */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5">
          <div
            className={`h-2 w-2 rounded-full transition-all ${
              isPlaying
                ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse'
                : 'bg-white/20'
            }`}
            aria-hidden
          />
          <span className="text-[9px] font-semibold text-white/40 uppercase tracking-wider">
            {isPlaying ? 'Live' : 'Ready'}
          </span>
        </div>
      </header>

      {/* ── 2×2 Camera Grid ──────────────────────────────────────────────── */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-2 p-2">
        {/* Row 1 */}
        <div className="flex min-h-0 flex-1 gap-2">
          {[0, 1].map((i) => (
            <CameraCell
              key={i}
              index={i}
              label={CELL_LABELS[i]}
              isArmed={cells[i]?.isArmed ?? false}
              isMuted={cells[i]?.isMuted ?? false}
              onArmToggle={() => toggleArmed(i)}
              onMuteToggle={() => toggleMuted(i)}
            />
          ))}
        </div>
        {/* Row 2 */}
        <div className="flex min-h-0 flex-1 gap-2">
          {[2, 3].map((i) => (
            <CameraCell
              key={i}
              index={i}
              label={CELL_LABELS[i]}
              isArmed={cells[i]?.isArmed ?? false}
              isMuted={cells[i]?.isMuted ?? false}
              onArmToggle={() => toggleArmed(i)}
              onMuteToggle={() => toggleMuted(i)}
            />
          ))}
        </div>

        {/* Audio Mixer drawer (slides up over the grid) */}
        {mixerOpen && <AudioDrawer onClose={() => setMixerOpen(false)} />}
      </main>

      {/* ── Transport Bar ─────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 border-t border-white/8 bg-zinc-950/90 backdrop-blur-md"
        style={{
          paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom))',
          paddingTop: '0.7rem',
          paddingInline: '1.25rem',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Audio Mixer toggle */}
          <button
            type="button"
            aria-label="Open audio mixer"
            onClick={() => setMixerOpen(true)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-all active:scale-95 ${
              mixerOpen
                ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                : 'border-white/12 bg-white/6 text-white/55 hover:bg-white/10'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Mixer
          </button>

          {/* Play / Stop — prominent center button */}
          <button
            type="button"
            aria-label={isPlaying ? 'Stop' : 'Play'}
            onClick={handlePlayStop}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all active:scale-90 ${
              isPlaying
                ? 'border-red-500/70 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.55)]'
                : 'border-white/25 bg-white shadow-[0_0_16px_rgba(255,255,255,0.2)]'
            }`}
          >
            {isPlaying ? (
              <Square className="h-5 w-5 text-white" fill="currentColor" />
            ) : (
              <Play className="h-5 w-5 text-black" fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>

          {/* Mixdown */}
          <button
            type="button"
            aria-label="Mixdown and export"
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3.5 py-2 text-[11px] font-semibold text-white/55 transition-all active:scale-95 hover:bg-white/10"
          >
            <Download className="h-3.5 w-3.5" />
            Mixdown
          </button>
        </div>
      </footer>
    </div>
  )
}
