import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Layers,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  User,
  Video,
  X,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import TakeVideoPlayer from '../TakeVideoPlayer'
import MiniPipControls from '../MiniPipControls'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'
import { stopEventBubble } from '../../utils/eventBubbling'
import { playMediaOnUserGesture } from '../../utils/mediaPlayback'
import { mobileVideoProps } from '../../utils/mobileVideo'
import {
  primeTakePlaybackAudio,
  releaseTakePlaybackAudio,
} from '../../utils/takePlaybackAudio'

// ─── Track accent styling (mirrors Best Take / Current Take PiP palette) ─────

const TRACK_ACCENTS = [
  { ring: 'ring-sky-400/50', badge: 'bg-sky-500/90', label: 'text-sky-300' },
  { ring: 'ring-violet-400/50', badge: 'bg-violet-500/90', label: 'text-violet-300' },
  { ring: 'ring-emerald-400/50', badge: 'bg-emerald-500/90', label: 'text-emerald-300' },
  { ring: 'ring-orange-400/50', badge: 'bg-orange-500/90', label: 'text-orange-300' },
] as const

const FLOAT_BTN =
  'pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-black/90 active:scale-90'

const PIP_PLAY_TARGET =
  'pointer-events-auto z-[5] flex min-h-11 min-w-11 items-center justify-center p-3'
const PIP_PLAY_ICON =
  'flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/95 shadow-[0_2px_8px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:bg-black/80'

// ─── Waveform decoration (mixer drawer) ──────────────────────────────────────

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

// ─── Studio Track Cell ────────────────────────────────────────────────────────

interface StudioTrackCellProps {
  track: StudioTrack
  trackIndex: number
  playbackVideoRef: (el: HTMLMediaElement | null) => void
  onArm: () => void
  onRecord: () => void
  onStop: () => void
  onClear: () => void
  onMuteToggle: () => void
  onVolumeChange: (volume: number) => void
}

function StudioTrackCell({
  track,
  trackIndex,
  playbackVideoRef,
  onArm,
  onRecord,
  onStop,
  onClear,
  onMuteToggle,
  onVolumeChange,
}: StudioTrackCellProps) {
  const livePreviewRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<HTMLMediaElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPoster, setShowPoster] = useState(true)

  const accent = TRACK_ACCENTS[trackIndex % TRACK_ACCENTS.length]!
  const hasLive = !!track.stream && !track.recordedBlobUrl
  const hasRecording = !!track.recordedBlobUrl
  const isRecording = track.isRecording
  const videoSourceKey = track.recordedBlobUrl ?? 'empty'

  // Wire playback ref into the shared engine
  useEffect(() => {
    playbackVideoRef(playbackRef.current)
  })

  // Mount live camera stream with front-camera mirror (same as main app)
  useEffect(() => {
    const video = livePreviewRef.current
    if (!video || !track.stream || hasRecording) {
      if (video?.srcObject) video.srcObject = null
      return
    }
    if (video.srcObject !== track.stream) {
      video.srcObject = track.stream
      void video.play().catch(() => {})
    } else if (video.paused) {
      void video.play().catch(() => {})
    }
  }, [track.stream, hasRecording])

  // Sync play / poster state from the playback media element
  useEffect(() => {
    const media = playbackRef.current
    if (!media || !hasRecording) {
      setIsPlaying(false)
      setShowPoster(true)
      return
    }

    const syncPlaying = () => {
      const playing = !media.paused && !media.ended
      setIsPlaying(playing)
      setShowPoster(!playing)
    }

    media.addEventListener('play', syncPlaying)
    media.addEventListener('pause', syncPlaying)
    media.addEventListener('ended', syncPlaying)
    syncPlaying()

    return () => {
      media.removeEventListener('play', syncPlaying)
      media.removeEventListener('pause', syncPlaying)
      media.removeEventListener('ended', syncPlaying)
    }
  }, [hasRecording, videoSourceKey])

  const handlePlayPause = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      const media = playbackRef.current
      if (!media) return

      if (media.paused) {
        media.currentTime = 0
        void playMediaOnUserGesture(media, () => primeTakePlaybackAudio(media)).then(
          (started) => {
            setIsPlaying(started)
            setShowPoster(!started)
          },
        )
      } else {
        media.pause()
        void releaseTakePlaybackAudio()
        setIsPlaying(false)
        setShowPoster(true)
      }
    },
    [],
  )

  const handleVolume = useCallback(
    (value: number) => {
      onVolumeChange(value)
    },
    [onVolumeChange],
  )

  const containerRing = isRecording
    ? 'ring-red-500/60 border-red-400/70 studio-track-cell--recording'
    : `${accent.ring} border-white/15`

  return (
    <div className="studio-track-cell group relative min-h-0 flex-1">
      <div
        data-studio-track={track.id}
        className={`relative h-full w-full overflow-hidden rounded-xl border bg-stone-900/95 shadow-lg shadow-black/50 ring-1 transition-[box-shadow,border-color] duration-200 ${containerRing}`}
      >
        {/* Track label badge — same style as Best Take / Current Take pills */}
        <span
          className={`pointer-events-none absolute z-20 max-w-[calc(100%-4rem)] truncate rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-white ${accent.badge}`}
          style={{ top: 6, left: 8 }}
        >
          {isRecording ? '● Recording' : track.label}
        </span>

        {/* Live camera preview (mirrored like main app) */}
        {hasLive && (
          <video
            ref={livePreviewRef}
            autoPlay
            muted
            playsInline
            disablePictureInPicture
            {...mobileVideoProps}
            className="camera-preview camera-preview--mirror camera-preview--live absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Recorded take playback (mirrored like in-app takes) */}
        {hasRecording && track.recordedBlobUrl && (
          <TakeVideoPlayer
            filePath=""
            videoUrl={track.recordedBlobUrl}
            videoRef={playbackRef}
            videoSourceKey={videoSourceKey}
            className="absolute inset-0 h-full w-full object-cover"
            loadingClassName="absolute inset-0 h-full w-full bg-stone-900"
            mirror
            controls={false}
            manualPlayOnly
            audible={isPlaying && !track.isMuted}
            eagerLoad
            preload="auto"
            loop
          />
        )}

        {/* Thumbnail poster — shown when take exists but is not playing */}
        {hasRecording && showPoster && track.thumbnailUrl && (
          <img
            src={track.thumbnailUrl}
            alt=""
            className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-cover"
            draggable={false}
          />
        )}

        {/* Empty state */}
        {!hasLive && !hasRecording && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-800/90 px-3 pt-6">
            <User className="h-8 w-8 text-white/25" strokeWidth={1.2} />
            <p className="text-center text-[9px] leading-snug text-white/40">
              Tap camera to arm
            </p>
          </div>
        )}

        {/* Center play/pause — matches PiP inline preview */}
        {hasRecording && (
          <div className="absolute inset-0 z-[5] pointer-events-none">
            <button
              type="button"
              onPointerDown={stopEventBubble}
              onTouchStart={stopEventBubble}
              onTouchEnd={stopEventBubble}
              onPointerUp={handlePlayPause}
              className={`${PIP_PLAY_TARGET} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
              } transition-opacity`}
              aria-label={isPlaying ? 'Pause take' : 'Play take'}
            >
              <span className={PIP_PLAY_ICON}>
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-white" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-white" />
                )}
              </span>
            </button>
          </div>
        )}

        {/* Bottom volume strip — slides up on hover like PiP */}
        {hasRecording && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/65 px-2.5 py-1.5 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MiniPipControls
              isPlaying={isPlaying}
              volume={track.isMuted ? 0 : track.volume}
              onPlayPauseClick={handlePlayPause}
              onVolumeChange={handleVolume}
            />
          </div>
        )}
      </div>

      {/* Floating corner controls — outside overflow clip like PiP badges */}
      <div className="absolute left-1.5 top-1.5 z-30 flex gap-1.5">
        {!hasRecording && !isRecording && (
          <button
            type="button"
            aria-label={hasLive ? `Record ${track.label}` : `Arm ${track.label}`}
            onClick={hasLive ? onRecord : onArm}
            className={`${FLOAT_BTN} ${
              hasLive
                ? 'border-red-400/60 bg-red-500/90 shadow-[0_0_10px_rgba(239,68,68,0.55)]'
                : ''
            }`}
          >
            {hasLive ? (
              <div className="h-2.5 w-2.5 rounded-full bg-white" />
            ) : (
              <Video className="h-3.5 w-3.5 text-white/80" />
            )}
          </button>
        )}

        {isRecording && (
          <button
            type="button"
            aria-label="Stop recording"
            onClick={onStop}
            className={`${FLOAT_BTN} border-red-400/60 bg-red-500/90 shadow-[0_0_12px_rgba(239,68,68,0.65)]`}
          >
            <Square className="h-3 w-3 text-white" fill="currentColor" />
          </button>
        )}

        {hasRecording && (
          <button
            type="button"
            aria-label={track.isMuted ? 'Unmute' : 'Mute'}
            onClick={onMuteToggle}
            className={`${FLOAT_BTN} ${
              track.isMuted
                ? 'border-amber-400/60 bg-amber-500/90 shadow-[0_0_10px_rgba(245,158,11,0.55)]'
                : ''
            }`}
          >
            {track.isMuted ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5 text-white/80" />
            )}
          </button>
        )}
      </div>

      {hasRecording && (
        <button
          type="button"
          aria-label={`Clear ${track.label}`}
          onClick={onClear}
          className={FLOAT_BTN}
          style={{ position: 'absolute', top: -10, right: -10, zIndex: 30 }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
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
      <div className="absolute inset-0 z-30 bg-black/55" onClick={onClose} aria-hidden />

      <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[72%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-900/98 shadow-2xl backdrop-blur-xl">
        <div className="flex shrink-0 flex-col items-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-white/50" />
            <h2 className="text-[13px] font-bold tracking-tight">Audio Mixer</h2>
          </div>
          <button
            type="button"
            aria-label="Close mixer"
            onClick={onClose}
            className={`${FLOAT_BTN} h-7 w-7 bg-white/10 hover:bg-white/15`}
          >
            <ChevronDown className="h-4 w-4 text-white/70" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tracks.map((track, idx) => {
            const vol = Math.round(track.volume * 100)
            const hasAudio = !!track.recordedBlobUrl
            const accent = TRACK_ACCENTS[idx % TRACK_ACCENTS.length]!
            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < tracks.length - 1 ? 'border-b border-white/6' : ''
                }`}
              >
                <div className="flex w-[4.5rem] shrink-0 flex-col gap-0.5">
                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt=""
                      className="mb-1 h-8 w-full rounded-md border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="mb-1 flex h-8 w-full items-center justify-center rounded-md border border-white/10 bg-stone-800/80">
                      <span className="text-[8px] text-white/25">empty</span>
                    </div>
                  )}
                  <span className={`text-[10px] font-bold ${accent.label}`}>{track.label}</span>
                  <span className="text-[9px] tabular-nums text-white/30">
                    {hasAudio ? `${vol}%` : '—'}
                  </span>
                </div>

                <button
                  type="button"
                  aria-label={track.isMuted ? 'Unmute' : 'Mute'}
                  onClick={() => onMuteToggle(track.id)}
                  disabled={!hasAudio}
                  className={`${FLOAT_BTN} h-7 w-7 shrink-0 disabled:opacity-25 ${
                    track.isMuted ? 'border-amber-400/60 bg-amber-500/90' : ''
                  }`}
                >
                  {track.isMuted ? (
                    <MicOff className="h-3 w-3" />
                  ) : (
                    <Mic className="h-3 w-3 text-white/70" />
                  )}
                </button>

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
          className="font-black leading-none tabular-nums text-white"
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
    playbackVideoRefs,
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
    if (isPlaying) stopAll()
    else playAll()
  }, [isPlaying, playAll, stopAll])

  const dismissError = useCallback(() => setError(null), [setError])

  const renderTrack = (index: 0 | 1 | 2 | 3) => {
    const track = tracks[index]!
    return (
      <StudioTrackCell
        key={track.id}
        track={track}
        trackIndex={index}
        playbackVideoRef={(el) => {
          playbackVideoRefs.current[index] = el
        }}
        onArm={() => initHardware(track.id)}
        onRecord={() => startRecording(track.id)}
        onStop={stopRecording}
        onClear={() => clearTrack(track.id)}
        onMuteToggle={() => setTrackMuted(track.id, !track.isMuted)}
        onVolumeChange={(v) => setTrackVolume(track.id, v)}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
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
            {isCountingIn
              ? 'Count In'
              : tracks.some((t) => t.isRecording)
                ? 'Recording'
                : isPlaying
                  ? 'Playing'
                  : 'Ready'}
          </span>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
        <div className="flex min-h-0 flex-1 gap-2.5">
          {renderTrack(0)}
          {renderTrack(1)}
        </div>
        <div className="flex min-h-0 flex-1 gap-2.5">
          {renderTrack(2)}
          {renderTrack(3)}
        </div>

        {isCountingIn && currentCount > 0 && <CountInOverlay count={currentCount} />}

        {error && (
          <button
            type="button"
            className="absolute inset-x-4 top-2 z-50 rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-3 text-left text-xs text-red-300 backdrop-blur-md active:scale-[0.98]"
            onClick={dismissError}
            aria-live="assertive"
          >
            <span className="font-bold">Error: </span>
            {error}
            <span className="ml-2 text-red-500/60">tap to dismiss</span>
          </button>
        )}

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

      <footer
        className="shrink-0 border-t border-white/8 bg-zinc-950/90 backdrop-blur-md"
        style={{
          paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom))',
          paddingTop: '0.7rem',
          paddingInline: '1.25rem',
        }}
      >
        <div className="flex items-center justify-between gap-3">
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

          <button
            type="button"
            aria-label={isPlaying ? 'Stop all tracks' : 'Play all tracks'}
            onClick={handlePlayStop}
            disabled={isCountingIn || !tracks.some((t) => t.recordedBlobUrl)}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all active:scale-90 disabled:opacity-35 ${
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
