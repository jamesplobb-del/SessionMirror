import { useMemo, useRef, type RefObject } from 'react'
import { Pause, Play } from 'lucide-react'
import LivePitchTuner from '../LivePitchTuner'
import Pressable from '../ui/Pressable'
import { useDrone } from '../../hooks/useDrone'
import {
  useAudioModePlayback,
  type AudioModePlaybackItem,
} from '../../context/AudioModePlaybackContext'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../../utils/takeStorage'
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
}

function buildTunerPlaybackItem({
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

function TunerTakePill({
  label,
  tone,
  item,
  onOpen,
}: {
  label: string
  tone: 'current' | 'best'
  item: AudioModePlaybackItem
  onOpen?: () => void
}) {
  const audioPlayback = useAudioModePlayback()
  const isCurrentItem = audioPlayback.matchesCurrentSource(item)
  const isPlaying = isCurrentItem && audioPlayback.state.isPlaying
  const openItem = () => {
    audioPlayback.select(item)
    onOpen?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`audio-tuner-take-pill audio-tuner-take-pill--${tone}`}
      onClick={openItem}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openItem()
        }
      }}
    >
      <span className="audio-tuner-take-pill__meta">
        <span className="audio-tuner-take-pill__label">{label}</span>
        <span className="audio-tuner-take-pill__name">{item.name}</span>
      </span>
      <Pressable
        type="button"
        intensity="icon"
        haptic="light"
        className="audio-tuner-take-pill__play"
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
        onClick={(event) => {
          event.stopPropagation()
          audioPlayback.toggle(item)
        }}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
        )}
      </Pressable>
    </div>
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

  const benchmarkItem = useMemo(
    () =>
      buildTunerPlaybackItem({
        tone: 'best',
        take: benchmarkTake,
        libraryPlayback: libraryBenchmarkPlayback,
      }),
    [benchmarkTake, libraryBenchmarkPlayback]
  )
  const challengerItem = useMemo(
    () => buildTunerPlaybackItem({ tone: 'current', take: challengerTake }),
    [challengerTake]
  )
  const shouldShowTakePills = showTakeCards && (benchmarkItem || challengerItem)

  return (
    <section
      className={`audio-practice-tuner-shell flex min-h-0 flex-1 flex-col ${
        shouldShowTakePills ? 'audio-practice-tuner-shell--take-pills' : ''
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
      {shouldShowTakePills && (
        <div className="audio-tuner-take-pills" aria-label="Tuner takes">
          {benchmarkItem && (
            <TunerTakePill
              label="Best"
              tone="best"
              item={benchmarkItem}
              onOpen={onExpandBenchmark}
            />
          )}
          {challengerItem && (
            <TunerTakePill
              label="Current"
              tone="current"
              item={challengerItem}
              onOpen={onExpandChallenger}
            />
          )}
        </div>
      )}
    </section>
  )
}
