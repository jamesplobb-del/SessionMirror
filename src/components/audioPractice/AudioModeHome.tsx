import { memo, useCallback, useMemo, type PointerEvent } from 'react'
import { motion } from 'framer-motion'
import { Ellipsis, Mic, Pause, Play, Star } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { stopEventBubble } from '../../utils/eventBubbling'
import {
  useAudioModePlayback,
  type AudioModePlaybackItem,
} from '../../context/AudioModePlaybackContext'
import { iosHudDim, motionGpuLayer } from '../../utils/motionPresets'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../../utils/takeStorage'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

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
}

function buildPlaybackItem({
  tone,
  take,
  libraryPlayback,
}: {
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
}): AudioModePlaybackItem | null {
  const mediaUrl = libraryPlayback?.playbackUrl ?? take?.videoUrl ?? ''
  const filePath = libraryPlayback?.filePath ?? take?.filePath ?? ''
  if (!mediaUrl && !filePath) return null

  return {
    id: libraryPlayback ? `library:${libraryPlayback.id}` : `take:${take?.id ?? tone}`,
    takeId: take?.id,
    name: libraryPlayback?.name ?? take?.name ?? (tone === 'best' ? 'Best Take' : 'Current Take'),
    filePath,
    mediaUrl,
    mimeType:
      libraryPlayback?.mimeType ??
      take?.videoMimeType ??
      (take?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME),
  }
}

function AudioWaveform({
  tone,
  active,
  peaks,
  progress,
  onScrub,
}: {
  tone: 'current' | 'best'
  active: boolean
  peaks: number[]
  progress: number
  onScrub: (clientX: number, rect: DOMRect) => void
}) {
  const safeProgress = Math.max(0, Math.min(1, progress))

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onScrub(event.clientX, event.currentTarget.getBoundingClientRect())
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    onScrub(event.clientX, event.currentTarget.getBoundingClientRect())
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    event.stopPropagation()
  }

  return (
    <div
      className={`audio-mode-waveform audio-mode-waveform--${tone} ${active ? 'audio-mode-waveform--active' : ''}`}
      role="slider"
      aria-label="Take waveform"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeProgress * 100)}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {peaks.map((peak, index) => (
        <span
          key={index}
          className={
            index / Math.max(1, peaks.length - 1) > safeProgress
              ? 'audio-mode-waveform__bar audio-mode-waveform__bar--future'
              : 'audio-mode-waveform__bar'
          }
          style={{
            height: `${Math.round(14 + peak * 78)}%`,
            animationDelay: active ? `${index * 18}ms` : undefined,
          }}
        />
      ))}
      <span className="audio-mode-waveform__playhead" style={{ left: `${safeProgress * 100}%` }} />
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
}: AudioModeTakeCardProps) {
  const audioPlayback = useAudioModePlayback()
  const playbackItem = useMemo(
    () => buildPlaybackItem({ tone, take, libraryPlayback }),
    [libraryPlayback, take, tone],
  )
  const title = libraryPlayback?.name ?? take?.name ?? (tone === 'best' ? 'No Best Take' : 'No Current Take')
  const timestamp = take?.timestamp
  const hasMedia = Boolean(playbackItem)
  const isCurrentItem = playbackItem ? audioPlayback.matchesCurrentSource(playbackItem) : false
  const isPlaying = isCurrentItem && audioPlayback.state.isPlaying
  const durationSeconds = isCurrentItem ? audioPlayback.state.duration : 0
  const currentTime = isCurrentItem ? audioPlayback.state.currentTime : 0
  const waveformPeaks = useMediaWaveform({
    filePath: playbackItem?.filePath ?? '',
    mediaUrl: playbackItem?.mediaUrl ?? '',
    barCount: 64,
  })
  const playbackProgress = durationSeconds > 0 ? currentTime / durationSeconds : 0

  const togglePlayback = useCallback(() => {
    if (!playbackItem) return
    audioPlayback.toggle(playbackItem)
  }, [audioPlayback, playbackItem])

  const handleWaveformScrub = useCallback(
    (clientX: number, rect: DOMRect) => {
      if (!playbackItem || durationSeconds <= 0 || rect.width <= 0) return
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const nextTime = progress * durationSeconds
      if (isCurrentItem) {
        audioPlayback.seek(nextTime)
      } else {
        audioPlayback.play(playbackItem, { startTime: nextTime })
      }
    },
    [audioPlayback, durationSeconds, isCurrentItem, playbackItem],
  )

  return (
    <motion.article
      className={`audio-mode-take-card audio-mode-take-card--${tone} ${hasMedia ? '' : 'audio-mode-take-card--empty'}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosHudDim}
      style={motionGpuLayer}
      onClick={() => {
        if (!playbackItem) return
        audioPlayback.select(playbackItem)
        onOpen?.()
      }}
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
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            onClick={(event) => event.stopPropagation()}
            className="audio-mode-take-card__mini-btn"
            aria-label="More take actions"
          >
            <Ellipsis className="h-4 w-4" />
          </Pressable>
        </div>
      </div>

      <div className="audio-mode-take-card__title-row">
        <div className="min-w-0">
          <h3>{title}</h3>
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
          peaks={waveformPeaks}
          progress={playbackProgress}
          onScrub={handleWaveformScrub}
        />
        <Pressable
          type="button"
          intensity="icon"
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
          {isPlaying ? <Pause className="h-6 w-6 fill-white" /> : <Play className="ml-0.5 h-6 w-6 fill-white" />}
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
}: AudioModeHomeProps) {
  const status = isRecording ? 'Recording...' : ready ? 'Ready to record' : 'Preparing audio'
  const hint = isRecording ? 'Listening now' : 'Tap the mic to start'
  const bestHasMedia = Boolean(libraryBenchmarkPlayback || benchmarkTake)

  const meterBars = useMemo(
    () => Array.from({ length: 18 }, (_, index) => 8 + ((index * 7) % 22)),
    [],
  )

  return (
    <section className="audio-mode-home pointer-events-auto">
      <motion.div
        className={`audio-mode-hero ${isRecording ? 'audio-mode-hero--recording' : ''}`}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={iosHudDim}
      >
        <div className="audio-mode-mic-orb" aria-hidden>
          <Mic className="h-14 w-14" strokeWidth={2.1} />
        </div>
        <div className="audio-mode-meter" aria-hidden>
          {meterBars.map((height, index) => (
            <span
              key={index}
              style={{
                height,
                animationDelay: isRecording ? `${index * 45}ms` : undefined,
              }}
            />
          ))}
        </div>
        <h2>{status}</h2>
        <p>{hint}</p>
      </motion.div>

      <div className="audio-mode-take-stack">
        <AudioModeTakeCard
          label="Best Take"
          tone="best"
          take={benchmarkTake}
          libraryPlayback={libraryBenchmarkPlayback}
          onOpen={bestHasMedia ? onExpandBenchmark : undefined}
        />
        <AudioModeTakeCard
          label="Current Take"
          tone="current"
          take={challengerTake}
          onOpen={onExpandChallenger}
          onFavorite={onPinCurrentAsBest}
        />
      </div>
    </section>
  )
}

export default memo(AudioModeHome)
