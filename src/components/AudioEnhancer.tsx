import { useCallback } from 'react'
import {
  matchesPresetDefaults,
  settingsFromPreset,
  type AudioEnhancerPreset,
  type AudioEnhancerSettings,
} from '../utils/audioEnhancer'

const PRESET_ORDER: Exclude<AudioEnhancerPreset, 'Custom'>[] = [
  'Voice',
  'Brass',
  'Strings',
  'Woodwinds',
  'Percussion',
]

interface AudioEnhancerProps {
  settings: AudioEnhancerSettings
  onChange: (next: AudioEnhancerSettings) => void
}

function Fader({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-stone-800">{label}</span>
        <span className="tabular-nums text-stone-500">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone-200 accent-stone-700"
      />
    </label>
  )
}

const formatDb = (value: number) => `${value > 0 ? '+' : ''}${value} dB`
const formatPercent = (value: number) => `${value}%`

export default function AudioEnhancer({ settings, onChange }: AudioEnhancerProps) {
  const selectPreset = useCallback(
    (preset: Exclude<AudioEnhancerPreset, 'Custom'>) => {
      onChange(settingsFromPreset(preset))
    },
    [onChange],
  )

  const patchSettings = useCallback(
    (patch: Partial<AudioEnhancerSettings>) => {
      onChange({
        ...settings,
        ...patch,
        eq: patch.eq ? { ...settings.eq, ...patch.eq } : settings.eq,
      })
    },
    [onChange, settings],
  )

  // Editing a fader keeps the preset selected: the preset also chooses the EQ
  // centre frequencies, so flipping to a generic "Custom" profile mid-edit
  // would shift the tone from an unrelated control. Say "edited" instead.
  const edited = !matchesPresetDefaults(settings)
  const resetPreset = settings.preset === 'Custom' ? 'Voice' : settings.preset

  return (
    <div className="space-y-3">
      <div>
        <span className="text-[11px] font-medium text-stone-500">
          Mode
        </span>
        <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRESET_ORDER.map((preset) => {
            const active = settings.preset === preset
            return (
              <button
                key={preset}
                type="button"
                onClick={() => selectPreset(preset)}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-stone-800 text-white'
                    : 'border border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {preset}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-stone-500">
            {settings.preset} adjustments
          </p>
          {edited && (
            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
              Edited
            </span>
          )}
        </div>

        <Fader
          label="Low"
          value={settings.eq.low}
          min={-12}
          max={12}
          step={1}
          format={formatDb}
          onChange={(low) => patchSettings({ eq: { ...settings.eq, low } })}
        />
        <Fader
          label="Mid"
          value={settings.eq.mid}
          min={-12}
          max={12}
          step={1}
          format={formatDb}
          onChange={(mid) => patchSettings({ eq: { ...settings.eq, mid } })}
        />
        <Fader
          label="High"
          value={settings.eq.high}
          min={-12}
          max={12}
          step={1}
          format={formatDb}
          onChange={(high) => patchSettings({ eq: { ...settings.eq, high } })}
        />

        <p className="pt-1 text-[11px] font-medium text-stone-500">
          Dynamics &amp; Space
        </p>
        <Fader
          label="Compression"
          value={settings.compression}
          min={0}
          max={100}
          step={1}
          format={formatPercent}
          onChange={(compression) => patchSettings({ compression })}
        />
        <Fader
          label="Reverb Mix"
          value={settings.reverb}
          min={0}
          max={100}
          step={1}
          format={formatPercent}
          onChange={(reverb) => patchSettings({ reverb })}
        />

        <button
          type="button"
          onClick={() => selectPreset(resetPreset)}
          disabled={!edited}
          className="text-[10px] font-medium text-stone-500 underline disabled:no-underline disabled:opacity-40"
        >
          Reset {resetPreset}
        </button>
      </div>
    </div>
  )
}
