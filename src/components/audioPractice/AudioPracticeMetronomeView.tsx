import { Minus, Pause, Play, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { useTapTempo } from '../../hooks/useTapTempo'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import {
  triggerLightHaptic,
  triggerMetronomeTapHaptic,
  triggerMetronomeToggleHaptic,
} from '../../utils/haptics'
import {
  getBeatsPerBar,
  getCompoundGroupSize,
  isCompoundMeter,
  subdivisionsPerBeat,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import {
  AUDIO_PRACTICE_CLICK_SOUNDS,
  AUDIO_PRACTICE_MAX_BPM,
  AUDIO_PRACTICE_MIN_BPM,
  PRACTICE_ALL_METERS,
  PRACTICE_ALL_RHYTHM_OPTIONS,
  clampAudioPracticeBpm,
  type AudioPracticeClickSoundId,
} from './audioPracticeMetronome'
import MetronomeAudioSelect from './MetronomeAudioSelect'

const TEMPO_DEGREES_PER_BPM = 7

function pointerAngleFromCenter(event: React.PointerEvent<HTMLElement>): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  return Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI)
}

function normalizeAngleDelta(delta: number): number {
  if (delta > 180) return delta - 360
  if (delta < -180) return delta + 360
  return delta
}

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
  const prefersReducedMotion = usePrefersReducedMotion()
  const didNormalizeBpmRef = useRef(false)
  const tempoDragRef = useRef<{
    pointerId: number
    lastAngle: number
    accumulatedDegrees: number
    lastBpm: number
    moved: boolean
  } | null>(null)
  const currentBpmRef = useRef(0)
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')
  const [tempoWheelRotation, setTempoWheelRotation] = useState(0)

  const {
    bpm,
    meter,
    subdivision,
    accentPattern,
    soundId,
    playing,
    beatIndex,
    subTickIndex,
    beatPulseId,
    setBpm,
    setMeter,
    setSubdivision,
    toggleBeatAccent,
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

  const beatsPerBar = getBeatsPerBar(meter)
  const compoundMeter = isCompoundMeter(meter)
  const compoundGroupSize = getCompoundGroupSize(meter)
  const ticksPerBeat = subdivisionsPerBeat(subdivision)
  const subNotchCount =
    compoundMeter && subdivision === 'off' ? compoundGroupSize - 1 : Math.max(0, ticksPerBeat - 1)

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

  const handleBeatAccentToggle = useCallback(
    (beat: number) => {
      triggerLightHaptic()
      toggleBeatAccent(beat)
    },
    [toggleBeatAccent],
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
      setTempoWheelRotation((rotation) => rotation + direction * TEMPO_DEGREES_PER_BPM)
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
        lastAngle: pointerAngleFromCenter(event),
        accumulatedDegrees: 0,
        lastBpm: currentBpmRef.current,
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [],
  )

  const handleTempoPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = tempoDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      const nextAngle = pointerAngleFromCenter(event)
      const deltaDegrees = normalizeAngleDelta(nextAngle - drag.lastAngle)
      drag.lastAngle = nextAngle
      drag.accumulatedDegrees += deltaDegrees
      if (Math.abs(drag.accumulatedDegrees) > 3) drag.moved = true

      const steps = Math.trunc(drag.accumulatedDegrees / TEMPO_DEGREES_PER_BPM)
      if (steps === 0) return

      drag.accumulatedDegrees -= steps * TEMPO_DEGREES_PER_BPM
      const nextBpm = clampAudioPracticeBpm(drag.lastBpm + steps)
      if (nextBpm === drag.lastBpm) return

      drag.lastBpm = nextBpm
      currentBpmRef.current = nextBpm
      triggerLightHaptic()
      setTempoWheelRotation((rotation) => rotation + steps * TEMPO_DEGREES_PER_BPM)
      setPracticeBpm(nextBpm)
    },
    [setPracticeBpm],
  )

  const handleTempoPointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tempoDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    tempoDragRef.current = null
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

  const isMainBeatPulse = playing && subTickIndex === 0
  const isAccentedPulse = isMainBeatPulse && Boolean(accentPattern[beatIndex])
  const pulseClass = isAccentedPulse
    ? beatIndex === 0
      ? 'audio-practice-metronome__pulse--accent'
      : 'audio-practice-metronome__pulse--beat'
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

            <div
              className="audio-practice-metronome__tempo-dial pointer-events-auto"
              onWheel={handleTempoWheel}
              onPointerDown={handleTempoPointerDown}
              onPointerMove={handleTempoPointerMove}
              onPointerUp={handleTempoPointerEnd}
              onPointerCancel={handleTempoPointerEnd}
              role="group"
              aria-label={`${bpm} beats per minute. Drag up or down to change tempo.`}
            >
              <div className="audio-practice-metronome__tempo-glow" aria-hidden />
              <div
                className="audio-practice-metronome__tempo-rim"
                style={{ '--tempo-wheel-rotation': `${tempoWheelRotation}deg` } as React.CSSProperties}
                aria-hidden
              >
                {Array.from({ length: 72 }, (_, index) => (
                  <span
                    key={index}
                    className="audio-practice-metronome__tempo-tick"
                    style={{ '--tick-rotation': `${index * 5}deg` } as React.CSSProperties}
                  />
                ))}
              </div>
              <span className="audio-practice-metronome__tempo-marker" aria-hidden />
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
                    <span className="audio-practice-metronome__tempo-label">Tempo</span>
                    <span className="metronome-audio-stage__bpm-value">{bpm}</span>
                    <span className="metronome-audio-stage__bpm-label">BPM</span>
                  </button>
                )}
              </div>
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
          className="audio-practice-metronome__selectors audio-practice-metronome__selectors--dropdown audio-practice-metronome__selectors--under-wheel pointer-events-auto shrink-0"
          aria-label="Metronome time, rhythm, and accent"
        >
          <div className="audio-practice-metronome__select-row audio-practice-metronome__select-row--triple">
            <MetronomeAudioSelect
              label="Time"
              ariaLabel="Time signature"
              value={meter}
              options={PRACTICE_ALL_METERS.map((value) => ({ value, label: value }))}
              onChange={handleMeterChange}
            />
            <MetronomeAudioSelect
              label="Rhythm"
              ariaLabel="Rhythm subdivision"
              value={subdivision}
              options={PRACTICE_ALL_RHYTHM_OPTIONS.map((option) => ({
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
        </section>

        <div className="audio-practice-metronome__center-stack min-h-0 flex-1">
          <div className="metronome-audio-stage__beats min-h-0 flex-1" aria-live="polite" aria-atomic>
          <div className="audio-practice-metronome__visual audio-practice-metronome__visual--large">
            <div
              key={beatPulseId}
              className={[
                'audio-practice-metronome__pulse',
                playing ? pulseClass : '',
                playing && beatPulseId > 0 && !prefersReducedMotion
                  ? 'audio-practice-metronome__pulse--animate'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            />
            <div
              className={[
                'metronome-audio-stage__beat-row',
                'audio-practice-metronome__beat-row',
                compoundMeter ? 'audio-practice-metronome__beat-row--compound' : '',
                beatsPerBar > 8 ? 'audio-practice-metronome__beat-row--compact' : '',
                playing ? 'metronome-audio-stage__beat-row--playing' : '',
                prefersReducedMotion ? 'metronome-audio-stage__beat-row--reduced-motion' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="group"
              aria-label="Beat indicators"
            >
              {Array.from({ length: beatsPerBar }, (_, index) => {
                const isBeatActive = playing && beatIndex === index
                const isAccented = Boolean(accentPattern[index])
                const isDownbeat = index === 0 && isAccented
                const isMainTick = isBeatActive && subTickIndex === 0
                const isSubTick = isBeatActive && subTickIndex > 0
                return (
                  <div
                    key={`${index}-${isBeatActive ? beatPulseId : 'idle'}`}
                    className={[
                      'audio-practice-metronome__beat-cell',
                      compoundMeter ? 'audio-practice-metronome__beat-cell--compound' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      type="button"
                      className={[
                        'audio-practice-metronome__beat',
                        'audio-practice-metronome__beat-tap',
                        'pointer-events-auto',
                        isAccented ? 'audio-practice-metronome__beat--accented' : '',
                        isMainTick ? 'audio-practice-metronome__beat--active' : '',
                        isSubTick ? 'audio-practice-metronome__beat--sub-active' : '',
                        isDownbeat ? 'audio-practice-metronome__beat--downbeat' : '',
                        isMainTick && isAccented && index === 0
                          ? 'audio-practice-metronome__beat--pulse'
                          : '',
                        isMainTick && isAccented && index > 0
                          ? 'audio-practice-metronome__beat--pulse-soft'
                          : '',
                        isMainTick && !isAccented ? 'audio-practice-metronome__beat--pulse-soft' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`Beat ${index + 1}${isAccented ? ', accented' : ''}. Tap to toggle accent.`}
                      aria-pressed={isAccented}
                      onPointerUp={(event) => {
                        if (event.button !== 0) return
                        handleBeatAccentToggle(index)
                      }}
                    >
                      <span className="audio-practice-metronome__beat-number" aria-hidden>
                        {index + 1}
                      </span>
                    </button>
                    {subNotchCount > 0 && (
                      <div className="audio-practice-metronome__sub-notches" aria-hidden>
                        {Array.from({ length: subNotchCount }, (_, notchIndex) => {
                          const notchTick = notchIndex + 1
                          const notchActive = isBeatActive && subTickIndex === notchTick
                          return (
                            <span
                              key={notchTick}
                              className={[
                                'audio-practice-metronome__sub-notch',
                                notchActive ? 'audio-practice-metronome__sub-notch--active' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          </div>
        </div>
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
