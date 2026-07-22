import { ChevronsUpDown, Minus, Pause, Play, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { useTapTempo } from '../../hooks/useTapTempo'
import {
  triggerLightHaptic,
  triggerMetronomeTapHaptic,
  triggerMetronomeToggleHaptic,
} from '../../utils/haptics'
import {
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import {
  AUDIO_PRACTICE_CLICK_SOUNDS,
  AUDIO_PRACTICE_MAX_BPM,
  AUDIO_PRACTICE_MIN_BPM,
  PRACTICE_ALL_METERS,
  clampAudioPracticeBpm,
  getPracticeFeelOptions,
  getPracticePulseModeOptions,
  getPracticeRhythmOptions,
  practiceMeterHasPulseChoice,
  type AudioPracticeClickSoundId,
} from './audioPracticeMetronome'
import MetronomeAudioSelect from './MetronomeAudioSelect'
import MetronomeBeatDisplay from './MetronomeBeatDisplay'

const TEMPO_PIXELS_PER_BPM = 5

function PracticeControlButton({
  label,
  active = false,
  haptic = 'light',
  onPress,
  children,
  className = '',
}: {
  label: string
  active?: boolean
  haptic?: 'light' | false
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
        if (haptic === 'light') triggerLightHaptic()
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
  const didNormalizeBpmRef = useRef(false)
  const tempoDragRef = useRef<{
    pointerId: number
    lastY: number
    accumulatedPixels: number
    lastBpm: number
    moved: boolean
  } | null>(null)
  const currentBpmRef = useRef(0)
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const [tempoScrubbing, setTempoScrubbing] = useState(false)

  const {
    bpm,
    meter,
    subdivision,
    feelId,
    pulseModeId,
    bpmSymbol,
    soundId,
    playing,
    setBpm,
    setMeter,
    setSubdivision,
    setFeel,
    setPulseMode,
    setSoundId,
    togglePlay,
    stop,
  } = useMetronome()

  const setPracticeBpm = useCallback(
    (value: number) => {
      setBpm(clampAudioPracticeBpm(value))
    },
    [setBpm],
  )

  const { registerTap } = useTapTempo(
    (nextBpm) => {
      setPracticeBpm(nextBpm)
    },
    { minBpm: AUDIO_PRACTICE_MIN_BPM, maxBpm: AUDIO_PRACTICE_MAX_BPM },
  )

  const feelOptions = getPracticeFeelOptions(meter, pulseModeId)
  const rhythmOptions = getPracticeRhythmOptions(meter, pulseModeId)
  const pulseModeOptions = practiceMeterHasPulseChoice(meter)
    ? getPracticePulseModeOptions(meter)
    : []
  const showBeatGrouping =
    feelOptions.length > 1 && (meter.endsWith('/8') || meter.endsWith('/16'))

  useEffect(() => {
    currentBpmRef.current = bpm
  }, [bpm])

  useEffect(() => {
    if (didNormalizeBpmRef.current) return
    didNormalizeBpmRef.current = true
    if (bpm < AUDIO_PRACTICE_MIN_BPM || bpm > AUDIO_PRACTICE_MAX_BPM) {
      setPracticeBpm(bpm)
    }
  }, [bpm, setPracticeBpm])

  useEffect(() => {
    if (PRACTICE_ALL_METERS.includes(meter)) return
    setMeter('4/4')
  }, [meter, setMeter])

  const handleTogglePlay = useCallback(() => {
    triggerMetronomeToggleHaptic(playing)
    togglePlay()
  }, [playing, togglePlay])

  const handleTapTempo = useCallback(() => {
    triggerMetronomeTapHaptic()
    registerTap()
  }, [registerTap])

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

  const handleFeelChange = useCallback(
    (nextFeelId: string) => {
      if (nextFeelId === feelId) return
      setFeel(nextFeelId)
    },
    [feelId, setFeel],
  )

  const handlePulseModeChange = useCallback(
    (nextPulseModeId: string) => {
      if (nextPulseModeId === pulseModeId) return
      setPulseMode(nextPulseModeId)
    },
    [pulseModeId, setPulseMode],
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

  const handleTempoWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()
      const direction = event.deltaY > 0 ? -1 : 1
      const nextBpm = clampAudioPracticeBpm(currentBpmRef.current + direction)
      if (nextBpm === currentBpmRef.current) return
      triggerLightHaptic()
      currentBpmRef.current = nextBpm
      setPracticeBpm(nextBpm)
    },
    [setPracticeBpm],
  )

  const handleTempoPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      tempoDragRef.current = {
        pointerId: event.pointerId,
        lastY: event.clientY,
        accumulatedPixels: 0,
        lastBpm: currentBpmRef.current,
        moved: false,
      }
      setTempoScrubbing(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [],
  )

  const handleTempoPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = tempoDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      const deltaPixels = drag.lastY - event.clientY
      drag.lastY = event.clientY
      drag.accumulatedPixels += deltaPixels
      if (Math.abs(drag.accumulatedPixels) > 3) drag.moved = true

      const steps = Math.trunc(drag.accumulatedPixels / TEMPO_PIXELS_PER_BPM)
      if (steps === 0) return

      drag.accumulatedPixels -= steps * TEMPO_PIXELS_PER_BPM
      const nextBpm = clampAudioPracticeBpm(drag.lastBpm + steps)
      if (nextBpm === drag.lastBpm) return

      drag.lastBpm = nextBpm
      currentBpmRef.current = nextBpm
      triggerLightHaptic()
      setPracticeBpm(nextBpm)
    },
    [setPracticeBpm],
  )

  const handleTempoPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tempoDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    tempoDragRef.current = null
    setTempoScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

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

  return (
    <div
      className="metronome-audio-stage audio-practice-metronome flex min-h-0 flex-1 flex-col overflow-hidden"
      data-practice-mode="metronome-tab"
    >
      <div className="audio-practice-metronome__body min-h-0 flex-1">
        <header className="metronome-audio-stage__hero shrink-0">
          <div
            className="audio-practice-metronome__bpm-row audio-practice-metronome__tempo-strip"
            role="group"
            aria-label="Tempo controls"
          >
            <PracticeControlButton
              label="Decrease tempo"
              onPress={() => adjustBpm(-1)}
              className="audio-practice-metronome__step-btn"
            >
              <Minus className="h-5 w-5" strokeWidth={2.4} aria-hidden />
            </PracticeControlButton>

            <div
              className={`audio-practice-metronome__tempo-scrubber pointer-events-auto ${
                tempoScrubbing
                  ? 'audio-practice-metronome__tempo-scrubber--dragging'
                  : ''
              }`}
              onWheel={handleTempoWheel}
              onPointerDown={handleTempoPointerDown}
              onPointerMove={handleTempoPointerMove}
              onPointerUp={handleTempoPointerEnd}
              onPointerCancel={handleTempoPointerEnd}
              onLostPointerCapture={handleTempoPointerEnd}
              role="group"
              aria-label={`${bpm} beats per minute. Swipe up or down to change tempo.`}
            >
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
                      if (tempoDragRef.current?.moved) return
                      openBpmEditor()
                    }}
                  >
                    <span className="audio-practice-metronome__tempo-label">{bpmSymbol} = BPM</span>
                    <span className="metronome-audio-stage__bpm-value">{bpm}</span>
                    <span className="metronome-audio-stage__bpm-label">Tempo</span>
                  </button>
                )}
              </div>
              {!editingBpm && (
                <>
                  <ChevronsUpDown
                    className="audio-practice-metronome__tempo-drag-cue"
                    strokeWidth={2.2}
                    aria-hidden
                  />
                  <div className="audio-practice-metronome__tempo-drag-scale" aria-hidden>
                    <span>{clampAudioPracticeBpm(bpm + 1)}</span>
                    <strong>{bpm}</strong>
                    <span>{clampAudioPracticeBpm(bpm - 1)}</span>
                  </div>
                </>
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

        </header>

        <section
          className="audio-practice-metronome__selectors audio-practice-metronome__selectors--dropdown audio-practice-metronome__selectors--under-wheel audio-practice-metronome__selectors--under-orbit pointer-events-auto shrink-0"
          aria-label="Metronome time, rhythm, and accent"
        >
          <div
            className={[
              'audio-practice-metronome__select-row',
              'audio-practice-metronome__select-row--primary',
              pulseModeOptions.length > 0
                ? 'audio-practice-metronome__select-row--four'
                : 'audio-practice-metronome__select-row--three',
            ].join(' ')}
          >
            <MetronomeAudioSelect
              label="Time"
              ariaLabel="Time signature"
              value={meter}
              options={PRACTICE_ALL_METERS.map((value) => ({ value, label: value }))}
              onChange={handleMeterChange}
            />
            {pulseModeOptions.length > 0 ? (
              <MetronomeAudioSelect
                label="Tempo unit"
                ariaLabel="Conducting pulse (what BPM means)"
                value={pulseModeId}
                options={pulseModeOptions}
                onChange={handlePulseModeChange}
              />
            ) : null}
            <MetronomeAudioSelect
              label="Rhythm"
              ariaLabel="Rhythm subdivision"
              value={subdivision}
              options={rhythmOptions.map((option) => ({
                value: option.value,
                label: option.name,
              }))}
              onChange={handleSubdivisionChange}
            />
            <MetronomeAudioSelect<AudioPracticeClickSoundId>
              label="Accent"
              ariaLabel="Metronome click sound"
              value={soundId as AudioPracticeClickSoundId}
              options={AUDIO_PRACTICE_CLICK_SOUNDS.map(({ id, label }) => ({
                value: id,
                label,
              }))}
              onChange={handleSoundChange}
            />
          </div>
          {showBeatGrouping ? (
            <div className="audio-practice-metronome__select-row audio-practice-metronome__select-row--secondary audio-practice-metronome__select-row--one">
              <MetronomeAudioSelect
                label="Beat grouping"
                ariaLabel="Beat grouping feel"
                value={feelId ?? feelOptions[0].value}
                options={feelOptions}
                onChange={handleFeelChange}
              />
            </div>
          ) : null}
        </section>

        <MetronomeBeatDisplay interactive />
      </div>

      <footer className="metronome-audio-stage__controls audio-practice-metronome__controls shrink-0">
        <div
          className="audio-practice-metronome__transport-row pointer-events-auto"
          role="group"
          aria-label="Metronome transport"
        >
          <PracticeControlButton
            label={playing ? 'Stop metronome' : 'Start metronome'}
            haptic={false}
            onPress={handleTogglePlay}
            className={`metronome-audio-stage__play-btn audio-practice-metronome__play-btn ${playing ? 'metronome-audio-stage__btn--active' : ''}`}
          >
            {playing ? (
              <Pause className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            ) : (
              <Play className="h-6 w-6" strokeWidth={2.4} aria-hidden />
            )}
          </PracticeControlButton>
          <PracticeControlButton
            label="Tap tempo"
            haptic={false}
            onPress={handleTapTempo}
            className="metronome-audio-stage__tap-btn audio-practice-metronome__tap-btn"
          >
            Tap Tempo
          </PracticeControlButton>
        </div>
      </footer>
    </div>
  )
}
