import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { LoaderCircle, Pause, Play, RotateCw, Star, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
import { useLiveRecordingWaveform } from '../../hooks/useLiveRecordingWaveform'
import { stopEventBubble } from '../../utils/eventBubbling'
import { triggerDragStartHaptic, triggerLightHaptic } from '../../utils/haptics'
import { readAnalyserMetrics } from '../../utils/audioLevel'
import { getTakePlaybackSpeakerNodes } from '../../utils/takePlaybackSpeaker'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

const EMPTY_WAVEFORM_PEAKS = [
  0.18, 0.28, 0.42, 0.58, 0.72, 0.84, 0.92, 0.98, 0.92, 0.84, 0.72, 0.58, 0.42, 0.28, 0.18, 0.22,
  0.34, 0.48, 0.62, 0.76, 0.88, 0.94, 0.88, 0.76, 0.62, 0.48, 0.34, 0.22, 0.3, 0.44, 0.58, 0.7,
  0.8, 0.88, 0.8, 0.7, 0.58, 0.44, 0.3, 0.24, 0.36, 0.5, 0.64, 0.78, 0.86, 0.78, 0.64, 0.5,
  0.36, 0.24, 0.2, 0.32, 0.46, 0.6, 0.74, 0.86, 0.74, 0.6, 0.46, 0.32, 0.2, 0.26, 0.38, 0.52,
]

/* An empty slot draws a resting line, not the decorative body above. At the
 * half-screen height these cards now get, a fake waveform reads as a real
 * take you could play. */
const RESTING_PEAKS = Array.from({ length: 64 }, () => 0.05)

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '00:00'
  const rounded = Math.max(0, Math.round(seconds))
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

type ScrubPhase = 'start' | 'move' | 'end'

/* —— Waveform silhouette ——
 * Peaks are drawn as one mirrored, curve-smoothed body instead of a row of
 * rectangles. The viewBox is fixed and stretched with preserveAspectRatio,
 * so a card of any height reuses the same geometry and only fills are
 * painted — nothing depends on measuring the element. */
const WAVE_VIEW_WIDTH = 1000
const WAVE_VIEW_HEIGHT = 100
const WAVE_CENTER_Y = WAVE_VIEW_HEIGHT / 2
/** Silence stays a soft spine rather than collapsing into a broken line. */
const WAVE_MIN_HALF = 1.5
const WAVE_MAX_HALF = WAVE_CENTER_Y - 2.5

interface WavePoint {
  x: number
  y: number
}

function waveCoord(value: number): string {
  return value.toFixed(1)
}

/** A light five-tap filter removes the remaining bar-sample corners without
 * flattening the attacks that make two performances look different. */
function smoothWavePeaks(peaks: number[]): number[] {
  if (peaks.length < 3) return peaks
  return peaks.map((peak, index) => {
    const previousTwo = peaks[index - 2] ?? peaks[index - 1] ?? peak
    const previous = peaks[index - 1] ?? peak
    const next = peaks[index + 1] ?? peak
    const nextTwo = peaks[index + 2] ?? next
    return previousTwo * 0.06 + previous * 0.2 + peak * 0.48 + next * 0.2 + nextTwo * 0.06
  })
}

/** Catmull-Rom-to-Bezier interpolation passes through every measured sample,
 * but arrives with a continuous tangent. This keeps transients truthful while
 * giving the silhouette the fluid edge of an oscilloscope trace. */
function curveThroughPoints(points: WavePoint[]): string {
  let path = ''
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const following = points[index + 2] ?? next
    const tension = 0.72 / 6
    const firstControl = {
      x: current.x + (next.x - previous.x) * tension,
      y: current.y + (next.y - previous.y) * tension,
    }
    const secondControl = {
      x: next.x - (following.x - current.x) * tension,
      y: next.y - (following.y - current.y) * tension,
    }
    path += ` C ${waveCoord(firstControl.x)},${waveCoord(firstControl.y)} ${waveCoord(secondControl.x)},${waveCoord(secondControl.y)} ${waveCoord(next.x)},${waveCoord(next.y)}`
  }
  return path
}

function buildWavePath(peaks: number[]): string {
  if (peaks.length === 0) return ''
  const smoothed = smoothWavePeaks(peaks)
  const step =
    smoothed.length > 1 ? WAVE_VIEW_WIDTH / (smoothed.length - 1) : WAVE_VIEW_WIDTH
  const top = smoothed.map((peak, index) => {
    const energy = Math.max(0, Math.min(1, peak))
    return {
      x: index * step,
      y: WAVE_CENTER_Y - (WAVE_MIN_HALF + energy * (WAVE_MAX_HALF - WAVE_MIN_HALF)),
    }
  })
  const bottom = [...top]
    .reverse()
    .map((point) => ({ x: point.x, y: WAVE_VIEW_HEIGHT - point.y }))

  return [
    `M ${waveCoord(top[0].x)},${waveCoord(top[0].y)}`,
    curveThroughPoints(top),
    ` L ${waveCoord(bottom[0].x)},${waveCoord(bottom[0].y)}`,
    curveThroughPoints(bottom),
    ' Z',
  ].join('')
}

function WaveformShape({ peaks, progress = 1 }: { peaks: number[]; progress?: number }) {
  const rawId = useId()
  const path = useMemo(() => buildWavePath(peaks), [peaks])
  const clipId = `${rawId.replace(/:/g, '')}-played`
  const played = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))

  if (!path) return null

  return (
    <svg
      className="audio-wave-shape"
      viewBox={`0 0 ${WAVE_VIEW_WIDTH} ${WAVE_VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={WAVE_VIEW_WIDTH * played} height={WAVE_VIEW_HEIGHT} />
        </clipPath>
      </defs>
      <path className="audio-wave-shape__future" d={path} />
      {played > 0 ? (
        <path className="audio-wave-shape__played" d={path} clipPath={`url(#${clipId})`} />
      ) : null}
    </svg>
  )
}

function AudioRecordingWaveform({
  isRecording,
  ready,
  streamRef,
  streamGeneration,
}: {
  isRecording: boolean
  ready: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
}) {
  const livePeaks = useLiveRecordingWaveform({
    active: ready || isRecording,
    streamRef,
    streamGeneration,
  })

  return (
    <div
      className={`audio-live-wave ${
        isRecording ? 'audio-live-wave--recording' : 'audio-live-wave--idle'
      }`}
      aria-hidden
    >
      <WaveformShape peaks={livePeaks} />
    </div>
  )
}

function AudioWaveform({
  tone,
  active,
  peaks,
  progress,
  playerRef,
  onScrub,
  disabled = false,
  hapticFeedback = true,
}: {
  tone: 'current' | 'best'
  active: boolean
  peaks: number[]
  progress: number
  playerRef: RefObject<HTMLAudioElement | null>
  onScrub: (progress: number, phase: ScrubPhase) => void
  disabled?: boolean
  hapticFeedback?: boolean
}) {
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(safeProgress)
  const hapticMilestoneRef = useRef(-1)
  const displayedProgress = dragProgress ?? safeProgress
  progressRef.current = safeProgress

  /* The speaker route already owns an analyser to keep iOS playback healthy.
   * Reusing it lets the visual follow the sound without adding another audio
   * graph. If that analyser is unavailable, the playhead samples the decoded
   * waveform so native/fallback playback still has sound-shaped movement. */
  useEffect(() => {
    const element = waveformRef.current
    if (!element) return

    const resetMotion = () => {
      element.style.setProperty('--audio-wave-energy', '0')
      element.style.setProperty('--audio-wave-scale', '1')
      element.style.setProperty('--audio-wave-glow', '0px')
    }

    if (!active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      resetMotion()
      return
    }

    let animationFrame = 0
    let analyser: AnalyserNode | null = null
    let sampleBuffer: Float32Array | null = null
    let envelope = 0
    let lastPainted = -1

    const fallbackLevel = (player: HTMLAudioElement | null): number => {
      if (peaks.length === 0) return 0
      const duration = player && Number.isFinite(player.duration) ? player.duration : 0
      const position = player && duration > 0 ? player.currentTime / duration : progressRef.current
      const index = Math.max(0, Math.min(peaks.length - 1, Math.floor(position * peaks.length)))
      return Math.max(0, Math.min(1, (peaks[index] - 0.05) / 0.95))
    }

    const tick = () => {
      const player = playerRef.current
      if (!analyser && player) {
        analyser = getTakePlaybackSpeakerNodes(player)?.keepAliveAnalyser ?? null
      }

      let target = fallbackLevel(player)
      if (analyser) {
        if (!sampleBuffer || sampleBuffer.length !== analyser.fftSize) {
          sampleBuffer = new Float32Array(analyser.fftSize)
        }
        const { rms, peak } = readAnalyserMetrics(analyser, sampleBuffer)
        const combined = Math.max(rms, peak * 0.38)
        const decibels = 20 * Math.log10(Math.max(combined, 1e-6))
        target = Math.pow(Math.max(0, Math.min(1, (decibels + 50) / 40)), 0.74)
      }

      const response = target >= envelope ? 0.58 : 0.13
      envelope += (target - envelope) * response

      if (Math.abs(envelope - lastPainted) > 0.006) {
        const energy = Math.max(0, Math.min(1, envelope))
        element.style.setProperty('--audio-wave-energy', energy.toFixed(3))
        element.style.setProperty('--audio-wave-scale', (0.965 + energy * 0.105).toFixed(3))
        element.style.setProperty('--audio-wave-glow', `${(0.5 + energy * 4.5).toFixed(1)}px`)
        lastPainted = envelope
      }

      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      resetMotion()
    }
  }, [active, peaks, playerRef])

  const updateDragProgress = (clientX: number, rect: DOMRect, phase: ScrubPhase) => {
    const nextProgress = rect.width > 0
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      : displayedProgress
    setDragProgress(nextProgress)
    onScrub(nextProgress, phase)
    if (phase !== 'move' || !hapticFeedback) return
    const milestone = Math.floor(nextProgress * 4)
    if (milestone !== hapticMilestoneRef.current) {
      hapticMilestoneRef.current = milestone
      triggerLightHaptic(true)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    hapticMilestoneRef.current = -1
    if (hapticFeedback) void triggerDragStartHaptic()
    updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'start')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'move')
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'end')
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragProgress(null)
    hapticMilestoneRef.current = -1
    triggerLightHaptic(hapticFeedback)
    event.stopPropagation()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = event.shiftKey ? 0.1 : 0.025
    let nextProgress: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextProgress = Math.max(0, displayedProgress - step)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextProgress = Math.min(1, displayedProgress + step)
    } else if (event.key === 'Home') {
      nextProgress = 0
    } else if (event.key === 'End') {
      nextProgress = 1
    }
    if (nextProgress === null) return
    event.preventDefault()
    event.stopPropagation()
    onScrub(nextProgress, 'start')
    onScrub(nextProgress, 'end')
    triggerLightHaptic(hapticFeedback)
  }

  return (
    <div
      ref={waveformRef}
      className={`audio-mode-waveform audio-mode-waveform--${tone} ${
        active ? 'audio-mode-waveform--active' : ''
      } ${dragProgress !== null ? 'audio-mode-waveform--scrubbing' : ''} ${
        disabled ? 'audio-mode-waveform--disabled' : ''
      }`}
      role="slider"
      aria-label={`${tone === 'best' ? 'Best' : 'Current'} take waveform`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(displayedProgress * 100)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onClick={stopEventBubble}
    >
      <WaveformShape peaks={peaks} progress={displayedProgress} />
      <span className="audio-mode-waveform__playhead" style={{ left: `${displayedProgress * 100}%` }} />
    </div>
  )
}

interface AudioModeTakeCardProps {
  label: string
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
  onOpen?: () => void
  onFavorite?: () => void
  onClear?: () => void
  readiness?: { status: 'preparing' | 'ready' | 'error'; durationSeconds?: number; message?: string }
  onRetryPreparation?: () => void
  hapticFeedback?: boolean
  /** Shown in place of a subtitle when the slot has nothing in it yet. */
  emptyHint?: string
  /** Current is the recorder: it owns the live mic body and the elapsed clock. */
  stage?: boolean
  isRecording?: boolean
  elapsed?: number
  micReady?: boolean
  liveWaveform?: ReactNode
}

function AudioModeTakeCard({
  label,
  tone,
  take,
  libraryPlayback = null,
  onOpen,
  onFavorite,
  onClear,
  readiness,
  onRetryPreparation,
  hapticFeedback = true,
  emptyHint,
  stage = false,
  isRecording = false,
  elapsed = 0,
  micReady = false,
  liveWaveform,
}: AudioModeTakeCardProps) {
  const {
    playbackItem,
    hasMedia,
    isPlaying,
    durationSeconds,
    currentTime,
    playbackProgress,
    displayName,
    togglePlayback,
    openTake,
    audioPlayback,
    isCurrentItem,
  } = useAudioModeTakeItem({ tone, take, libraryPlayback })
  const isPreparing = readiness?.status === 'preparing'
  const preparationFailed = readiness?.status === 'error'
  const playable = hasMedia && !isPreparing && !preparationFailed
  const knownDurationSeconds = readiness?.durationSeconds ?? take?.duration ?? durationSeconds
  const waveformDurationSeconds =
    Number.isFinite(knownDurationSeconds) && (knownDurationSeconds ?? 0) > 0
      ? knownDurationSeconds ?? 0
      : 0
  const waveformProgress =
    waveformDurationSeconds > 0 && Number.isFinite(currentTime)
      ? Math.max(0, Math.min(1, currentTime / waveformDurationSeconds))
      : playbackProgress
  const waveformPeaks = useMediaWaveform({
    filePath: playable ? playbackItem?.filePath ?? '' : '',
    mediaUrl: playable ? playbackItem?.mediaUrl ?? '' : '',
    barCount: 64,
  })
  const displayPeaks = !hasMedia
    ? RESTING_PEAKS
    : waveformPeaks.length > 0
      ? waveformPeaks
      : EMPTY_WAVEFORM_PEAKS

  const handleWaveformScrub = useCallback(
    (progress: number, phase: ScrubPhase) => {
      if (!playable || !playbackItem) return
      if (waveformDurationSeconds <= 0) {
        if (phase === 'start') audioPlayback.play(playbackItem)
        return
      }
      const nextTime = progress * waveformDurationSeconds
      if (isCurrentItem || audioPlayback.matchesCurrentSource(playbackItem)) {
        audioPlayback.seek(nextTime)
      } else if (phase === 'start') {
        audioPlayback.play(playbackItem, { startTime: nextTime })
      }
    },
    [audioPlayback, isCurrentItem, playable, playbackItem, waveformDurationSeconds],
  )

  /* Live mic energy replaces the stored body while recording, and while Current
   * is still empty — that is what makes the card read as the recorder. */
  const liveStage = stage && (isRecording || !playable)
  const subtitle = isPreparing
    ? 'Preparing playback…'
    : preparationFailed
      ? readiness?.message ?? 'Playback preparation failed.'
      : stage && isRecording
        ? null
        : playable
          ? null
          : stage && !micReady
            ? 'Preparing microphone…'
            : emptyHint ?? 'Ready for a new take'

  return (
    <article
      className={`audio-mode-take-card audio-mode-take-card--${tone} ${
        hasMedia ? '' : 'audio-mode-take-card--empty'
      } ${isPreparing ? 'audio-mode-take-card--preparing' : ''} ${
        preparationFailed ? 'audio-mode-take-card--error' : ''
      } ${stage ? 'audio-mode-take-card--stage' : ''} ${
        stage && isRecording ? 'audio-mode-take-card--recording' : ''
      }`}
      onClick={() => {
        if (playable && onOpen) openTake(onOpen)
      }}
    >
      <div className="audio-mode-take-card__chrome">
        <span className="audio-mode-take-card__pill">{label}</span>
        <div className="audio-mode-take-card__actions">
          {tone === 'current' && playable ? (
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              onClick={(event) => {
                event.stopPropagation()
                onFavorite?.()
              }}
              className="audio-mode-take-card__mini-btn audio-mode-take-card__mini-btn--best"
              aria-label="Pin Current Take as Best Take"
            >
              <Star className="h-4 w-4 fill-current" />
            </Pressable>
          ) : null}
          {hasMedia ? (
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              onClick={(event) => {
                event.stopPropagation()
                onClear?.()
              }}
              className="audio-mode-take-card__mini-btn"
              aria-label={`Clear ${label}`}
            >
              <X className="h-4 w-4" />
            </Pressable>
          ) : null}
        </div>
      </div>

      <div className="audio-mode-take-card__media">
        {!hasMedia && !preparationFailed ? null : (
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          haptic="light"
          disabled={!playable && !preparationFailed}
          onClick={(event) => {
            event.stopPropagation()
            if (preparationFailed) onRetryPreparation?.()
            else if (playable) togglePlayback()
          }}
          onPointerDown={stopEventBubble}
          className="audio-mode-take-card__play"
          aria-label={
            isPreparing
              ? 'Preparing take playback'
              : preparationFailed
                ? 'Retry preparing take playback'
                : isPlaying
                  ? 'Pause take'
                  : 'Play take'
          }
        >
          {isPreparing ? (
            <LoaderCircle className="h-5 w-5 animate-spin" strokeWidth={2.2} />
          ) : preparationFailed ? (
            <RotateCw className="h-5 w-5" strokeWidth={2.2} />
          ) : isPlaying ? (
            <Pause className="h-5 w-5 fill-[#171A22]" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-[#171A22]" />
          )}
        </Pressable>
        )}
        <div className="audio-mode-take-card__playback-column">
          <div className="audio-mode-take-card__title-row">
            <div className="audio-mode-take-card__title-copy">
              <div className="audio-mode-take-card__name-line">
                <h3>{stage && isRecording ? 'Recording' : displayName}</h3>
                {stage && isRecording ? (
                  <span className="audio-mode-take-card__duration">
                    <span aria-hidden />
                    {formatDuration(elapsed)}
                  </span>
                ) : playable ? (
                  <span className="audio-mode-take-card__duration">
                    <span aria-hidden />
                    {formatDuration(knownDurationSeconds)}
                  </span>
                ) : null}
              </div>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          {liveWaveform ? (
            <div
              className={`audio-mode-take-card__live ${
                liveStage ? 'audio-mode-take-card__live--visible' : ''
              }`}
            >
              {liveWaveform}
            </div>
          ) : null}
          {liveStage || !hasMedia ? null : (
            <AudioWaveform
              tone={tone}
              active={isPlaying}
              peaks={displayPeaks}
              progress={playable ? waveformProgress : 0}
              playerRef={audioPlayback.playerRef}
              onScrub={handleWaveformScrub}
              disabled={!playable}
              hapticFeedback={hapticFeedback}
            />
          )}
        </div>
      </div>
    </article>
  )
}

interface AudioModeHomeProps {
  isRecording: boolean
  elapsed: number
  ready: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  challengerTake: Take | null
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onPinCurrentAsBest?: () => void
  onClearBenchmark?: () => void
  onClearChallenger?: () => void
  takeReadiness?: Record<string, { status: 'preparing' | 'ready' | 'error'; durationSeconds?: number; message?: string }>
  onRetryTakePreparation?: (takeId: string) => void
  hapticFeedback?: boolean
}

function AudioModeHome({
  isRecording,
  elapsed,
  ready,
  streamRef,
  streamGeneration,
  challengerTake,
  benchmarkTake,
  libraryBenchmarkPlayback,
  onExpandBenchmark,
  onExpandChallenger,
  onPinCurrentAsBest,
  onClearBenchmark,
  onClearChallenger,
  takeReadiness = {},
  onRetryTakePreparation,
  hapticFeedback = true,
}: AudioModeHomeProps) {
  return (
    <section className="audio-mode-home audio-mode-home--inplace pointer-events-auto">
      <div className="audio-mode-take-stack">
        <AudioModeTakeCard
          label="Best Take"
          tone="best"
          take={benchmarkTake}
          libraryPlayback={libraryBenchmarkPlayback}
          onOpen={Boolean(libraryBenchmarkPlayback || benchmarkTake) ? onExpandBenchmark : undefined}
          onClear={onClearBenchmark}
          readiness={benchmarkTake ? takeReadiness[benchmarkTake.id] : undefined}
          onRetryPreparation={
            benchmarkTake ? () => onRetryTakePreparation?.(benchmarkTake.id) : undefined
          }
          hapticFeedback={hapticFeedback}
          emptyHint="Star a take to set your benchmark"
        />
        <AudioModeTakeCard
          label="Current Take"
          tone="current"
          take={challengerTake}
          onOpen={onExpandChallenger}
          onFavorite={onPinCurrentAsBest}
          onClear={onClearChallenger}
          readiness={challengerTake ? takeReadiness[challengerTake.id] : undefined}
          onRetryPreparation={
            challengerTake ? () => onRetryTakePreparation?.(challengerTake.id) : undefined
          }
          hapticFeedback={hapticFeedback}
          stage
          isRecording={isRecording}
          elapsed={elapsed}
          micReady={ready}
          liveWaveform={
            <AudioRecordingWaveform
              isRecording={isRecording}
              ready={ready}
              streamRef={streamRef}
              streamGeneration={streamGeneration}
            />
          }
        />
      </div>
    </section>
  )
}

export default memo(AudioModeHome)
