import { useCallback, useState } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Layers,
  Mic,
  MicOff,
  Play,
  Square,
  Trash2,
  User,
  Video,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'

// ─── Waveform data (static visual decoration inside the mixer drawer) ─────────

function makePeaks(seed: number, count = 60): number[] {
  return Array.from({ length: count }, (_, i) =>
    Math.min(
      0.95,
      Math.abs(
        Math.sin(i * 0.31 + seed) * 0.42 +
          Math.sin(i * 0.17 + seed * 1.7) * 0.31 +
          Math.sin(i * 0.53 + seed * 0.4) * 0.18 +
          0.12,
      ),
    ),
  )
}
const PEAKS = [makePeaks(1.2), makePeaks(3.8), makePeaks(2.1), makePeaks(5.5)]

// ─── Mini waveform ────────────────────────────────────────────────────────────

function MiniWaveform({ peaks, color }: { peaks: number[]; color: string }) {
  return (
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
          opacity={0.72}
          rx={0.1}
        />
      ))}
    </svg>
  )
}

// ─── Camera Cell ──────────────────────────────────────────────────────────────

interface CameraCellProps {
  track: StudioTrack
  videoRef: (el: HTMLVideoElement | null) => void
  onArm: () => void           // triggers initHardware → shows live preview
  onRecord: () => void        // triggers count-in → MediaRecorder
  onStop: () => void
  onClear: () => void
  onMuteToggle: () => void
}

function CameraCell({
  track,
  videoRef,
  onArm,
  onRecord,
  onStop,
  onClear,
  onMuteToggle,
}: CameraCellProps) {
  const hasLive = !!track.stream && !track.recordedBlobUrl
  const hasRecording = !!track.recordedBlobUrl
  const isRecording = track.isRecording

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-2xl border"
      style={{
        borderColor: isRecording ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.08)',
        background: '#0d1117',
        boxShadow: isRecording ? '0 0 18px rgba(239,68,68,0.3)' : undefined,
      }}
    >
      {/* ── Video element (live OR playback) ─────────────────────────── */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        // muted is set programmatically in the hook based on live vs playback
        muted
        loop={hasRecording}
      />

      {/* ── Empty-cell placeholder (hidden when stream/recording active) ─ */}
      {!hasLive && !hasRecording && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 opacity-20">
          <User className="h-9 w-9 text-white" strokeWidth={1.2} />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white">
            {track.label}
          </span>
        </div>
      )}

      {/* ── Recording blink ring ─────────────────────────────────────── */}
      {isRecording && (
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl animate-pulse"
          style={{ boxShadow: 'inset 0 0 0 2.5px rgba(239,68,68,0.85)' }}
          aria-hidden
        />
      )}

      {/* ── Top-left controls ────────────────────────────────────────── */}
      <div className="absolute left-2 top-2 flex gap-1.5">
        {/* Arm / Record button */}
        {!hasRecording && !isRecording && (
          <button
            type="button"
            aria-label={hasLive ? `Record ${track.label}` : `Arm ${track.label}`}
            onClick={hasLive ? onRecord : onArm}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all active:scale-90 ${
              hasLive
                ? 'border-red-400/70 bg-red-500/90 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
                : 'border-white/20 bg-black/50 backdrop-blur-sm'
            }`}
          >
            {hasLive ? (
              <div className="h-2.5 w-2.5 rounded-full bg-white" />
            ) : (
              <Video className="h-3 w-3 text-white/60" />
            )}
          </button>
        )}

        {/* Stop recording */}
        {isRecording && (
          <button
            type="button"
            aria-label="Stop recording"
            onClick={onStop}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/70 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)] active:scale-90"
          >
            <Square className="h-3 w-3 text-white" fill="currentColor" />
          </button>
        )}

        {/* Mute toggle (only for recorded tracks) */}
        {hasRecording && (
          <button
            type="button"
            aria-label={track.isMuted ? 'Unmute' : 'Mute'}
            onClick={onMuteToggle}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition-all active:scale-90 ${
              track.isMuted
                ? 'border-amber-400/60 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                : 'border-white/20 bg-black/50 backdrop-blur-sm'
            }`}
          >
            {track.isMuted ? (
              <MicOff className="h-3.5 w-3.5 text-white" />
            ) : (
              <Mic className="h-3.5 w-3.5 text-white/70" />
            )}
          </button>
        )}
      </div>

      {/* ── Bottom-right: label chip + clear button ───────────────────── */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
        {hasRecording && (
          <button
            type="button"
            aria-label={`Clear ${track.label}`}
            onClick={onClear}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/50 transition active:scale-90 hover:text-white/80 backdrop-blur-sm"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
        <span className="rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45 backdrop-blur-sm">
          {isRecording ? '● REC' : track.label}
        </span>
      </div>
    </div>
  )
}

// ─── Audio Mixer Drawer ───────────────────────────────────────────────────────

interface AudioDrawerProps {
  tracks: StudioTrack[]
  onVolumeChange: (trackId: string, volume: number) => void
  onMuteToggle: (trackId: string) => void
  onClose: () => void
}

function AudioDrawer({ tracks, onVolumeChange, onMuteToggle, onClose }: AudioDrawerProps) {
  return (
    <>
      {/* Scrim */}
      <div className="absolute inset-0 z-30 bg-black/55" onClick={onClose} aria-hidden />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[72%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-900/98 shadow-2xl backdrop-blur-xl">
        {/* Handle pill */}
        <div className="flex shrink-0 flex-col items-center pb-1 pt-3">
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
          {tracks.map((track, idx) => {
            const vol = Math.round(track.volume * 100)
            const hasAudio = !!track.recordedBlobUrl
            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < tracks.length - 1 ? 'border-b border-white/6' : ''
                }`}
              >
                {/* Label */}
                <div className="flex w-16 shrink-0 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ background: track.color }}
                      aria-hidden
                    />
                    <span className="text-[11px] font-bold" style={{ color: track.color }}>
                      {track.label}
                    </span>
                  </div>
                  <span className="text-[9px] tabular-nums text-white/30">
                    {hasAudio ? `${vol}%` : 'empty'}
                  </span>
                </div>

                {/* Mute toggle */}
                <button
                  type="button"
                  aria-label={track.isMuted ? 'Unmute' : 'Mute'}
                  onClick={() => onMuteToggle(track.id)}
                  disabled={!hasAudio}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90 disabled:opacity-25 ${
                    track.isMuted
                      ? 'border-amber-400/60 bg-amber-500/90'
                      : 'border-white/15 bg-white/8'
                  }`}
                >
                  {track.isMuted ? (
                    <MicOff className="h-3 w-3 text-white" />
                  ) : (
                    <Mic className="h-3 w-3 text-white/60" />
                  )}
                </button>

                {/* Volume slider — wired to live video element via hook */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={vol}
                  disabled={!hasAudio}
                  onChange={(e) => onVolumeChange(track.id, Number(e.target.value) / 100)}
                  aria-label={`${track.label} volume`}
                  className="studio-vol-slider w-20 shrink-0 disabled:opacity-25"
                />

                {/* Static waveform decoration */}
                <div
                  className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-white/8 bg-black/30"
                  style={{ height: 36 }}
                >
                  {hasAudio ? (
                    <MiniWaveform peaks={PEAKS[idx] ?? []} color={track.color} />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-[9px] text-white/20">no recording</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Safe-area spacer */}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>
  )
}

// ─── Count-In Overlay ─────────────────────────────────────────────────────────

function CountInOverlay({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/72 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <span
          className="font-black text-white leading-none tabular-nums"
          style={{
            fontSize: 'clamp(100px, 28vw, 200px)',
            textShadow:
              count === 1
                ? '0 0 60px rgba(239,68,68,0.8), 0 0 120px rgba(239,68,68,0.4)'
                : '0 0 60px rgba(255,255,255,0.35)',
            color: count === 1 ? '#f87171' : '#ffffff',
          }}
        >
          {count}
        </span>
        <span className="text-sm font-semibold uppercase tracking-[0.3em] text-white/40">
          {count === 1 ? 'get ready' : 'count in'}
        </span>
      </div>
    </div>
  )
}

// ─── StudioSandbox ────────────────────────────────────────────────────────────

interface StudioSandboxProps {
  onExit: () => void
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const [mixerOpen, setMixerOpen] = useState(false)

  const {
    tracks,
    isCountingIn,
    currentCount,
    isPlaying,
    error,
    videoRefs,
    initHardware,
    startRecording,
    stopRecording,
    playAll,
    stopAll,
    setTrackVolume,
    setTrackMuted,
    clearTrack,
    setError,
  } = useMultiTrackStudio()

  const handlePlayStop = useCallback(() => {
    if (isPlaying) {
      stopAll()
    } else {
      playAll()
    }
  }, [isPlaying, playAll, stopAll])

  // Dismiss error on tap
  const dismissError = useCallback(() => setError(null), [setError])

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
          <p className="text-[9px] font-medium uppercase tracking-widest text-white/35">
            Sandbox
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5">
          <div
            className={`h-2 w-2 rounded-full transition-all ${
              isCountingIn
                ? 'animate-ping bg-amber-400'
                : isPlaying || tracks.some((t) => t.isRecording)
                  ? 'animate-pulse bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                  : 'bg-white/20'
            }`}
            aria-hidden
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            {isCountingIn ? 'Count In' : tracks.some((t) => t.isRecording) ? 'Recording' : isPlaying ? 'Playing' : 'Ready'}
          </span>
        </div>
      </header>

      {/* ── 2×2 Camera Grid ──────────────────────────────────────────────── */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-2 p-2">
        {/* Row 1 */}
        <div className="flex min-h-0 flex-1 gap-2">
          {([0, 1] as const).map((i) => {
            const track = tracks[i]!
            return (
              <CameraCell
                key={track.id}
                track={track}
                videoRef={(el) => { videoRefs.current[i] = el }}
                onArm={() => initHardware(track.id)}
                onRecord={() => startRecording(track.id)}
                onStop={stopRecording}
                onClear={() => clearTrack(track.id)}
                onMuteToggle={() => setTrackMuted(track.id, !track.isMuted)}
              />
            )
          })}
        </div>
        {/* Row 2 */}
        <div className="flex min-h-0 flex-1 gap-2">
          {([2, 3] as const).map((i) => {
            const track = tracks[i]!
            return (
              <CameraCell
                key={track.id}
                track={track}
                videoRef={(el) => { videoRefs.current[i] = el }}
                onArm={() => initHardware(track.id)}
                onRecord={() => startRecording(track.id)}
                onStop={stopRecording}
                onClear={() => clearTrack(track.id)}
                onMuteToggle={() => setTrackMuted(track.id, !track.isMuted)}
              />
            )
          })}
        </div>

        {/* Count-in overlay */}
        {isCountingIn && currentCount > 0 && <CountInOverlay count={currentCount} />}

        {/* Error toast */}
        {error && (
          <button
            type="button"
            className="absolute inset-x-4 top-2 z-50 rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-3 text-left text-xs text-red-300 backdrop-blur-md active:scale-[0.98]"
            onClick={dismissError}
            aria-live="assertive"
          >
            <span className="font-bold">Error: </span>{error}
            <span className="ml-2 text-red-500/60">tap to dismiss</span>
          </button>
        )}

        {/* Mixer drawer */}
        {mixerOpen && (
          <AudioDrawer
            tracks={tracks}
            onVolumeChange={setTrackVolume}
            onMuteToggle={(id) => {
              const t = tracks.find((x) => x.id === id)
              if (t) setTrackMuted(id, !t.isMuted)
            }}
            onClose={() => setMixerOpen(false)}
          />
        )}
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
          {/* Mixer toggle */}
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

          {/* Play / Stop */}
          <button
            type="button"
            aria-label={isPlaying ? 'Stop' : 'Play all tracks'}
            onClick={handlePlayStop}
            disabled={isCountingIn}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all active:scale-90 disabled:opacity-40 ${
              isPlaying
                ? 'border-red-500/70 bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.55)]'
                : 'border-white/25 bg-white shadow-[0_0_16px_rgba(255,255,255,0.2)]'
            }`}
          >
            {isPlaying ? (
              <Square className="h-5 w-5 text-white" fill="currentColor" />
            ) : (
              <Play
                className="h-5 w-5 text-black"
                fill="currentColor"
                style={{ marginLeft: 2 }}
              />
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
