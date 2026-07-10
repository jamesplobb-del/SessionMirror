import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { motion } from 'framer-motion'
import { LoaderCircle, Pause, Play, RotateCw, Star, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import AudioModeHeroMic from './AudioModeHeroMic'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
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

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '00:00'
  const rounded = Math.max(0, Math.round(seconds))
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatTakeTime(timestamp?: number): string {
  if (!timestamp) return 'Today'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
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
            height: `${Math.round(14 + peak * 78)}%`,
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
  const timestamp = take?.timestamp
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
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
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

      <div className="audio-mode-take-card__title-row">
        <div className="min-w-0">
          <h3>{displayName}</h3>
          <p>
            {isPreparing
              ? 'Preparing playback...'
              : preparationFailed
                ? readiness?.message ?? 'Playback preparation failed.'
                : timestamp
                  ? `Today, ${formatTakeTime(timestamp)}`
                  : 'Ready for a new take'}
            {playable ? `  •  ${formatDuration(knownDurationSeconds)}` : ''}
          </p>
        </div>
      </div>

      <div className="audio-mode-take-card__media">
        <AudioWaveform
          tone={tone}
          active={isPlaying}
          peaks={displayPeaks}
          progress={playable ? waveformProgress : 0}
          onScrub={handleWaveformScrub}
          disabled={!playable}
          hapticFeedback={hapticFeedback}
        />
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
      </div>
    </motion.article>
  )
}

interface AudioModeHomeProps {
  isRecording: boolean
  ready: boolean
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
  ready,
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
  const status = isRecording ? 'Recording...' : ready ? 'Ready to record' : 'Preparing audio'
  const hint = isRecording ? 'Listening now' : 'Tap the mic to start'

  return (
    <section className="audio-mode-home pointer-events-auto">
      <motion.div
        className={`audio-mode-hero ${isRecording ? 'audio-mode-hero--recording' : ''}`}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={iosHudDim}
      >
        <AudioModeHeroMic isRecording={isRecording} />
        <h2>{status}</h2>
        <p>{hint}</p>
      </motion.div>

      <div className="audio-mode-take-stack">
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
      </div>
    </section>
  )
}

export default memo(AudioModeHome)
