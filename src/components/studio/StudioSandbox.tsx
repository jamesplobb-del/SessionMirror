import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { MouseEvent, PointerEvent } from 'react'
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

// ─── Accent palette (mirrors Best Take / Current Take PiP) ───────────────────

const TRACK_ACCENTS = [
  { ring: 'ring-sky-400/50',     badge: 'bg-sky-500/90',     label: 'text-sky-300'     },
  { ring: 'ring-violet-400/50',  badge: 'bg-violet-500/90',  label: 'text-violet-300'  },
  { ring: 'ring-emerald-400/50', badge: 'bg-emerald-500/90', label: 'text-emerald-300' },
  { ring: 'ring-orange-400/50',  badge: 'bg-orange-500/90',  label: 'text-orange-300'  },
] as const

const FLOAT_BTN =
  'flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-black/90 active:scale-90'

// ─── Waveform decoration ─────────────────────────────────────────────────────

function makePeaks(seed: number, n = 60): number[] {
  return Array.from({ length: n }, (_, i) =>
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
          opacity={0.7}
          rx={0.1}
        />
      ))}
    </svg>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ─── Studio Track Cell ────────────────────────────────────────────────────────

/** grid = normal 2×2 tile · fullscreen = recording overlay · hidden-playback = off-screen media only */
type CellLayout = 'grid' | 'fullscreen' | 'hidden-playback'

interface StudioTrackCellProps {
  track: StudioTrack
  trackIndex: number
  layout?: CellLayout
  playbackVideoRef: (el: HTMLMediaElement | null) => void
  onArm: () => void
  onRecord: () => void
  onStop: () => void
  onClear: () => void
  onMuteToggle: () => void
  onVolumeChange: (volume: number) => void
  onExpand: () => void
}

function StudioTrackCell({
  track,
  trackIndex,
  layout = 'grid',
  playbackVideoRef,
  onArm,
  onRecord,
  onStop,
  onClear,
  onMuteToggle,
  onVolumeChange,
  onExpand,
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

  // Keep the engine's ref array in sync — useLayoutEffect ensures the
  // TakeVideoPlayer ref is already assigned before we propagate it.
  useLayoutEffect(() => {
    playbackVideoRef(playbackRef.current)
  })

  // Live camera stream
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

  // Sync play/poster state from the playback media element
  useEffect(() => {
    const media = playbackRef.current
    if (!media || !hasRecording) {
      setIsPlaying(false)
      setShowPoster(true)
      return
    }

    const sync = () => {
      const playing = !media.paused && !media.ended
      setIsPlaying(playing)
      setShowPoster(!playing)
    }

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

  // ── Quick play — shared handler for both onClick and MiniPipControls ────────
  // Using a generic SyntheticEvent base so it satisfies both callers.
  const doPlayPause = useCallback(() => {
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
  }, [])

  const handlePlayPauseClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); doPlayPause() },
    [doPlayPause],
  )

  const handlePlayPausePip = useCallback(
    (_e: PointerEvent<HTMLButtonElement>) => { doPlayPause() },
    [doPlayPause],
  )

  const handleVolume = useCallback(
    (value: number) => onVolumeChange(value),
    [onVolumeChange],
  )

  const isFullscreen = layout === 'fullscreen'
  const isHiddenPlayback = layout === 'hidden-playback'
  const containerRing = isRecording
    ? 'ring-red-500/60 border-red-400/70'
    : `${accent.ring} border-white/15`

  // Off-screen mount — keeps backing-track <video> refs alive during recording
  if (isHiddenPlayback) {
    if (!hasRecording || !track.recordedBlobUrl) return null
    return (
      <div aria-hidden className="studio-track-cell--hidden-playback">
        <TakeVideoPlayer
          filePath=""
          videoUrl={track.recordedBlobUrl}
          videoRef={playbackRef}
          videoSourceKey={videoSourceKey}
          className="h-px w-px"
          loadingClassName="h-px w-px"
          mirror
          controls={false}
          manualPlayOnly
          audible={!track.isMuted}
          eagerLoad
          preload="auto"
        />
      </div>
    )
  }

  return (
    <div
      className={`studio-track-cell group relative min-h-0 ${
        isFullscreen ? 'h-full w-full flex-1' : 'flex-1'
      }`}
    >
      {/* Inner video container */}
      <div
        className={`relative h-full w-full overflow-hidden border bg-stone-900/95 shadow-lg shadow-black/50 transition-[box-shadow,border-color] duration-200 ${containerRing} ${
          isFullscreen ? 'rounded-none ring-0' : 'rounded-xl ring-1 shadow-black/50'
        } ${isRecording ? 'studio-track-cell--recording' : ''}`}
      >
        {/* Track label — top-left, inside overflow clip */}
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

        {/* Recorded playback (mirrored like in-app takes) */}
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

        {/* Thumbnail poster */}
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

        {/* Tap-to-expand — whole video area, sits below the play button */}
        {hasRecording && (
          <button
            type="button"
            className="absolute inset-0 z-[4] cursor-pointer border-0 bg-transparent p-0"
            onClick={onExpand}
            aria-label={`Open ${track.label} fullscreen`}
          />
        )}

        {/* Center quick-play button — plain onClick so iOS touch works */}
        {hasRecording && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            <button
              type="button"
              onClick={handlePlayPauseClick}
              className={`pointer-events-auto absolute left-1/2 top-1/2 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center p-3 transition-opacity ${
                isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
              }`}
              aria-label={isPlaying ? 'Pause track' : 'Play track'}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/65 shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm transition hover:bg-black/80">
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-white text-white" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-white text-white" style={{ marginLeft: 1 }} />
                )}
              </span>
            </button>
          </div>
        )}

        {/* Bottom hover volume strip */}
        {hasRecording && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/65 px-2.5 py-1.5 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MiniPipControls
              isPlaying={isPlaying}
              volume={track.isMuted ? 0 : track.volume}
              onPlayPauseClick={handlePlayPausePip}
              onVolumeChange={handleVolume}
            />
          </div>
        )}
      </div>

      {/* ── Floating top-RIGHT controls — outside overflow clip ────────────── */}
      <div className="absolute right-1.5 top-1.5 z-30 flex gap-1.5">
        {/* Clear / delete */}
        {hasRecording && !isRecording && (
          <button type="button" aria-label={`Clear ${track.label}`} onClick={onClear} className={FLOAT_BTN}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Mute */}
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

        {/* Arm / Record (empty or live-preview state) */}
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

        {/* Stop recording */}
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
  // Poll currentTime / duration from DOM elements via rAF
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

  const handleSeek = (idx: number, value: number) => {
    const el = playbackVideoRefs.current[idx]
    if (el) el.currentTime = value
  }

  return (
    <>
      {/* Scrim */}
      <div className="absolute inset-0 z-30 bg-black/55" onClick={onClose} aria-hidden />

      {/* Sheet */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex max-h-[80%] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-900 shadow-2xl backdrop-blur-xl">
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 pb-3 pt-2">
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
        <div className="flex-1 overflow-y-auto">
          {tracks.map((track, idx) => {
            const hasAudio = !!track.recordedBlobUrl
            const vol = Math.round(track.volume * 100)
            const pos = positions[track.id]
            const accent = TRACK_ACCENTS[idx % TRACK_ACCENTS.length]!
            const scrubMax = pos?.duration ?? 0
            const scrubVal = pos?.time ?? 0

            return (
              <div
                key={track.id}
                className={`px-4 py-3.5 ${idx < tracks.length - 1 ? 'border-b border-white/6' : ''}`}
              >
                {/* Row header: thumbnail + label + mute */}
                <div className="mb-2.5 flex items-center gap-3">
                  {track.thumbnailUrl ? (
                    <img
                      src={track.thumbnailUrl}
                      alt=""
                      className="h-9 w-14 shrink-0 rounded-md border border-white/12 object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md border border-white/10 bg-stone-800/70">
                      <User className="h-4 w-4 text-white/20" />
                    </div>
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-[11px] font-bold ${accent.label}`}>{track.label}</span>
                    <span className="text-[9px] tabular-nums text-white/30">
                      {hasAudio ? `Vol ${vol}%` : 'No recording'}
                    </span>
                  </div>

                  <button
                    type="button"
                    aria-label={track.isMuted ? 'Unmute' : 'Mute'}
                    onClick={() => onMuteToggle(track.id)}
                    disabled={!hasAudio}
                    className={`${FLOAT_BTN} h-8 w-8 shrink-0 disabled:opacity-25 ${
                      track.isMuted ? 'border-amber-400/60 bg-amber-500/90 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : ''
                    }`}
                  >
                    {track.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5 text-white/70" />}
                  </button>
                </div>

                {/* Volume fader */}
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-[8px] font-semibold text-white/30">
                    VOL
                  </span>
                  <div className="relative flex-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={vol}
                      disabled={!hasAudio}
                      onChange={(e) => onVolumeChange(track.id, Number(e.target.value) / 100)}
                      aria-label={`${track.label} volume`}
                      className="studio-vol-slider w-full disabled:opacity-30"
                      style={{ accentColor: track.color }}
                    />
                  </div>
                  <span className="w-7 shrink-0 text-left text-[9px] tabular-nums text-white/40">
                    {vol}%
                  </span>
                </div>

                {/* Scrub / seek bar */}
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-[8px] font-semibold text-white/30">
                    {hasAudio ? fmtTime(scrubVal) : '--'}
                  </span>
                  <div className="relative flex-1">
                    {hasAudio ? (
                      <input
                        type="range"
                        min={0}
                        max={scrubMax || 1}
                        step={0.01}
                        value={scrubVal}
                        onChange={(e) => handleSeek(idx, Number(e.target.value))}
                        aria-label={`${track.label} seek`}
                        className="studio-scrubber w-full"
                      />
                    ) : (
                      /* Static decoration when empty */
                      <div className="relative h-6 overflow-hidden rounded">
                        <MiniWaveform peaks={PEAKS[idx] ?? []} color={track.color} />
                        <div className="absolute inset-0 bg-black/30" />
                      </div>
                    )}
                  </div>
                  <span className="w-7 shrink-0 text-left text-[9px] tabular-nums text-white/40">
                    {hasAudio ? fmtTime(scrubMax) : '--'}
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

  // Auto-play when overlay opens
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
      {/* Video */}
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

      {/* Transparent tap area — play/pause on tap anywhere */}
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent p-0"
        onClick={handlePlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      />

      {/* Top bar — close + label */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className={`${FLOAT_BTN} h-9 w-9`}
          aria-label="Close fullscreen"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70 backdrop-blur-sm">
          {track.label}
        </span>
        {/* Empty spacer to balance flex */}
        <div className="h-9 w-9" />
      </div>

      {/* Center play/pause indicator (fades in/out) */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-opacity duration-300 ${
            isPlaying ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Play className="h-7 w-7 fill-white text-white" style={{ marginLeft: 3 }} />
        </div>
      </div>

      {/* Bottom safe-area spacer */}
      <div
        className="absolute bottom-0 inset-x-0 z-20"
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
          className="font-black leading-none tabular-nums text-white"
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

  const isAnyTrackRecording = tracks.some((t) => t.isRecording)

  /** Index of the track that owns the full-screen recording overlay (-1 = grid mode). */
  const expandedTrackIndex = useMemo(() => {
    const recording = tracks.findIndex((t) => t.isRecording)
    if (recording >= 0) return recording
    if (isCountingIn) {
      const armed = tracks.findIndex((t) => !!t.stream && !t.recordedBlobUrl)
      if (armed >= 0) return armed
    }
    return -1
  }, [tracks, isCountingIn])

  const isExpanded = expandedTrackIndex >= 0

  const handlePlayStop = useCallback(() => {
    if (isPlaying) stopAll()
    else playAll()
  }, [isPlaying, playAll, stopAll])

  const dismissError = useCallback(() => setError(null), [setError])

  const renderTrack = (index: 0 | 1 | 2 | 3, layout: CellLayout = 'grid') => {
    const track = tracks[index]!
    return (
      <StudioTrackCell
        key={`${track.id}-${layout}`}
        track={track}
        trackIndex={index}
        layout={layout}
        playbackVideoRef={(el) => { playbackVideoRefs.current[index] = el }}
        onArm={() => initHardware(track.id)}
        onRecord={() => startRecording(track.id)}
        onStop={stopRecording}
        onClear={() => clearTrack(track.id)}
        onMuteToggle={() => setTrackMuted(track.id, !track.isMuted)}
        onVolumeChange={(v) => setTrackVolume(track.id, v)}
        onExpand={() => setPreviewIndex(index)}
      />
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
            {isCountingIn ? 'Count In' : isAnyTrackRecording ? 'Recording' : isPlaying ? 'Playing' : 'Ready'}
          </span>
        </div>
      </header>

      {/* ── 2×2 Camera Grid ──────────────────────────────────────────────────── */}
      <main className="relative flex min-h-0 flex-1 flex-col">
        {/* Full-screen recording / count-in overlay — only the active track */}
        {isExpanded && (
          <div className="absolute inset-0 z-50 flex flex-col bg-black">
            {renderTrack(expandedTrackIndex as 0 | 1 | 2 | 3, 'fullscreen')}
          </div>
        )}

        {/* Normal 2×2 grid — fully unmounted while a track is expanded */}
        {!isExpanded && (
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
        )}

        {/* Hidden backing-track players — keep sync playback alive during recording */}
        {isExpanded && (
          <div aria-hidden className="studio-track-cell--hidden-playback">
            {tracks.map((t, i) =>
              i !== expandedTrackIndex && t.recordedBlobUrl
                ? renderTrack(i as 0 | 1 | 2 | 3, 'hidden-playback')
                : null,
            )}
          </div>
        )}

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

      {/* ── Transport Bar ────────────────────────────────────────────────────── */}
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
