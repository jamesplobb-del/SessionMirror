import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-medium text-white/75">{label}</span>
        <span className="tabular-nums text-white/45">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="audio-enhancer-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-sky-400"
      />
    </label>
  )
}

export default function AudioEnhancer({ settings, onChange, onClose }: AudioEnhancerProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const selectPreset = useCallback(
    (preset: Exclude<AudioEnhancerPreset, 'Custom'>) => {
      onChange(settingsFromPreset(preset))
    },
    [onChange],
  )

  const patchAdvanced = useCallback(
    (patch: Partial<AudioEnhancerSettings>) => {
      onChange({
        ...settings,
        ...patch,
        eq: patch.eq ? { ...settings.eq, ...patch.eq } : settings.eq,
        preset: 'Custom',
      })
    },
    [onChange, settings],
  )

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[90] mx-auto max-w-lg rounded-t-xl border border-white/10 bg-black/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">Audio Enhancer</p>
          <p className="text-[10px] text-white/45">Smart presets for playback — off uses plain audio</p>
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
                  ? 'bg-sky-500 text-white shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                  : 'border border-white/15 bg-white/8 text-white/70'
              }`}
            >
              {preset}
            </button>
          )
        })}
        {settings.preset === 'Custom' && (
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85">
            Custom
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80"
      >
        Advanced Settings
        {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {advancedOpen && (
        <div className="mt-3 space-y-3 rounded-lg border border-white/8 bg-black/35 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">3-Band EQ</p>
          <Fader
            label="Low"
            value={settings.eq.low}
            min={-12}
            max={12}
            step={1}
            format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
            onChange={(low) => patchAdvanced({ eq: { ...settings.eq, low } })}
          />
          <Fader
            label="Mid"
            value={settings.eq.mid}
            min={-12}
            max={12}
            step={1}
            format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
            onChange={(mid) => patchAdvanced({ eq: { ...settings.eq, mid } })}
          />
          <Fader
            label="High"
            value={settings.eq.high}
            min={-12}
            max={12}
            step={1}
            format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
            onChange={(high) => patchAdvanced({ eq: { ...settings.eq, high } })}
          />

          <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Dynamics &amp; Space
          </p>
          <Fader
            label="Compression"
            value={settings.compression}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(compression) => patchAdvanced({ compression })}
          />
          <Fader
            label="Reverb Mix"
            value={settings.reverb}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(reverb) => patchAdvanced({ reverb })}
          />

          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_AUDIO_ENHANCER_SETTINGS })}
            className="text-[10px] font-medium text-white/45 underline"
          >
            Reset advanced sliders
          </button>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-white/35">
        {settings.preset !== 'Custom'
          ? `${settings.preset} preset active`
          : 'Manual tweaks — preset set to Custom'}
      </p>
    </div>
  )
}
