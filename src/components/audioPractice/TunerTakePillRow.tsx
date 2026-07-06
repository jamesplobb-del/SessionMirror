import { motion } from 'framer-motion'
import { Pause, Play, Star, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
import { stopEventBubble } from '../../utils/eventBubbling'
import { iosHudDim, motionGpuLayer } from '../../utils/motionPresets'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

function TunerTakePill({
  label,
  tone,
  take,
  libraryPlayback = null,
  compact = false,
  onOpen,
  onFavorite,
  onClear,
}: {
  label: string
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
  compact?: boolean
  onOpen?: () => void
  onFavorite?: () => void
  onClear?: () => void
}) {
  const {
    hasMedia,
    isPlaying,
    playbackProgress,
    displayName: fullDisplayName,
    togglePlayback,
    openTake,
  } = useAudioModeTakeItem({ tone, take, libraryPlayback })

  const displayNameRaw = fullDisplayName
  const visibleName = compact
    ? displayNameRaw.length > 11
      ? `${displayNameRaw.slice(0, 10).trimEnd()}…`
      : displayNameRaw
    : displayNameRaw

  return (
    <motion.div
      className={`audio-tuner-take-pill audio-tuner-take-pill--${tone} ${
        compact ? 'audio-tuner-take-pill--compact' : ''
      } ${hasMedia ? '' : 'audio-tuner-take-pill--empty'} ${isPlaying ? 'audio-tuner-take-pill--playing' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosHudDim}
      style={motionGpuLayer}
      role="button"
      tabIndex={hasMedia ? 0 : -1}
      aria-disabled={!hasMedia}
      onClick={() => openTake(onOpen)}
      onKeyDown={(event) => {
        if (!hasMedia) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openTake(onOpen)
        }
      }}
    >
      <div className="audio-tuner-take-pill__leading">
        <div className="audio-tuner-take-pill__copy">
          <span className="audio-tuner-take-pill__label">{label}</span>
          <span className="audio-tuner-take-pill__name" title={displayNameRaw}>
            {visibleName}
          </span>
        </div>
        {hasMedia && isPlaying && (
          <span
            className="audio-tuner-take-pill__progress"
            aria-hidden
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, playbackProgress))})` }}
          />
        )}
      </div>
      <div className="audio-tuner-take-pill__trailing">
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
          className="audio-tuner-take-pill__play"
          aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
        >
          {isPlaying ? (
            <Pause className={compact ? 'h-3 w-3 fill-current' : 'h-3.5 w-3.5 fill-current'} />
          ) : (
            <Play className={compact ? 'h-3 w-3 fill-current' : 'h-3.5 w-3.5 fill-current'} />
          )}
        </Pressable>
        {tone === 'current' && hasMedia && (
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            onClick={(event) => {
              event.stopPropagation()
              onFavorite?.()
            }}
            onPointerDown={stopEventBubble}
            className="audio-tuner-take-pill__mini-btn audio-tuner-take-pill__mini-btn--best"
            aria-label="Pin Current Take as Best Take"
          >
            <Star className={compact ? 'h-3 w-3 fill-current' : 'h-3.5 w-3.5 fill-current'} />
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
            onPointerDown={stopEventBubble}
            className="audio-tuner-take-pill__mini-btn"
            aria-label={`Clear ${label}`}
          >
            <X className={compact ? 'h-3 w-3 fill-current' : 'h-3.5 w-3.5 fill-current'} />
          </Pressable>
        )}
      </div>
    </motion.div>
  )
}

export interface TunerTakePillRowProps {
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  challengerTake: Take | null
  compact?: boolean
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onPinCurrentAsBest?: () => void
  onClearBenchmark?: () => void
  onClearChallenger?: () => void
}

export default function TunerTakePillRow({
  benchmarkTake,
  libraryBenchmarkPlayback,
  challengerTake,
  compact = false,
  onExpandBenchmark,
  onExpandChallenger,
  onPinCurrentAsBest,
  onClearBenchmark,
  onClearChallenger,
}: TunerTakePillRowProps) {
  return (
    <div
      className={`audio-tuner-take-pills ${compact ? 'audio-tuner-take-pills--compact' : ''}`}
      aria-label="Tuner takes"
    >
      <TunerTakePill
        label={compact ? 'Best' : 'Best'}
        tone="best"
        take={benchmarkTake}
        libraryPlayback={libraryBenchmarkPlayback}
        compact={compact}
        onOpen={libraryBenchmarkPlayback || benchmarkTake ? onExpandBenchmark : undefined}
        onClear={onClearBenchmark}
      />
      <TunerTakePill
        label={compact ? 'Now' : 'Current'}
        tone="current"
        take={challengerTake}
        compact={compact}
        onOpen={onExpandChallenger}
        onFavorite={onPinCurrentAsBest}
        onClear={onClearChallenger}
      />
    </div>
  )
}
