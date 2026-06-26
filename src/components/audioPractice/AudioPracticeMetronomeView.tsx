import { Minus, Pause, Play, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { useTapTempo } from '../../hooks/useTapTempo'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { triggerLightHaptic, triggerMediumHaptic } from '../../utils/haptics'
import {
  getBeatsPerBar,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import IOSSwitch from '../ui/IOSSwitch'
import {
  AUDIO_PRACTICE_CLICK_SOUNDS,
  AUDIO_PRACTICE_MAX_BPM,
  AUDIO_PRACTICE_METERS,
  AUDIO_PRACTICE_MIN_BPM,
  AUDIO_PRACTICE_SUBDIVISIONS,
  clampAudioPracticeBpm,
  type AudioPracticeClickSoundId,
} from './audioPracticeMetronome'

function PracticeControlButton({
  label,
  active = false,
  onPress,
  children,
  className = '',
}: {
  label: string
  active?: boolean
  onPress: () => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onPointerUp={(event) => {
        if (event.button !== 0) return
        triggerLightHaptic()
        onPress()
      }}
      className={`metronome-audio-stage__btn pointer-events-auto interactive-native ${active ? 'metronome-audio-stage__btn--active' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export default function AudioPracticeMetronomeView() {
  const bpmInputId = useId()
  const prefersReducedMotion = usePrefersReducedMotion()
  const didNormalizeBpmRef = useRef(false)
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const [pulseNonce, setPulseNonce] = useState(0)

  const {
    bpm,
    meter,
    subdivision,
    accentFirstBeat,
    soundId,
    playing,
    beatIndex,
    setBpm,
    setMeter,
    setSubdivision,
    setAccentFirstBeat,
    setSoundId,
    togglePlay,
    stop,
  } = useMetronome({
    isTakePlaying: false,
    muteDuringPlayback: false,
    debugLabel: 'MetronomeTab',
  })

  const setPracticeBpm = useCallback(
    (value: number) => {
      setBpm(clampAudioPracticeBpm(value))
    },
    [setBpm],
  )

  const { registerTap } = useTapTempo(
    (nextBpm) => {
      triggerLightHaptic()
      setPracticeBpm(nextBpm)
    },
    { minBpm: AUDIO_PRACTICE_MIN_BPM, maxBpm: AUDIO_PRACTICE_MAX_BPM },
  )

  const beatsPerBar = getBeatsPerBar(meter)

  useEffect(() => {
    if (didNormalizeBpmRef.current) return
    didNormalizeBpmRef.current = true
    if (bpm < AUDIO_PRACTICE_MIN_BPM || bpm > AUDIO_PRACTICE_MAX_BPM) {
      setPracticeBpm(bpm)
    }
  }, [bpm, setPracticeBpm])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  useEffect(() => {
    if (!playing) return
    setPulseNonce((nonce) => nonce + 1)
  }, [beatIndex, playing])

  const handleTogglePlay = useCallback(() => {
    triggerMediumHaptic()
    togglePlay()
  }, [togglePlay])

  const handleMeterChange = useCallback(
    (nextMeter: MetronomeMeter) => {
      if (nextMeter === meter) return
      setMeter(nextMeter)
    },
    [meter, setMeter],
  )

  const handleSubdivisionChange = useCallback(
    (nextSubdivision: MetronomeSubdivision) => {
      if (nextSubdivision === subdivision) return
      setSubdivision(nextSubdivision)
    },
    [setSubdivision, subdivision],
  )

  const handleAccentChange = useCallback(
    (nextAccent: boolean) => {
      setAccentFirstBeat(nextAccent)
    },
    [setAccentFirstBeat],
  )

  const handleSoundChange = useCallback(
    (nextSoundId: AudioPracticeClickSoundId) => {
      if (nextSoundId === soundId) return
      setSoundId(nextSoundId)
    },
    [setSoundId, soundId],
  )

  const adjustBpm = useCallback(
    (delta: number) => {
      triggerLightHaptic()
      setPracticeBpm(bpm + delta)
    },
    [bpm, setPracticeBpm],
  )

  const openBpmEditor = useCallback(() => {
    if (playing) stop()
    setBpmDraft(String(bpm))
    setEditingBpm(true)
  }, [bpm, playing, stop])

  const commitBpmDraft = useCallback(() => {
    const parsed = Number.parseInt(bpmDraft, 10)
    if (Number.isFinite(parsed)) {
      triggerLightHaptic()
      setPracticeBpm(parsed)
    }
    setEditingBpm(false)
  }, [bpmDraft, setPracticeBpm])

  const isDownbeatPulse = playing && beatIndex === 0
  const pulseClass = isDownbeatPulse && accentFirstBeat
    ? 'audio-practice-metronome__pulse--accent'
    : 'audio-practice-metronome__pulse--beat'

  return (
    <div
      className="metronome-audio-stage audio-practice-metronome flex min-h-0 flex-1 flex-col overflow-hidden"
      data-practice-mode="metronome-tab"
    >
      <div className="audio-practice-metronome__body min-h-0 flex-1">
        <header className="metronome-audio-stage__hero shrink-0">
        <div className="audio-practice-metronome__bpm-row">
          <PracticeControlButton
            label="Decrease tempo"
            onPress={() => adjustBpm(-1)}
            className="audio-practice-metronome__step-btn"
          >
            <Minus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </PracticeControlButton>

          <div className="audio-practice-metronome__bpm-center">
            {editingBpm ? (
              <input
                id={bpmInputId}
                type="number"
                inputMode="numeric"
                min={AUDIO_PRACTICE_MIN_BPM}
                max={AUDIO_PRACTICE_MAX_BPM}
                value={bpmDraft}
                autoFocus
                onChange={(event) => setBpmDraft(event.target.value)}
                onBlur={commitBpmDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitBpmDraft()
                  if (event.key === 'Escape') setEditingBpm(false)
                }}
                className="metronome-audio-stage__bpm-input pointer-events-auto"
                aria-label="Beats per minute"
              />
            ) : (
              <button
                type="button"
                className="metronome-audio-stage__bpm pointer-events-auto"
                aria-label={`${bpm} beats per minute. Tap to edit.`}
                onPointerUp={(event) => {
                  if (event.button !== 0) return
                  openBpmEditor()
                }}
              >
                <span className="metronome-audio-stage__bpm-value">{bpm}</span>
                <span className="metronome-audio-stage__bpm-label">BPM</span>
              </button>
            )}
          </div>

          <PracticeControlButton
            label="Increase tempo"
            onPress={() => adjustBpm(1)}
            className="audio-practice-metronome__step-btn"
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </PracticeControlButton>
        </div>

        <div className="audio-practice-metronome__actions">
          <PracticeControlButton
            label="Tap tempo"
            onPress={registerTap}
            className="metronome-audio-stage__tap-btn audio-practice-metronome__tap-btn"
          >
            Tap Tempo
          </PracticeControlButton>

          <PracticeControlButton
            label={playing ? 'Stop metronome' : 'Start metronome'}
            onPress={handleTogglePlay}
            className={`metronome-audio-stage__play-btn audio-practice-metronome__play-btn ${playing ? 'metronome-audio-stage__btn--active' : ''}`}
          >
            {playing ? (
              <Pause className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            ) : (
              <Play className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            )}
          </PracticeControlButton>
        </div>
      </header>

      <div className="metronome-audio-stage__beats min-h-0 flex-1" aria-live="polite" aria-atomic>
        <div className="audio-practice-metronome__visual">
          <div
            key={pulseNonce}
            className={[
              'audio-practice-metronome__pulse',
              playing ? pulseClass : '',
              playing && !prefersReducedMotion ? 'audio-practice-metronome__pulse--animate' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          />
          <div
            className={`metronome-audio-stage__beat-row audio-practice-metronome__beat-row ${playing ? 'metronome-audio-stage__beat-row--playing' : ''} ${prefersReducedMotion ? 'metronome-audio-stage__beat-row--reduced-motion' : ''}`}
            role="group"
            aria-label="Beat indicators"
          >
            {Array.from({ length: beatsPerBar }, (_, index) => {
              const isActive = playing && beatIndex === index
              const isDownbeat = index === 0 && accentFirstBeat
              return (
                <span
                  key={index}
                  className={[
                    'audio-practice-metronome__beat',
                    isActive ? 'audio-practice-metronome__beat--active' : '',
                    isDownbeat ? 'audio-practice-metronome__beat--downbeat' : '',
                    isActive && isDownbeat ? 'metronome-audio-stage__beat-dot--pulse' : '',
                    isActive && !isDownbeat ? 'metronome-audio-stage__beat-dot--pulse-soft' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="audio-practice-metronome__beat-number" aria-hidden>
                    {index + 1}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
      </div>

      <footer className="metronome-audio-stage__controls audio-practice-metronome__controls shrink-0">
        <div className="metronome-audio-stage__control-row" role="group" aria-label="Time signature">
          {AUDIO_PRACTICE_METERS.map((value) => (
            <PracticeControlButton
              key={value}
              label={`${value} meter`}
              active={meter === value}
              onPress={() => handleMeterChange(value)}
              className="metronome-audio-stage__meter-btn"
            >
              {value}
            </PracticeControlButton>
          ))}
        </div>

        <div
          className="metronome-audio-stage__control-row metronome-audio-stage__control-row--subdivisions"
          role="group"
          aria-label="Subdivisions"
        >
          {AUDIO_PRACTICE_SUBDIVISIONS.map(({ value, label }) => (
            <PracticeControlButton
              key={value}
              label={`${label} subdivisions`}
              active={subdivision === value}
              onPress={() => handleSubdivisionChange(value)}
              className="metronome-audio-stage__subdivision-btn"
            >
              {label}
            </PracticeControlButton>
          ))}
        </div>

        <div className="metronome-audio-stage__toggle-row pointer-events-auto">
          <span className="metronome-audio-stage__toggle-label">Accent First Beat</span>
          <IOSSwitch
            checked={accentFirstBeat}
            onChange={handleAccentChange}
            ariaLabel="Accent first beat"
          />
        </div>

        <div
          className="metronome-audio-stage__control-row metronome-audio-stage__control-row--sounds"
          role="group"
          aria-label="Metronome click sound"
        >
          {AUDIO_PRACTICE_CLICK_SOUNDS.map(({ id, label }) => (
            <PracticeControlButton
              key={id}
              label={`${label} click sound`}
              active={soundId === id}
              onPress={() => handleSoundChange(id)}
              className="metronome-audio-stage__sound-btn"
            >
              {label}
            </PracticeControlButton>
          ))}
        </div>
      </footer>
    </div>
  )
}
