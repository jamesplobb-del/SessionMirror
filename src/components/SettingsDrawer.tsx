import { RotateCcw, X } from 'lucide-react'
import type { AppSettings } from '../utils/appSettings'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onReset: () => void
  recordingMode: 'video' | 'audio'
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{description}</p>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 accent-sky-500"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function SettingSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  formatValue,
  onChange,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}) {
  const display = formatValue ? formatValue(value) : `${value}${unit}`

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-stone-900">{label}</p>
          <p className="mt-0.5 text-xs text-stone-500">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-stone-700">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-sky-500"
      />
    </div>
  )
}

export default function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  onUpdate,
  onReset,
  recordingMode,
}: SettingsDrawerProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-in ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88vh,100dvh)] flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl transition-[transform,opacity] duration-200 ease-in ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Settings</h2>
            <p className="text-xs text-stone-500">Toggle features and adjust recording behavior</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="settings-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          <div className="space-y-6 pb-2">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Audio Mode
            </h3>

            <SettingToggle
              label="Auto Sound Recording"
              description="In Audio mode, automatically starts recording when sound is detected and stops after silence. Plays back immediately when finished."
              checked={settings.autoSoundRecording}
              onChange={(checked) => onUpdate({ autoSoundRecording: checked })}
            />

            {settings.autoSoundRecording && (
              <div className="space-y-3 pl-1">
                {recordingMode !== 'audio' && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Switch to Audio mode on the record carousel for auto recording to run.
                  </p>
                )}

                <SettingSlider
                  label="Silence Before Stop"
                  description="How long to wait in silence before ending the take."
                  value={settings.soundSilenceSeconds}
                  min={0.5}
                  max={6}
                  step={0.5}
                  unit="s"
                  formatValue={(value) => `${value}s`}
                  onChange={(value) => onUpdate({ soundSilenceSeconds: value })}
                />

                <SettingSlider
                  label="Start Loudness"
                  description="Left = quiet playing triggers. Right = only very loud playing. Most instruments work on the left half."
                  value={settings.soundVolumeThreshold}
                  min={1}
                  max={100}
                  step={1}
                  unit=""
                  formatValue={(value) =>
                    value <= 30 ? 'Sensitive' : value >= 70 ? 'Loud only' : 'Balanced'
                  }
                  onChange={(value) => onUpdate({ soundVolumeThreshold: value })}
                />
              </div>
            )}
            <SettingToggle
              label="Live Pitch Tracker"
              description="During playback, show a live A440 tuner for voice, winds, brass, and strings. With auto recording in Audio mode, pitch analysis fills the main screen right after each take while it plays once."
              checked={settings.pitchTrackerEnabled}
              onChange={(checked) => onUpdate({ pitchTrackerEnabled: checked })}
            />
            {settings.pitchTrackerEnabled && (
              <SettingToggle
                label="Live Mic Tuner (Idle)"
                description="When an audio take is paused, listen through the microphone and show a full-screen live tuner. Turn off to only analyze pitch during playback."
                checked={settings.liveMicTunerEnabled}
                onChange={(checked) => onUpdate({ liveMicTunerEnabled: checked })}
              />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Interface
            </h3>

            <SettingToggle
              label="Haptic Feedback"
              description="Light vibration when arming a drag to pin a take."
              checked={settings.hapticFeedback}
              onChange={(checked) => onUpdate({ hapticFeedback: checked })}
            />
          </section>

          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-600 transition hover:bg-stone-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </button>
          </div>
        </div>
      </div>
    </>
  )
}
