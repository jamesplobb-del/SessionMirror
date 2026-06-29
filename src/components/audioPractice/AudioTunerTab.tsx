import { useMemo, useRef, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { Pause, Play, Star, X } from 'lucide-react'
import LivePitchTuner from '../LivePitchTuner'
import Pressable from '../ui/Pressable'
import { useDrone } from '../../hooks/useDrone'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
import { stopEventBubble } from '../../utils/eventBubbling'
import { iosHudDim, motionGpuLayer } from '../../utils/motionPresets'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { DroneWaveform } from '../../utils/droneEngine'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

export interface AudioTunerTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
  tunerInstrument: TunerInstrument
  liveMicTunerEnabled: boolean
  droneVolume: number
  droneWaveform: DroneWaveform
  hapticFeedback: boolean
  showTakeCards?: boolean
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  challengerTake: Take | null
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onPinCurrentAsBest?: () => void
  onClearBenchmark?: () => void
  onClearChallenger?: () => void
}

function TunerTakePill({
  label,
  tone,
  take,
  libraryPlayback = null,
  onOpen,
  onFavorite,
  onClear,
}: {
  label: string
  tone: 'current' | 'best'
  take: Take | null
  libraryPlayback?: LibraryPlaybackReference | null
  onOpen?: () => void
  onFavorite?: () => void
  onClear?: () => void
}) {
  const {
    hasMedia,
    isPlaying,
    playbackProgress,
    displayName,
    togglePlayback,
    openTake,
  } = useAudioModeTakeItem({ tone, take, libraryPlayback })

  return (
    <motion.div
      className={`audio-tuner-take-pill audio-tuner-take-pill--${tone} ${
        hasMedia ? '' : 'audio-tuner-take-pill--empty'
      } ${isPlaying ? 'audio-tuner-take-pill--playing' : ''}`}
      initial={{ opacity: 0, y: 10 }}
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
      <span className="audio-tuner-take-pill__meta">
        <span className="audio-tuner-take-pill__label">{label}</span>
        <span className="audio-tuner-take-pill__name">{displayName}</span>
        {hasMedia && isPlaying && (
          <span
            className="audio-tuner-take-pill__progress"
            aria-hidden
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, playbackProgress))})` }}
          />
        )}
      </span>
      <div className="audio-tuner-take-pill__actions">
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
            <Star className="h-3.5 w-3.5 fill-current" />
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
            <X className="h-3.5 w-3.5" />
          </Pressable>
        )}
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
            <Pause className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          )}
        </Pressable>
      </div>
    </motion.div>
  )
}

export default function AudioTunerTab({
  streamRef,
  streamGeneration,
  ready,
  isRecording,
  tunerInstrument,
  liveMicTunerEnabled: _liveMicTunerEnabled,
  droneVolume,
  droneWaveform,
  hapticFeedback,
  showTakeCards = false,
  benchmarkTake,
  libraryBenchmarkPlayback,
  challengerTake,
  onExpandBenchmark,
  onExpandChallenger,
  onPinCurrentAsBest,
  onClearBenchmark,
  onClearChallenger,
}: AudioTunerTabProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const normalizedVolume = droneVolume / 100

  const drone = useDrone({
    volume: normalizedVolume,
    waveform: droneWaveform,
    hapticFeedback,
  })

  const droneKeyboard = useMemo(
    () => ({
      activeNotes: drone.activeNotes,
      octave: drone.octave,
      onToggleNote: drone.toggleNote,
      onIncrementOctave: drone.incrementOctave,
      onDecrementOctave: drone.decrementOctave,
    }),
    [
      drone.activeNotes,
      drone.decrementOctave,
      drone.incrementOctave,
      drone.octave,
      drone.toggleNote,
    ]
  )

  return (
    <section
      className={`audio-practice-tuner-shell flex min-h-0 flex-1 flex-col ${
        showTakeCards ? 'audio-practice-tuner-shell--take-pills' : ''
      }`}
      aria-label="Tuner"
    >
      <LivePitchTuner
        variant="audio"
        mediaRef={mediaRef}
        enabled
        isPlaying={isRecording}
        mediaKey={`tuner-tab-${streamGeneration}-${ready ? 'live' : 'warm'}`}
        label="Pitch Analysis"
        liveMicEnabled
        micStreamRef={streamRef}
        liveMicOnly
        tunerInstrument={tunerInstrument}
        drone={droneKeyboard}
      />
      {showTakeCards && (
        <div className="audio-tuner-take-pills" aria-label="Tuner takes">
          <TunerTakePill
            label="Best"
            tone="best"
            take={benchmarkTake}
            libraryPlayback={libraryBenchmarkPlayback}
            onOpen={
              libraryBenchmarkPlayback || benchmarkTake ? onExpandBenchmark : undefined
            }
            onClear={onClearBenchmark}
          />
          <TunerTakePill
            label="Current"
            tone="current"
            take={challengerTake}
            onOpen={onExpandChallenger}
            onFavorite={onPinCurrentAsBest}
            onClear={onClearChallenger}
          />
        </div>
      )}
    </section>
  )
}
