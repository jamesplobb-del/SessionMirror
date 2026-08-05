import { useCallback } from 'react'
import MetronomeAudioSelect from '../../components/audioPractice/MetronomeAudioSelect'
import { useMetronome } from '../../hooks/useMetronome'
import {
  AUDIO_PRACTICE_CLICK_SOUNDS,
  PRACTICE_ALL_METERS,
  clampAudioPracticeBpm,
  getPracticeFeelOptions,
  getPracticePulseModeOptions,
  getPracticeRhythmOptions,
  practiceMeterHasPulseChoice,
  type AudioPracticeClickSoundId,
} from '../../components/audioPractice/audioPracticeMetronome'
import type { MetronomeMeter, MetronomeSubdivision } from '../../utils/metronomeConfig'

/**
 * Tempo / time / rhythm / sound for the count-in click, wired to the same shared
 * engine as the main metronome. The count-in already derives its bar length from
 * that engine's meter, so editing it here is what actually changes the count.
 * BPM writes through to both the session and the engine to keep them from
 * drifting apart (recording picks the engine's tempo when the widget is shown).
 */
export default function MultitrackClickSettings({
  bpm,
  onBpmChange,
}: {
  bpm: number
  onBpmChange: (bpm: number) => void
}) {
  const {
    meter,
    subdivision,
    feelId,
    pulseModeId,
    soundId,
    setBpm,
    setMeter,
    setSubdivision,
    setFeel,
    setPulseMode,
    setSoundId,
  } = useMetronome()

  const feelOptions = getPracticeFeelOptions(meter, pulseModeId)
  const rhythmOptions = getPracticeRhythmOptions(meter, pulseModeId)
  const pulseModeOptions = practiceMeterHasPulseChoice(meter) ? getPracticePulseModeOptions(meter) : []
  const showBeatGrouping = feelOptions.length > 1 && (meter.endsWith('/8') || meter.endsWith('/16'))

  const handleBpmChange = useCallback(
    (value: number) => {
      const next = clampAudioPracticeBpm(Math.round(value) || 120)
      onBpmChange(next)
      setBpm(next)
    },
    [onBpmChange, setBpm],
  )

  const handleMeterChange = useCallback(
    (next: MetronomeMeter) => {
      if (next !== meter) setMeter(next)
    },
    [meter, setMeter],
  )

  const handleSubdivisionChange = useCallback(
    (next: MetronomeSubdivision) => {
      if (next !== subdivision) setSubdivision(next)
    },
    [setSubdivision, subdivision],
  )

  const handleFeelChange = useCallback(
    (next: string) => {
      if (next !== feelId) setFeel(next)
    },
    [feelId, setFeel],
  )

  const handlePulseModeChange = useCallback(
    (next: string) => {
      if (next !== pulseModeId) setPulseMode(next)
    },
    [pulseModeId, setPulseMode],
  )

  const handleSoundChange = useCallback(
    (next: AudioPracticeClickSoundId) => {
      if (next !== soundId) setSoundId(next)
    },
    [setSoundId, soundId],
  )

  return (
    <>
      <label className="multitrack-countin-sheet__row">
        <span>BPM</span>
        <input
          type="number"
          aria-label="Count-in tempo"
          inputMode="numeric"
          min={40}
          max={300}
          value={bpm}
          onChange={(event) => handleBpmChange(Number(event.target.value))}
        />
      </label>
      <div className="multitrack-click-settings">
        <div className="multitrack-click-settings__title">
          <strong>Click sound &amp; feel</strong>
          <span>Shared with your metronome</span>
        </div>
        <div className="multitrack-click-settings__grid">
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
            options={rhythmOptions.map((option) => ({ value: option.value, label: option.name }))}
            onChange={handleSubdivisionChange}
          />
          {showBeatGrouping ? (
            <MetronomeAudioSelect
              label="Feel"
              ariaLabel="Beat grouping feel"
              value={feelId ?? feelOptions[0].value}
              options={feelOptions}
              onChange={handleFeelChange}
            />
          ) : null}
          <MetronomeAudioSelect<AudioPracticeClickSoundId>
            label="Sound"
            ariaLabel="Metronome click sound"
            value={soundId as AudioPracticeClickSoundId}
            options={AUDIO_PRACTICE_CLICK_SOUNDS.map(({ id, label }) => ({ value: id, label }))}
            onChange={handleSoundChange}
          />
        </div>
      </div>
    </>
  )
}
