import { Pause, Play } from 'lucide-react'
import { useCallback } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { triggerMediumHaptic } from '../../utils/haptics'
import { getBeatsPerBar } from '../../utils/metronomeConfig'
import { clampAudioPracticeBpm } from './audioPracticeMetronome'

export default function CompactMetronomeCard() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const {
    bpm,
    meter,
    playing,
    beatIndex,
    beatPulseId,
    setBpm,
    togglePlay,
  } = useMetronome()

  const beatsPerBar = getBeatsPerBar(meter)

  const handleTogglePlay = useCallback(() => {
    triggerMediumHaptic()
    togglePlay()
  }, [togglePlay])

  const adjustBpm = useCallback(
    (delta: number) => {
      setBpm(clampAudioPracticeBpm(bpm + delta))
    },
    [bpm, setBpm],
  )

  return (
    <section className="audio-practice-combo-card audio-practice-combo-card--metronome" aria-label="Metronome">
      <div className="audio-practice-combo-card__header">
        <span className="audio-practice-combo-card__eyebrow">Metronome</span>
        <span className="audio-practice-combo-card__meter">{meter}</span>
      </div>

      <div className="audio-practice-combo-metronome__row">
        <div className="audio-practice-combo-metronome__bpm-block">
          <button
            type="button"
            className="audio-practice-combo-metronome__step"
            aria-label="Decrease tempo"
            onClick={() => adjustBpm(-1)}
          >
            −
          </button>
          <div className="audio-practice-combo-metronome__bpm">
            <span className="audio-practice-combo-metronome__bpm-value">{bpm}</span>
            <span className="audio-practice-combo-metronome__bpm-label">BPM</span>
          </div>
          <button
            type="button"
            className="audio-practice-combo-metronome__step"
            aria-label="Increase tempo"
            onClick={() => adjustBpm(1)}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`audio-practice-combo-metronome__play ${playing ? 'audio-practice-combo-metronome__play--active' : ''}`}
          aria-label={playing ? 'Stop metronome' : 'Start metronome'}
          onClick={handleTogglePlay}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
      </div>

      <div
        className={`audio-practice-combo-metronome__beats ${playing ? 'audio-practice-combo-metronome__beats--playing' : ''} ${prefersReducedMotion ? 'audio-practice-combo-metronome__beats--reduced-motion' : ''}`}
        aria-live="polite"
      >
        {Array.from({ length: beatsPerBar }, (_, beat) => {
          const isActive = playing && beatIndex === beat
          const isDownbeat = beat === 0
          return (
            <span
              key={`${beatPulseId}-${beat}`}
              className={[
                'audio-practice-combo-metronome__beat',
                isActive ? 'audio-practice-combo-metronome__beat--active' : '',
                isDownbeat ? 'audio-practice-combo-metronome__beat--downbeat' : '',
                isActive && isDownbeat ? 'audio-practice-combo-metronome__beat--pulse' : '',
                isActive && !isDownbeat ? 'audio-practice-combo-metronome__beat--pulse-soft' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          )
        })}
      </div>

      <p className="sr-only">
        Tempo {bpm} beats per minute, time signature {meter}
        {playing ? ', playing' : ', stopped'}
      </p>
    </section>
  )
}
