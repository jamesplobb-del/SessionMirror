import { Pause, Play } from 'lucide-react'
import { useCallback, useId, useState } from 'react'
import { useMetronome } from '../hooks/useMetronome'
import { useTapTempo } from '../hooks/useTapTempo'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { triggerLightHaptic } from '../utils/haptics'
import IOSSwitch from './ui/IOSSwitch'
import {
  AUDIO_STAGE_METERS,
  AUDIO_STAGE_METRONOME_SOUNDS,
  loadMetronomePrefs,
  MAX_BPM,
  MIN_BPM,
  saveMetronomePrefs,
  STAGE_SUBDIVISIONS,
  type MetronomeMeter,
  type MetronomeSubdivision,
} from '../utils/metronomeConfig'

interface LiveMetronomeStageProps {
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
}

function StageControlButton({
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

export default function LiveMetronomeStage({
  isTakePlaying = false,
  muteDuringPlayback = true,
}: LiveMetronomeStageProps) {
  const bpmInputId = useId()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [soundId, setSoundId] = useState(() => loadMetronomePrefs().soundId)
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState('')

  const {
    bpm,
    meter,
    subdivision,
    accentFirstBeat,
    playing,
    beatIndex,
    pulseCount,
    setBpm,
    setMeter,
    setSubdivision,
    setAccentFirstBeat,
    togglePlay,
    stop,
  } = useMetronome({ isTakePlaying, muteDuringPlayback })

  const { registerTap } = useTapTempo((nextBpm) => {
    triggerLightHaptic()
    setBpm(nextBpm)
  })

  const beatsPerBar = pulseCount

  const handleTogglePlay = useCallback(() => {
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
    (nextSoundId: string) => {
      if (nextSoundId === soundId) return
      setSoundId(nextSoundId)
      const prefs = loadMetronomePrefs()
      saveMetronomePrefs({ ...prefs, soundId: nextSoundId })
    },
    [soundId],
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
      setBpm(parsed)
    }
    setEditingBpm(false)
  }, [bpmDraft, setBpm])

  return (
    <div
      className="practice-stage-shell metronome-audio-stage flex min-h-0 flex-1 flex-col overflow-hidden"
      data-practice-mode="metronome"
    >
      {/* Future tabs: [TUNER] [TUNER+MET] [METRONOME] */}

      <header className="metronome-audio-stage__hero shrink-0">
        <div className="metronome-audio-stage__top-row">
          {editingBpm ? (
            <input
              id={bpmInputId}
              type="number"
              inputMode="numeric"
              min={MIN_BPM}
              max={MAX_BPM}
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

          <div className="metronome-audio-stage__actions">
            <StageControlButton
              label="Tap tempo"
              onPress={registerTap}
              className="metronome-audio-stage__tap-btn"
            >
              Tap
            </StageControlButton>

            <StageControlButton
              label={playing ? 'Stop metronome' : 'Start metronome'}
              onPress={handleTogglePlay}
              className="metronome-audio-stage__play-btn"
            >
              {playing ? (
                <Pause className="h-5 w-5" strokeWidth={2.4} aria-hidden />
              ) : (
                <Play className="h-5 w-5" strokeWidth={2.4} aria-hidden />
              )}
            </StageControlButton>
          </div>
        </div>
      </header>

      <div className="metronome-audio-stage__beats min-h-0 flex-1" aria-live="polite" aria-atomic>
        <div
          className={`metronome-audio-stage__beat-row ${playing ? 'metronome-audio-stage__beat-row--playing' : ''} ${prefersReducedMotion ? 'metronome-audio-stage__beat-row--reduced-motion' : ''}`}
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
                  'metronome-audio-stage__beat-dot',
                  isActive ? 'metronome-audio-stage__beat-dot--active' : '',
                  isDownbeat ? 'metronome-audio-stage__beat-dot--downbeat' : '',
                  isActive && isDownbeat ? 'metronome-audio-stage__beat-dot--pulse' : '',
                  isActive && !isDownbeat ? 'metronome-audio-stage__beat-dot--pulse-soft' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden
              />
            )
          })}
        </div>
      </div>

      <footer className="metronome-audio-stage__controls shrink-0">
        <div className="metronome-audio-stage__control-row" role="group" aria-label="Time signature">
          {AUDIO_STAGE_METERS.map((value) => (
            <StageControlButton
              key={value}
              label={`${value} meter`}
              active={meter === value}
              onPress={() => handleMeterChange(value)}
              className="metronome-audio-stage__meter-btn"
            >
              {value}
            </StageControlButton>
          ))}
        </div>

        <div
          className="metronome-audio-stage__control-row metronome-audio-stage__control-row--subdivisions"
          role="group"
          aria-label="Subdivisions"
        >
          {STAGE_SUBDIVISIONS.map(({ value, label }) => (
            <StageControlButton
              key={value}
              label={`${label} subdivisions`}
              active={subdivision === value}
              onPress={() => handleSubdivisionChange(value)}
              className="metronome-audio-stage__subdivision-btn"
            >
              {label}
            </StageControlButton>
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
          aria-label="Metronome sound"
        >
          {AUDIO_STAGE_METRONOME_SOUNDS.map(({ id, label }) => (
            <StageControlButton
              key={id}
              label={`${label} sound`}
              active={soundId === id}
              onPress={() => handleSoundChange(id)}
              className="metronome-audio-stage__sound-btn"
            >
              {label}
            </StageControlButton>
          ))}
        </div>
      </footer>
    </div>
  )
}
