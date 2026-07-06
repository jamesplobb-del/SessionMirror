import { useCallback } from 'react'
import {
  DEFAULT_AUDIO_ENHANCER_SETTINGS,
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
  variant?: 'inline' | 'sheet'
  onClose?: () => void
}

function Fader({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  inline,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  inline: boolean
}) {
  return (
    <label className="block space-y-1.5">
      <div className={`flex items-center justify-between gap-2 ${inline ? 'text-xs' : 'text-[11px]'}`}>
        <span className={`font-medium ${inline ? 'text-stone-800' : 'text-white/75'}`}>{label}</span>
        <span className={`tabular-nums ${inline ? 'text-stone-500' : 'text-white/45'}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`h-1.5 w-full cursor-pointer appearance-none rounded-full ${
          inline ? 'bg-stone-200 accent-stone-700' : 'bg-white/15 accent-sky-400 audio-enhancer-slider'
        }`}
      />
    </label>
  )
}

function activePresetLabel(settings: AudioEnhancerSettings): string {
  return settings.preset === 'Custom' ? 'Custom' : settings.preset
}

export default function AudioEnhancer({
  settings,
  onChange,
  variant = 'sheet',
  onClose,
}: AudioEnhancerProps) {
  const inline = variant === 'inline'

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

  const presetSelectValue = settings.preset === 'Custom' ? 'Custom' : settings.preset

  const controls = (
    <>
      <label className="mb-3 block space-y-1.5">
        <span
          className={`font-semibold uppercase tracking-wider ${
            inline ? 'text-[10px] text-stone-500' : 'text-[10px] text-white/40'
          }`}
        >
          Mode
        </span>
        <select
          value={presetSelectValue}
          onChange={(e) => {
            const value = e.target.value
            if (value === 'Custom') return
            selectPreset(value as Exclude<AudioEnhancerPreset, 'Custom'>)
          }}
          className={
            inline
              ? 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-900 focus:border-stone-400 focus:outline-none'
              : 'w-full rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-sm font-medium text-white focus:border-sky-400/60 focus:outline-none'
          }
        >
          {PRESET_ORDER.map((preset) => (
            <option key={preset} value={preset}>
              {preset}
            </option>
          ))}
          {settings.preset === 'Custom' && <option value="Custom">Custom</option>}
        </select>
      </label>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PRESET_ORDER.map((preset) => {
          const active = settings.preset === preset
          return (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? inline
                    ? 'bg-stone-800 text-white'
                    : 'bg-[#5ce625] text-black shadow-[0_0_16px_rgba(92,230,37,0.35)]'
                  : inline
                    ? 'border border-stone-200 bg-stone-50 text-stone-600'
                    : 'border border-white/15 bg-white/8 text-white/70'
              }`}
            >
              {preset}
            </button>
          )
        })}
      </div>

      <div
        className={
          inline
            ? 'space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-3'
            : 'space-y-3 rounded-lg border border-white/10 bg-white/5 p-3'
        }
      >
        <p
          className={`font-semibold uppercase tracking-wider ${
            inline ? 'text-[10px] text-stone-500' : 'text-[10px] text-white/40'
          }`}
        >
          {activePresetLabel(settings)} adjustments
        </p>
        <Fader
          inline={inline}
          label="Low"
          value={settings.eq.low}
          min={-12}
          max={12}
          step={1}
          format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(low) => patchSettings({ eq: { ...settings.eq, low } })}
        />
        <Fader
          inline={inline}
          label="Mid"
          value={settings.eq.mid}
          min={-12}
          max={12}
          step={1}
          format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(mid) => patchSettings({ eq: { ...settings.eq, mid } })}
        />
        <Fader
          inline={inline}
          label="High"
          value={settings.eq.high}
          min={-12}
          max={12}
          step={1}
          format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(high) => patchSettings({ eq: { ...settings.eq, high } })}
        />

        <p
          className={`pt-1 font-semibold uppercase tracking-wider ${
            inline ? 'text-[10px] text-stone-500' : 'text-[10px] text-white/40'
          }`}
        >
          Dynamics &amp; Space
        </p>
        <Fader
          inline={inline}
          label="Compression"
          value={settings.compression}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(compression) => patchSettings({ compression })}
        />
        <Fader
          inline={inline}
          label="Reverb Mix"
          value={settings.reverb}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(reverb) => patchSettings({ reverb })}
        />

        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_AUDIO_ENHANCER_SETTINGS })}
          className={`text-[10px] font-medium underline ${
            inline ? 'text-stone-500' : 'text-white/45'
          }`}
        >
          Reset to defaults
        </button>
      </div>
    </>
  )

  if (inline) {
    return <div className="space-y-1">{controls}</div>
  }

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-lg rounded-t-xl border border-white/10 bg-black/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Audio Enhancer</p>
          <p className="text-[10px] text-white/45">Tune EQ, compression, and reverb per mode</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold text-white/70"
          >
            Done
          </button>
        )}
      </div>
      {controls}
    </div>
  )
}
