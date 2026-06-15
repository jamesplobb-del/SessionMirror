import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from 'react'
import type { MouseEvent } from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Layers,
  Mic,
  MicOff,
  Pause,
  Play,
  Download,
  Square,
  User,
  Video,
  X,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import TakeVideoPlayer from '../TakeVideoPlayer'
import MiniPipControls from '../MiniPipControls'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'
import { playMediaOnUserGesture } from '../../utils/mediaPlayback'
import { mobileVideoProps } from '../../utils/mobileVideo'
import {
  primeTakePlaybackAudio,
  releaseTakePlaybackAudio,
} from '../../utils/takePlaybackAudio'

// ─── Accent palette ───────────────────────────────────────────────────────────

const TRACK_ACCENTS = [
  { ring: 'ring-sky-400/50',     badge: 'bg-sky-500/90',     label: 'text-sky-300',     hex: '#38bdf8' },
  { ring: 'ring-violet-400/50',  badge: 'bg-violet-500/90',  label: 'text-violet-300',  hex: '#c084fc' },
  { ring: 'ring-emerald-400/50', badge: 'bg-emerald-500/90', label: 'text-emerald-300', hex: '#34d399' },
  { ring: 'ring-orange-400/50',  badge: 'bg-orange-500/90',  label: 'text-orange-300',  hex: '#fb923c' },
] as const

const FLOAT_BTN =
  'flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-black/90 active:scale-90'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ─── Studio Track Cell ────────────────────────────────────────────────────────
// NOTE: isExpanded / isHidden use CSS-only state changes — the component is
// NEVER unmounted during the recording flow so the live MediaStream stays
// attached to its <video> element without iOS re-attachment failures.

interface StudioTrackCellProps {
  track: StudioTrack
  trackIndex: number
  /** True → this cell should cover the full main area (position: absolute inset-0) */
  isExpanded: boolean
  /** True → another cell is expanded; render invisible but keep alive for backing-track audio */
  isHidden: boolean
  /** Whether this specific track is currently solo-quick-playing */
  isQuickPlaying: boolean
  playbackVideoRef: (el: HTMLMediaElement | null) => void
  onArm: () => void
  onRecord: () => void
  onStop: () => void
  onClear: () => void
  onMuteToggle: () => void
  onVolumeChange: (volume: number) => void
  onQuickPlayToggle: () => void
  onPlaybackEnded: () => void
  onExpand: () => void
}

function StudioTrackCell({
  track,
  trackIndex,
  isExpanded,
  isHidden,
  isQuickPlaying,
  playbackVideoRef,
  onArm,
  onRecord,
  onStop,
  onClear,
  onMuteToggle,
  onVolumeChange,
  onQuickPlayToggle,
  onPlaybackEnded,
  onExpand,
}: StudioTrackCellProps) {
  const livePreviewRef = useRef<HTMLVideoElement>(null)
  const playbackRef = useRef<HTMLMediaElement | null>(null)
  // Track actual video play state so the thumbnail poster hides correctly
  // for both solo-play and global-play (not just isQuickPlaying).
  const [showPoster, setShowPoster] = useState(true)

  const accent = TRACK_ACCENTS[trackIndex % TRACK_ACCENTS.length]!
  const hasLive = !!track.stream && !track.recordedBlobUrl
  const hasRecording = !!track.recordedBlobUrl
  const isRecording = track.isRecording
  const videoSourceKey = track.recordedBlobUrl ?? 'empty'

  // Propagate the TakeVideoPlayer ref up to the engine's ref array.
  // useLayoutEffect ensures the ref is already assigned before propagation.
  useLayoutEffect(() => {
    playbackVideoRef(playbackRef.current)
  })

  // Sync poster visibility to the video element's actual play/pause state.
  // This works for both solo quick-play and global transport play.
  useEffect(() => {
    const media = playbackRef.current
    if (!media || !hasRecording) {
      setShowPoster(true)
      return
    }
    const sync = () => setShowPoster(media.paused || media.ended)
    media.addEventListener('play', sync)
    media.addEventListener('pause', sync)
    media.addEventListener('ended', sync)
    sync()
    return () => {
      media.removeEventListener('play', sync)
      media.removeEventListener('pause', sync)
      media.removeEventListener('ended', sync)
    }
  }, [hasRecording, videoSourceKey])

  // Listen for playback-ended so the parent can clear solo-play state
  useEffect(() => {
    const media = playbackRef.current
    if (!media || !hasRecording) return
    media.addEventListener('ended', onPlaybackEnded)
    return () => media.removeEventListener('ended', onPlaybackEnded)
  }, [hasRecording, onPlaybackEnded, videoSourceKey])

  // Live camera stream — attach/play when available, detach when recording done
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

  const handleVolume = useCallback(
    (value: number) => onVolumeChange(value),
    [onVolumeChange],
  )

  const handlePlayPauseBtn = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onQuickPlayToggle() },
    [onQuickPlayToggle],
  )

  const containerRing = isRecording
    ? 'ring-red-500/60 border-red-400/70'
    : `${accent.ring} border-white/15`

  // ── Outer wrapper decides layout mode ─────────────────────────────────────
  // expanded  → absolute, covers <main> (positioning parent is `relative`)
  // hidden    → invisible but NOT unmounted; backing-track audio stays alive
  // normal    → flex-1 cell in the 2×2 grid
  // overflow-hidden is on the INNER video container; the outer cell must stay
  // overflow-visible so the floating action buttons can bleed outside the border.
  const outerCls = isExpanded
    ? 'absolute inset-0 z-50 bg-black'
    : isHidden
      ? 'relative flex-1 min-h-0 invisible pointer-events-none'
      : 'relative flex-1 min-h-0'

  return (
    <div className={`studio-track-cell group ${outerCls}`}>
      {/* Inner video container */}
      <div
        className={`relative h-full w-full overflow-hidden border bg-stone-900/95 shadow-lg shadow-black/50 transition-[box-shadow,border-color] duration-200 ${containerRing} ${
          isExpanded ? 'rounded-none ring-0' : 'rounded-xl ring-1'
        } ${isRecording ? 'studio-track-cell--recording' : ''}`}
      >
        {/* Track label */}
        <span
          className={`pointer-events-none absolute z-20 max-w-[calc(100%-5rem)] truncate rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-white ${accent.badge}`}
          style={{ top: 6, left: 8 }}
        >
          {isRecording ? '● Recording' : track.label}
        </span>

        {/* Live preview (mirrored) */}
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

        {/* Recorded playback */}
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
            audible={!track.isMuted}
            eagerLoad
            preload="auto"
            loop
          />
        )}

        {/* Thumbnail poster — hidden while video is actually playing */}
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-stone-800/90 px-3 pt-5">
            <User className="h-8 w-8 text-white/25" strokeWidth={1.2} />
            <p className="text-center text-[9px] leading-snug text-white/35">
              Tap {'\u25B6'} to arm
            </p>
          </div>
        )}

        {/* Tap-to-expand — sits below the play button */}
        {hasRecording && !isRecording && (
          <button
            type="button"
            className="absolute inset-0 z-[4] cursor-pointer border-0 bg-transparent p-0"
            onClick={onExpand}
            aria-label={`Open ${track.label} fullscreen`}
          />
        )}

        {/* Center quick-play button */}
        {hasRecording && !isRecording && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            <button
              type="button"
              onClick={handlePlayPauseBtn}
              className={`pointer-events-auto absolute left-1/2 top-1/2 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center p-3 transition-opacity ${
                isQuickPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
              }`}
              aria-label={isQuickPlaying ? 'Pause track' : 'Play track'}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/65 shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm transition hover:bg-black/80">
                {isQuickPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-white text-white" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-white text-white" style={{ marginLeft: 1 }} />
                )}
              </span>
            </button>
          </div>
        )}

        {/* Bottom hover volume strip */}
        {hasRecording && !isRecording && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/65 px-2.5 py-1.5 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MiniPipControls
              isPlaying={isQuickPlaying}
              volume={track.isMuted ? 0 : track.volume}
              onPlayPauseClick={onQuickPlayToggle}
              onVolumeChange={handleVolume}
            />
          </div>
        )}
      </div>

      {/* ── Floating top-RIGHT controls (outside overflow clip) ─────────────── */}
      <div className="absolute right-1.5 top-1.5 z-30 flex gap-1.5">
        {hasRecording && !isRecording && (
          <button type="button" aria-label={`Clear ${track.label}`} onClick={onClear} className={FLOAT_BTN}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {hasRecording && !isRecording && (
          <button
            type="button"
            aria-label={track.isMuted ? 'Unmute' : 'Mute'}
            onClick={onMuteToggle}
            className={`${FLOAT_BTN} ${
              track.isMuted ? 'border-amber-400/60 bg-amber-500/90 shadow-[0_0_10px_rgba(245,158,11,0.55)]' : ''
            }`}
          >
            {track.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-white/80" />}
          </button>
        )}

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
            {hasLive ? <div className="h-2.5 w-2.5 rounded-full bg-white" /> : <Video className="h-3.5 w-3.5 text-white/80" />}
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
      </div>
    </div>
  )
}

// ─── Audio Mixer Drawer ───────────────────────────────────────────────────────

interface AudioDrawerProps {
  tracks: StudioTrack[]
  playbackVideoRefs: MutableRefObject<(HTMLMediaElement | null)[]>
  onVolumeChange: (trackId: string, volume: number) => void
  onMuteToggle: (trackId: string) => void
  onClose: () => void
}

interface TrackPosition {
  time: number
  duration: number
}

function AudioDrawer({
  tracks,
  playbackVideoRefs,
  onVolumeChange,
  onMuteToggle,
  onClose,
}: AudioDrawerProps) {
  // Poll currentTime / duration from DOM elements each animation frame
  const [positions, setPositions] = useState<Record<string, TrackPosition>>({})
  const rafRef = useRef(0)

  useEffect(() => {
    const tick = () => {
      const next: Record<string, TrackPosition> = {}
      tracks.forEach((track, i) => {
        const el = playbackVideoRefs.current[i]
        if (el && track.recordedBlobUrl) {
          next[track.id] = {
            time: el.currentTime,
            duration: isFinite(el.duration) ? el.duration : 0,
          }
        }
      })
      setPositions(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tracks, playbackVideoRefs])

  const handleSeek = useCallback(
    (idx: number, value: number) => {
      const el = playbackVideoRefs.current[idx]
      if (el) el.currentTime = value
    },
    [playbackVideoRefs],
  )

  return (
    <>
      {/* Scrim */}
      <div className="absolute inset-0 z-30 bg-black/55" onClick={onClose} aria-hidden />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[82%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-900 shadow-2xl">
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-white/40" />
            <h2 className="text-[13px] font-bold tracking-tight">Audio Mixer</h2>
          </div>
          <button
            type="button"
            aria-label="Close mixer"
            onClick={onClose}
            className={`${FLOAT_BTN} h-7 w-7 bg-white/8`}
          >
            <ChevronDown className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Track rows */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tracks.map((track, idx) => {
            const hasAudio = !!track.recordedBlobUrl
            const vol = Math.round(track.volume * 100)
            const pos = positions[track.id]
            const accent = TRACK_ACCENTS[idx % TRACK_ACCENTS.length]!
            const duration = pos?.duration ?? 0
            const currentTime = pos?.time ?? 0
            const volPct = vol
            const scrubPct = duration > 0 ? (currentTime / duration) * 100 : 0

            return (
              <div
                key={track.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx < tracks.length - 1 ? 'border-b border-white/6' : ''
                } ${!hasAudio ? 'opacity-45' : ''}`}
              >
                {/* LEFT — Thumbnail / placeholder + label */}
                <div className="flex w-[52px] shrink-0 flex-col items-center gap-1.5">
                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt=""
                      className="h-10 w-full rounded-lg border border-white/12 object-cover shadow-md"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-full items-center justify-center rounded-lg border border-white/10 bg-stone-800"
                      style={{ boxShadow: `0 0 0 1px ${accent.hex}22` }}
                    >
                      <User className="h-4 w-4 text-white/25" />
                    </div>
                  )}
                  <span className={`text-center text-[8px] font-bold uppercase tracking-wide ${accent.label}`}>
                    {track.label}
                  </span>
                </div>

                {/* CENTER — Volume fader + Scrubber (stacked) */}
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {hasAudio ? (
                    <>
                      {/* Volume fader */}
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-[8px] font-semibold tabular-nums text-white/35">
                          VOL
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={volPct}
                          onChange={(e) => onVolumeChange(track.id, Number(e.target.value) / 100)}
                          aria-label={`${track.label} volume`}
                          className="studio-vol-slider flex-1"
                          style={
                            {
                              '--fill-pct': `${volPct}%`,
                              '--fill-color': track.color,
                            } as CSSProperties
                          }
                        />
                        <span className="w-7 shrink-0 text-left text-[9px] tabular-nums text-white/35">
                          {volPct}%
                        </span>
                      </div>

                      {/* Scrubber */}
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-right text-[8px] tabular-nums text-white/30">
                          {fmtTime(currentTime)}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={duration || 1}
                          step={0.01}
                          value={currentTime}
                          onChange={(e) => handleSeek(idx, Number(e.target.value))}
                          aria-label={`${track.label} seek`}
                          className="studio-scrubber flex-1"
                          style={
                            {
                              '--fill-pct': `${scrubPct}%`,
                              '--fill-color': accent.hex,
                            } as CSSProperties
                          }
                        />
                        <span className="w-7 shrink-0 text-left text-[9px] tabular-nums text-white/30">
                          {fmtTime(duration)}
                        </span>
                      </div>
                    </>
                  ) : (
                    /* Empty state — no ghost waveform */
                    <div className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/4 px-3 py-2">
                      <span className="text-[10px] italic text-white/40">
                        Track Empty — Tap Grid to Record
                      </span>
                    </div>
                  )}
                </div>

                {/* RIGHT — Mute toggle */}
                <div className="flex w-9 shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-label={track.isMuted ? 'Unmute' : 'Mute'}
                    onClick={() => onMuteToggle(track.id)}
                    disabled={!hasAudio}
                    className={`${FLOAT_BTN} h-9 w-9 disabled:cursor-not-allowed disabled:opacity-25 ${
                      track.isMuted
                        ? 'border-amber-400/60 bg-amber-500/90 shadow-[0_0_10px_rgba(245,158,11,0.55)]'
                        : 'border-white/12'
                    }`}
                  >
                    {track.isMuted ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4 text-white/70" />
                    )}
                  </button>
                  <span
                    className={`text-[7px] font-semibold uppercase tracking-wide ${
                      track.isMuted ? 'text-amber-400' : 'text-white/25'
                    }`}
                  >
                    {track.isMuted ? 'Muted' : 'Live'}
                  </span>
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

// ─── Fullscreen Preview Overlay ───────────────────────────────────────────────

interface FullscreenPreviewProps {
  track: StudioTrack
  onClose: () => void
}

function FullscreenPreview({ track, onClose }: FullscreenPreviewProps) {
  const videoRef = useRef<HTMLMediaElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const media = videoRef.current
    if (!media || !track.recordedBlobUrl) return
    void playMediaOnUserGesture(media, () => primeTakePlaybackAudio(media)).then(
      (started) => setIsPlaying(started),
    )
    return () => {
      media.pause()
      void releaseTakePlaybackAudio()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePlayPause = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const media = videoRef.current
    if (!media) return
    if (media.paused) {
      void playMediaOnUserGesture(media, () => primeTakePlaybackAudio(media)).then(
        (started) => setIsPlaying(started),
      )
    } else {
      media.pause()
      void releaseTakePlaybackAudio()
      setIsPlaying(false)
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {track.recordedBlobUrl && (
        <TakeVideoPlayer
          filePath=""
          videoUrl={track.recordedBlobUrl}
          videoRef={videoRef}
          mirror
          fit="contain"
          className="absolute inset-0 h-full w-full"
          loadingClassName="absolute inset-0 h-full w-full bg-black"
          controls={false}
          manualPlayOnly
          audible={isPlaying}
          eagerLoad
          preload="auto"
        />
      )}

      {/* Tap anywhere to play/pause */}
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0"
        onClick={handlePlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3">
        <button type="button" onClick={onClose} className={`${FLOAT_BTN} h-9 w-9`} aria-label="Close fullscreen">
          <X className="h-4 w-4" />
        </button>
        <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
          {track.label}
        </span>
        <div className="h-9 w-9" />
      </div>

      {/* Center play indicator */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-opacity duration-300 ${
            isPlaying ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Play className="h-7 w-7 fill-white text-white" style={{ marginLeft: 3 }} />
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      />
    </div>
  )
}

// ─── Count-In Overlay ─────────────────────────────────────────────────────────

function CountInOverlay({ count }: { count: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center bg-black/72 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <span
          className="font-black leading-none tabular-nums"
          style={{
            fontSize: 'clamp(100px, 28vw, 200px)',
            color: count === 1 ? '#f87171' : '#ffffff',
            textShadow:
              count === 1
                ? '0 0 60px rgba(239,68,68,0.8), 0 0 120px rgba(239,68,68,0.4)'
                : '0 0 60px rgba(255,255,255,0.35)',
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
  const [previewIndex, setPreviewIndex] = useState<0 | 1 | 2 | 3 | null>(null)

  // ── Which track index is solo-quick-playing (null = none) ────────────────
  const [soloPlayIdx, setSoloPlayIdx] = useState<number | null>(null)

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

  // Reset solo play when global play starts / recording starts
  useEffect(() => {
    if (isPlaying || isCountingIn || tracks.some((t) => t.isRecording)) {
      setSoloPlayIdx(null)
    }
  }, [isPlaying, isCountingIn, tracks])

  const isAnyTrackRecording = tracks.some((t) => t.isRecording)

  /**
   * The index of the track that should be shown full-screen.
   * -1 means normal 2×2 grid.
   * Uses CSS positioning (never unmounts) so the live MediaStream stays
   * attached and doesn't go black on iOS when re-attaching.
   */
  const expandedTrackIndex = useMemo(() => {
    const recording = tracks.findIndex((t) => t.isRecording)
    if (recording >= 0) return recording
    if (isCountingIn) {
      const armed = tracks.findIndex((t) => !!t.stream && !t.recordedBlobUrl)
      if (armed >= 0) return armed
    }
    return -1
  }, [tracks, isCountingIn])

  // ── Quick-play / solo handler ────────────────────────────────────────────

  const handleQuickPlayToggle = useCallback(
    (index: number) => {
      const el = playbackVideoRefs.current[index]
      if (!el || !tracks[index]?.recordedBlobUrl) return

      if (!el.paused) {
        // Pause this track
        el.pause()
        void releaseTakePlaybackAudio()
        setSoloPlayIdx(null)
      } else {
        // Pause any currently solo-playing track
        if (soloPlayIdx !== null && soloPlayIdx !== index) {
          const other = playbackVideoRefs.current[soloPlayIdx]
          if (other && !other.paused) {
            other.pause()
          }
        }
        // Start this track from beginning
        el.currentTime = 0
        setSoloPlayIdx(index)
        void playMediaOnUserGesture(el, () => primeTakePlaybackAudio(el))
      }
    },
    [playbackVideoRefs, soloPlayIdx, tracks],
  )

  const handlePlaybackEnded = useCallback(
    (index: number) => {
      setSoloPlayIdx((prev) => (prev === index ? null : prev))
    },
    [],
  )

  const handlePlayStop = useCallback(() => {
    if (isPlaying) {
      stopAll()
    } else {
      setSoloPlayIdx(null)
      playAll()
    }
  }, [isPlaying, playAll, stopAll])

  const dismissError = useCallback(() => setError(null), [setError])

  // ── Render a single track cell ───────────────────────────────────────────

  const renderTrack = (index: 0 | 1 | 2 | 3) => {
    const track = tracks[index]!
    const isExpanded = expandedTrackIndex === index
    const isHidden = expandedTrackIndex >= 0 && expandedTrackIndex !== index

    return (
      <StudioTrackCell
        key={track.id}
        track={track}
        trackIndex={index}
        isExpanded={isExpanded}
        isHidden={isHidden}
        isQuickPlaying={soloPlayIdx === index}
        playbackVideoRef={(el) => {
          playbackVideoRefs.current[index] = el
        }}
        onArm={() => initHardware(track.id)}
        onRecord={() => startRecording(track.id)}
        onStop={stopRecording}
        onClear={() => clearTrack(track.id)}
        onMuteToggle={() => setTrackMuted(track.id, !track.isMuted)}
        onVolumeChange={(v) => setTrackVolume(track.id, v)}
        onQuickPlayToggle={() => handleQuickPlayToggle(index)}
        onPlaybackEnded={() => handlePlaybackEnded(index)}
        onExpand={() => setPreviewIndex(index)}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
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
          <p className="text-[9px] font-medium uppercase tracking-widest text-white/35">Sandbox</p>
        </div>

        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1.5">
          <div
            className={`h-2 w-2 rounded-full transition-all ${
              isCountingIn
                ? 'animate-ping bg-amber-400'
                : isAnyTrackRecording || isPlaying
                  ? 'animate-pulse bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]'
                  : 'bg-white/20'
            }`}
            aria-hidden
          />
          <span className="text-[9px] font-semibold uppercase tracking-wider text-white/40">
            {isCountingIn
              ? 'Count In'
              : isAnyTrackRecording
                ? 'Recording'
                : isPlaying
                  ? 'Playing'
                  : 'Ready'}
          </span>
        </div>
      </header>

      {/* ── 2×2 Camera Grid ───────────────────────────────────────────────── */}
      {/*
        ALL 4 cells are always in the DOM. When a cell is expanded:
          - It uses `absolute inset-0 z-50` (relative to <main>) to fill the area.
          - Other cells use `invisible pointer-events-none` — never unmounted,
            so live MediaStream refs remain attached (prevents iOS black screen).
      */}
      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5">
          <div className="flex min-h-0 flex-1 gap-2.5">
            {renderTrack(0)}
            {renderTrack(1)}
          </div>
          <div className="flex min-h-0 flex-1 gap-2.5">
            {renderTrack(2)}
            {renderTrack(3)}
          </div>
        </div>

        {isCountingIn && currentCount > 0 && <CountInOverlay count={currentCount} />}

        {error && (
          <button
            type="button"
            className="absolute inset-x-4 top-2 z-[70] rounded-xl border border-red-500/40 bg-red-950/90 px-4 py-3 text-left text-xs text-red-300 backdrop-blur-md active:scale-[0.98]"
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
            playbackVideoRefs={playbackVideoRefs}
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
          <button
            type="button"
            aria-label="Open audio mixer"
            onClick={() => setMixerOpen((o) => !o)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-all active:scale-95 ${
              mixerOpen
                ? 'border-sky-400/50 bg-sky-500/15 text-sky-300'
                : 'border-white/12 bg-white/6 text-white/55 hover:bg-white/10'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Mixer
          </button>

          {/* Global Play / Stop */}
          <button
            type="button"
            aria-label={isPlaying ? 'Stop all tracks' : 'Play all tracks'}
            onClick={handlePlayStop}
            disabled={isCountingIn || isAnyTrackRecording || !tracks.some((t) => t.recordedBlobUrl)}
            className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all active:scale-90 disabled:opacity-35 ${
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

      {/* Fullscreen video preview */}
      {previewIndex !== null && tracks[previewIndex] && (
        <FullscreenPreview
          track={tracks[previewIndex]!}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  )
}
