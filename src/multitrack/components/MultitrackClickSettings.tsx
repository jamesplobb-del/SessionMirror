import MetronomeAudioSelect from '../../components/audioPractice/MetronomeAudioSelect'
import { AUDIO_PRACTICE_CLICK_SOUNDS, PRACTICE_ALL_METERS, type AudioPracticeClickSoundId } from '../../components/audioPractice/audioPracticeMetronome'
import type { MultitrackPracticeSettings } from '../types'

/** Only settings used by the native count-in transport are offered here. */
export default function MultitrackClickSettings({ practice, onChange }: {
  practice: MultitrackPracticeSettings
  onChange: (patch: Partial<MultitrackPracticeSettings>) => void
}) {
  const meter = practice.meter ?? '4/4'
  return <>
    <label className="multitrack-countin-sheet__row"><span>Click tempo (BPM)</span>
      <input type="number" aria-label="Count-in tempo" min={40} max={300} value={practice.bpm}
        onChange={e => onChange({ bpm: Math.max(40, Math.min(300, Math.round(Number(e.target.value)) || 120)) })} />
    </label>
    <div className="multitrack-click-settings">
      <div className="multitrack-click-settings__title"><strong>Count-in & click</strong><span>{Number.parseInt(meter)} clicks per bar · saved with this project</span></div>
      <div className="multitrack-click-settings__grid">
        <MetronomeAudioSelect label="Time" ariaLabel="Time signature" value={meter}
          options={PRACTICE_ALL_METERS.filter(value => Number.parseInt(value) <= 12).map(value => ({value,label:value}))}
          onChange={meter => onChange({ meter })} />
        <MetronomeAudioSelect<AudioPracticeClickSoundId> label="Sound" ariaLabel="Metronome click sound"
          value={(practice.clickSound ?? 'classic') as AudioPracticeClickSoundId}
          options={AUDIO_PRACTICE_CLICK_SOUNDS.map(({id,label})=>({value:id,label}))}
          onChange={clickSound=>onChange({clickSound})} />
      </div>
    </div>
  </>
}
