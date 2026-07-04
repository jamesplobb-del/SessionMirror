import type { MultitrackMixerLevels } from './types'

interface MultitrackMixerProps {
  levels: MultitrackMixerLevels
  onChange: (patch: Partial<MultitrackMixerLevels>) => void
}

const MIXER_ROWS: { key: keyof MultitrackMixerLevels; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'backing', label: 'Backing track' },
  { key: 'metronome', label: 'Metronome' },
  { key: 'drone', label: 'Drone' },
]

export default function MultitrackMixer({ levels, onChange }: MultitrackMixerProps) {
  return (
    <section className="multitrack-mixer">
      <h3 className="multitrack-mixer__title">Mixer</h3>
      {MIXER_ROWS.map(({ key, label }) => (
        <label key={key} className="multitrack-mixer__row">
          <span className="multitrack-mixer__label">{label}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={levels[key]}
            onChange={(event) => onChange({ [key]: Number(event.target.value) })}
            className="multitrack-mixer__slider"
          />
          <span className="multitrack-mixer__value">{levels[key]}%</span>
        </label>
      ))}
    </section>
  )
}
