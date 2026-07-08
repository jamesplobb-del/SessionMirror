import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Star, X } from 'lucide-react'
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
  hapticFeedback?: boolean
}

type ScrubPhase = 'start' | 'move' | 'end'

function AudioWaveform({
  tone,
  active,
  peaks,
  progress,
  onScrub,
  hapticFeedback = true,
}: {
  tone: 'current' | 'best'
  active: boolean
  peaks: number[]
  progress: number
  onScrub: (progress: number, phase: ScrubPhase) => void
  hapticFeedback?: boolean
}) {
  const safeProgress = Math.max(0, Math.min(1, progress))
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
      } ${dragProgress !== null ? 'audio-mode-waveform--scrubbing' : ''}`}
      role="slider"
      aria-label="Take waveform"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(displayedProgress * 100)}
      tabIndex={0}
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
  hapticFeedback = true,
}: AudioModeTakeCardProps) {
  const {
    playbackItem,
    hasMedia,
    isPlaying,
    durationSeconds,
    playbackProgress,
    displayName,
    togglePlayback,
    openTake,
    audioPlayback,
    isCurrentItem,
  } = useAudioModeTakeItem({ tone, take, libraryPlayback })
  const timestamp = take?.timestamp
  const waveformPeaks = useMediaWaveform({
    filePath: playbackItem?.filePath ?? '',
    mediaUrl: playbackItem?.mediaUrl ?? '',
    barCount: 64,
  })
  const displayPeaks = waveformPeaks.length > 0 ? waveformPeaks : EMPTY_WAVEFORM_PEAKS

  useEffect(() => {
    if (!playbackItem) return
    audioPlayback.prime(playbackItem)
  }, [audioPlayback.prime, playbackItem])

  const handleWaveformScrub = useCallback(
    (progress: number, phase: ScrubPhase) => {
      if (!playbackItem) return
      if (durationSeconds <= 0) {
        if (phase === 'start') audioPlayback.play(playbackItem)
        return
      }
      const nextTime = progress * durationSeconds
      if (isCurrentItem || audioPlayback.matchesCurrentSource(playbackItem)) {
        audioPlayback.seek(nextTime)
      } else if (phase === 'start') {
        audioPlayback.play(playbackItem, { startTime: nextTime })
      }
    },
    [audioPlayback, durationSeconds, isCurrentItem, playbackItem]
  )

  return (
    <motion.article
      className={`audio-mode-take-card audio-mode-take-card--${tone} ${
        hasMedia ? '' : 'audio-mode-take-card--empty'
      }`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosHudDim}
      style={motionGpuLayer}
      onClick={() => openTake(onOpen)}
    >
      <div className="audio-mode-take-card__chrome">
        <span className="audio-mode-take-card__pill">{label}</span>
        <div className="audio-mode-take-card__actions">
          {tone === 'current' && hasMedia && (
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
            {timestamp ? `Today, ${formatTakeTime(timestamp)}` : 'Ready for a new take'}
            {hasMedia ? `  •  ${formatDuration(durationSeconds)}` : ''}
          </p>
        </div>
      </div>

      <div className="audio-mode-take-card__media">
        <AudioWaveform
          tone={tone}
          active={isPlaying}
          peaks={displayPeaks}
          progress={hasMedia ? playbackProgress : 0}
          onScrub={handleWaveformScrub}
          hapticFeedback={hapticFeedback}
        />
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          haptic="light"
          disabled={!hasMedia}
          onClick={(event) => {
            event.stopPropagation()
            togglePlayback()
          }}
          onPointerDown={stopEventBubble}
          className="audio-mode-take-card__play"
          aria-label={isPlaying ? 'Pause take' : 'Play take'}
        >
          {isPlaying ? (
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
          hapticFeedback={hapticFeedback}
        />
        <AudioModeTakeCard
          label="Current Take"
          tone="current"
          take={challengerTake}
          onOpen={onExpandChallenger}
          onFavorite={onPinCurrentAsBest}
          onClear={onClearChallenger}
          hapticFeedback={hapticFeedback}
        />
      </div>
    </section>
  )
}

export default memo(AudioModeHome)
