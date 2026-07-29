import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { motion } from 'framer-motion'
import { LoaderCircle, Pause, Play, RotateCw, Star, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
import { useLiveRecordingWaveform } from '../../hooks/useLiveRecordingWaveform'
import { stopEventBubble } from '../../utils/eventBubbling'
import { triggerDragStartHaptic, triggerLightHaptic } from '../../utils/haptics'
import { iosHudDim, motionGpuLayer } from '../../utils/motionPresets'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

const EMPTY_WAVEFORM_PEAKS = [
  0.18, 0.28, 0.42, 0.58, 0.72, 0.84, 0.92, 0.98, 0.92, 0.84, 0.72, 0.58, 0.42, 0.28, 0.18, 0.22,
  0.34, 0.48, 0.62, 0.76, 0.88, 0.94, 0.88, 0.76, 0.62, 0.48, 0.34, 0.22, 0.3, 0.44, 0.58, 0.7, 0.8,
  0.88, 0.8, 0.7, 0.58, 0.44, 0.3, 0.24, 0.36, 0.5, 0.64, 0.78, 0.86, 0.78, 0.64, 0.5, 0.36, 0.24,
  0.2, 0.32, 0.46, 0.6, 0.74, 0.86, 0.74, 0.6, 0.46, 0.32, 0.2, 0.26, 0.38, 0.52, 0.66, 0.8,
]

const LIVE_WAVEFORM_FUTURE_PEAKS = [
  0.055, 0.045, 0.07, 0.04, 0.06, 0.035, 0.05, 0.04, 0.065, 0.035, 0.055, 0.04, 0.05, 0.035, 0.045,
  0.04, 0.035, 0.04,
]
const MIN_VISIBLE_WAVEFORM_PEAK = 0.035

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '00:00'
  const rounded = Math.max(0, Math.round(seconds))
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
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
}

type ScrubPhase = 'start' | 'move' | 'end'

function AudioRecordingWaveform({
  isRecording,
  streamRef,
  streamGeneration,
}: {
  isRecording: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
}) {
  const livePeaks = useLiveRecordingWaveform({
    active: isRecording,
    streamRef,
    streamGeneration,
  })
  const displayedPeaks = isRecording
    ? [...livePeaks, ...LIVE_WAVEFORM_FUTURE_PEAKS]
    : EMPTY_WAVEFORM_PEAKS

  return (
    <div
      className={`audio-recording-waveform ${
        isRecording ? 'audio-recording-waveform--recording' : ''
      }`}
      aria-hidden
    >
      {displayedPeaks.map((peak, index) => {
        const isFuture = isRecording && index >= livePeaks.length
        const isCurrent = isRecording && index === livePeaks.length - 1
        return (
          <span
            key={index}
            className={`audio-recording-waveform__bar ${
              isFuture ? 'audio-recording-waveform__bar--future' : ''
            } ${isCurrent ? 'audio-recording-waveform__bar--current' : ''}`}
            style={{
              '--audio-recording-peak': Math.max(MIN_VISIBLE_WAVEFORM_PEAK, peak),
            } as CSSProperties}
          />
        )
      })}
      {isRecording && <span className="audio-recording-waveform__live-edge" />}
    </div>
  )
}

function AudioWaveform({
  tone,
  active,
  peaks,
  progress,
  onScrub,
  disabled = false,
  hapticFeedback = true,
}: {
  tone: 'current' | 'best'
  active: boolean
  peaks: number[]
  progress: number
  onScrub: (progress: number, phase: ScrubPhase) => void
  disabled?: boolean
  hapticFeedback?: boolean
}) {
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const dragProgressRef = useRef(safeProgress)
  const hapticMilestoneRef = useRef(-1)
  const displayedProgress = dragProgress ?? safeProgress

  const updateDragProgress = (
    clientX: number,
    rect: DOMRect,
    phase: ScrubPhase,
  ) => {
    const nextProgress = rect.width > 0
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      : displayedProgress
    dragProgressRef.current = nextProgress
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
    if (hapticFeedback) {
      void triggerDragStartHaptic()
    }
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
      className={`audio-mode-waveform audio-mode-waveform--${tone} ${
        active ? 'audio-mode-waveform--active' : ''
      } ${dragProgress !== null ? 'audio-mode-waveform--scrubbing' : ''} ${
        disabled ? 'audio-mode-waveform--disabled' : ''
      }`}
      role="slider"
      aria-label="Take waveform"
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
      {peaks.map((peak, index) => (
        <span
          key={index}
          className={
            index / Math.max(1, peaks.length - 1) > displayedProgress
              ? 'audio-mode-waveform__bar audio-mode-waveform__bar--future'
              : 'audio-mode-waveform__bar'
          }
          style={{
            height: `${Math.round(5 + peak * 25)}px`,
            animationDelay: active ? `${index * 18}ms` : undefined,
          }}
        />
      ))}
      <span className="audio-mode-waveform__playhead" style={{ left: `${displayedProgress * 100}%` }} />
    </div>
  )
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
  const knownDurationSeconds = readiness?.durationSeconds ?? durationSeconds
  const waveformDurationSeconds =
    Number.isFinite(knownDurationSeconds) && knownDurationSeconds > 0 ? knownDurationSeconds : 0
  const waveformProgress =
    waveformDurationSeconds > 0 && Number.isFinite(currentTime)
      ? Math.max(0, Math.min(1, currentTime / waveformDurationSeconds))
      : playbackProgress
  const waveformPeaks = useMediaWaveform({
    filePath: playable ? playbackItem?.filePath ?? '' : '',
    mediaUrl: playable ? playbackItem?.mediaUrl ?? '' : '',
    barCount: 64,
  })
  const displayPeaks = waveformPeaks.length > 0 ? waveformPeaks : EMPTY_WAVEFORM_PEAKS

  useEffect(() => {
    if (!playable || !playbackItem) return
    audioPlayback.prime(playbackItem)
  }, [audioPlayback.prime, playable, playbackItem])

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
    [audioPlayback, isCurrentItem, playable, playbackItem, waveformDurationSeconds]
  )

  return (
    <motion.article
      className={`audio-mode-take-card audio-mode-take-card--${tone} ${
        hasMedia ? '' : 'audio-mode-take-card--empty'
      } ${isPreparing ? 'audio-mode-take-card--preparing' : ''} ${
        preparationFailed ? 'audio-mode-take-card--error' : ''
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={iosHudDim}
      style={motionGpuLayer}
      onClick={() => {
        if (playable) openTake(onOpen)
      }}
    >
      <div className="audio-mode-take-card__chrome">
        <span className="audio-mode-take-card__pill">{label}</span>
        <div className="audio-mode-take-card__actions">
          {tone === 'current' && playable && (
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
          )}
          {hasMedia && (
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
          )}
        </div>
      </div>

      <div className="audio-mode-take-card__media">
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          haptic="light"
          disabled={!playable && !preparationFailed}
          onClick={(event) => {
            event.stopPropagation()
            if (preparationFailed) {
              onRetryPreparation?.()
              return
            }
            if (playable) togglePlayback()
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
        <div className="audio-mode-take-card__playback-column">
          <div className="audio-mode-take-card__title-row">
            <div className="audio-mode-take-card__title-copy">
              <div className="audio-mode-take-card__name-line">
                <h3>{displayName}</h3>
                {playable && (
                  <span className="audio-mode-take-card__duration">
                    <span aria-hidden />
                    {formatDuration(knownDurationSeconds)}
                  </span>
                )}
              </div>
              {!playable && (
                <p>
                  {isPreparing
                    ? 'Preparing playback...'
                    : preparationFailed
                      ? readiness?.message ?? 'Playback preparation failed.'
                      : 'Ready for a new take'}
                </p>
              )}
            </div>
          </div>
          <AudioWaveform
            tone={tone}
            active={isPlaying}
            peaks={displayPeaks}
            progress={playable ? waveformProgress : 0}
            onScrub={handleWaveformScrub}
            disabled={!playable}
            hapticFeedback={hapticFeedback}
          />
        </div>
      </div>
    </motion.article>
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
  const status = isRecording ? 'Recording' : ready ? 'Ready' : 'Preparing'
  const hint = isRecording ? 'Recording audio… tap stop when finished' : 'Tap the mic to start recording'

  return (
    <section className="audio-mode-home pointer-events-auto">
      <motion.div
        className={`audio-mode-hero ${isRecording ? 'audio-mode-hero--recording' : ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={iosHudDim}
      >
        <div
          className={`audio-mode-status-pill ${
            isRecording ? 'audio-mode-status-pill--recording' : ''
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="audio-mode-status-pill__dot" aria-hidden />
          <strong>{status}</strong>
          <span className="audio-mode-status-pill__divider" aria-hidden />
          <time>{formatDuration(isRecording ? elapsed : 0)}</time>
        </div>
        <AudioRecordingWaveform
          isRecording={isRecording}
          streamRef={streamRef}
          streamGeneration={streamGeneration}
        />
        <p>{hint}</p>
      </motion.div>

      <div className="audio-mode-take-stack">
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
        />
        <AudioModeTakeCard
          label="Best Take"
          tone="best"
          take={benchmarkTake}
          libraryPlayback={libraryBenchmarkPlayback}
          onOpen={
            Boolean(libraryBenchmarkPlayback || benchmarkTake) ? onExpandBenchmark : undefined
          }
          onClear={onClearBenchmark}
          readiness={benchmarkTake ? takeReadiness[benchmarkTake.id] : undefined}
          onRetryPreparation={
            benchmarkTake ? () => onRetryTakePreparation?.(benchmarkTake.id) : undefined
          }
          hapticFeedback={hapticFeedback}
        />
      </div>
    </section>
  )
}

export default memo(AudioModeHome)
