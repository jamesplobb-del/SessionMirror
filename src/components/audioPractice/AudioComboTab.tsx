import { useEffect, useRef, type RefObject } from 'react'
import LivePitchTuner from '../LivePitchTuner'
import type { Take } from '../../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { takeHasPlaybackMedia } from '../../utils/takes'
import { usePracticeTakePlayback } from '../../hooks/usePracticeTakePlayback'
import AudioPracticeTakeCard from './AudioPracticeTakeCard'
import CompactMetronomeCard from './CompactMetronomeCard'

export interface AudioComboTabProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
  tunerInstrument: TunerInstrument
  liveMicTunerEnabled: boolean
  benchmarkTake: Take | null
  challengerTake: Take | null
  benchmarkId: string | null
  challengerId: string | null
  onPinCurrentAsBest: () => void
  onDiscardCurrentTake: (takeId: string) => void
  onOpenVault: () => void
}

export default function AudioComboTab({
  streamRef,
  streamGeneration,
  ready,
  isRecording,
  tunerInstrument,
  liveMicTunerEnabled,
  benchmarkTake,
  challengerTake,
  benchmarkId,
  challengerId,
  onPinCurrentAsBest,
  onDiscardCurrentTake,
  onOpenVault,
}: AudioComboTabProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const { audioRef, playingTakeId, progress, toggleTakePlayback, stopPlayback } =
    usePracticeTakePlayback()

  const showBest =
    benchmarkTake != null &&
    takeHasPlaybackMedia(benchmarkTake) &&
    benchmarkTake.mediaType !== 'video'
  const showCurrent =
    challengerTake != null &&
    takeHasPlaybackMedia(challengerTake) &&
    challengerId != null &&
    challengerId !== benchmarkId &&
    challengerTake.mediaType !== 'video'

  const compareActive = Boolean(showBest && showCurrent)
  const canMakeBest = Boolean(
    showCurrent && challengerId && challengerId !== benchmarkId,
  )

  const currentSubtitle =
    showCurrent && challengerTake
      ? challengerTake.timestamp > Date.now() - 120_000
        ? 'Just Recorded'
        : challengerTake.name
      : undefined

  useEffect(() => {
    if (isRecording) {
      stopPlayback()
    }
  }, [isRecording, stopPlayback])

  return (
    <section className="audio-practice-combo-shell" aria-label="Tuner, metronome, and take comparison">
      <audio ref={audioRef} className="sr-only" preload="none" playsInline />

      <div className="audio-practice-combo-scroll">
        <div className="audio-practice-combo-card audio-practice-combo-card--tuner">
          <div className="audio-practice-combo-card__header">
            <span className="audio-practice-combo-card__eyebrow">Live Tuner</span>
          </div>
          <div className="audio-practice-combo__tuner-body">
            <LivePitchTuner
              variant="audio"
              mediaRef={mediaRef}
              enabled={ready || isRecording}
              isPlaying={isRecording}
              mediaKey={`combo-tuner-${streamGeneration}`}
              label="Pitch Analysis"
              liveMicEnabled={liveMicTunerEnabled}
              micStreamRef={streamRef}
              liveMicOnly
              tunerInstrument={tunerInstrument}
            />
          </div>
        </div>

        <CompactMetronomeCard />

        <div className="audio-practice-combo__takes">
          <h2 className="audio-practice-combo__takes-title">Take Comparison</h2>

          {showBest && benchmarkTake && (
            <AudioPracticeTakeCard
              variant="best"
              take={benchmarkTake}
              isPlaying={playingTakeId === benchmarkTake.id}
              playbackProgress={playingTakeId === benchmarkTake.id ? progress : 0}
              compareActive={compareActive}
              onPlayToggle={() => {
                if (playingTakeId === benchmarkTake.id) {
                  toggleTakePlayback(benchmarkTake)
                  return
                }
                stopPlayback()
                toggleTakePlayback(benchmarkTake)
              }}
            />
          )}

          {showCurrent && challengerTake && (
            <AudioPracticeTakeCard
              variant="current"
              take={challengerTake}
              subtitle={currentSubtitle}
              isPlaying={playingTakeId === challengerTake.id}
              playbackProgress={playingTakeId === challengerTake.id ? progress : 0}
              canMakeBest={canMakeBest}
              onPlayToggle={() => {
                if (playingTakeId === challengerTake.id) {
                  toggleTakePlayback(challengerTake)
                  return
                }
                stopPlayback()
                toggleTakePlayback(challengerTake)
              }}
              onMakeBest={onPinCurrentAsBest}
              onDiscard={() => onDiscardCurrentTake(challengerTake.id)}
            />
          )}

          {!showBest && !showCurrent && (
            <p className="audio-practice-combo__takes-empty">
              Record a take below to start comparing your progress.
            </p>
          )}

          <button
            type="button"
            className="audio-practice-combo__vault-btn"
            onClick={onOpenVault}
          >
            Open Take Vault
          </button>
        </div>
      </div>
    </section>
  )
}
