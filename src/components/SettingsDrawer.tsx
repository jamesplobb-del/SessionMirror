import { useCallback } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { AppSettings } from '../utils/appSettings'
import { getTunerProfile, TUNER_INSTRUMENTS, type TunerInstrument } from '../utils/pitchConfig'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import AnimatedExpand from './ui/AnimatedExpand'
import { SettingsDrawerSkeleton } from './ui/DrawerSkeletons'
import IOSSegmentedControl from './ui/IOSSegmentedControl'
import IOSSwitch from './ui/IOSSwitch'
import Pressable from './ui/Pressable'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { useDeferredDrawerContent } from '../hooks/useDeferredDrawerContent'

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
    <motion.label
      className={`flex items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
      whileTap={disabled ? undefined : { scale: 0.995 }}
      transition={iosSpringSnappy}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{description}</p>
      </div>
      <IOSSwitch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        ariaLabel={label}
      />
    </motion.label>
  )
}

function SettingInstrumentPicker({
  value,
  onChange,
}: {
  value: TunerInstrument
  onChange: (value: TunerInstrument) => void
}) {
  const activeProfile = getTunerProfile(value)

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5">
      <p className="text-sm font-semibold text-stone-900">Instrument Profile</p>
      <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
        Tunes pitch detection sensitivity and trace smoothing for your source.
      </p>

      <IOSSegmentedControl
        className="mt-3"
        layoutId="settings-instrument-segment"
        ariaLabel="Tuner instrument profile"
        value={value}
        onChange={onChange}
        segments={TUNER_INSTRUMENTS.map((instrument) => ({
          id: instrument,
          label: getTunerProfile(instrument).label,
        }))}
      />

      <p className="mt-2.5 text-[11px] leading-relaxed text-stone-400">{activeProfile.description}</p>
    </div>
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
        <motion.span
          key={display}
          initial={{ scale: 0.92, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-stone-700"
        >
          {display}
        </motion.span>
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
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)

  const handleSheetEnterComplete = useCallback(() => {
    markContentReady()
  }, [markContentReady])

  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Settings"
      motionPreset="premium"
      onEnterComplete={handleSheetEnterComplete}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-stone-200/80 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Settings</h2>
          <p className="text-xs text-stone-500">Toggle features and adjust recording behavior</p>
        </div>
        <Pressable
          type="button"
          intensity="icon"
          onClick={onClose}
          className="rounded-full p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
          aria-label="Close settings"
        >
          <X className="h-5 w-5" />
        </Pressable>
      </div>

      <div className="settings-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {!contentReady ? (
          <SettingsDrawerSkeleton />
        ) : (
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

            <AnimatedExpand open={settings.autoSoundRecording}>
              <div className="space-y-3 pl-1 pt-3">
                {recordingMode !== 'audio' && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    Switch to Audio mode on the record carousel for auto recording to run.
                  </motion.p>
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
            </AnimatedExpand>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Tuner
            </h3>

            <SettingToggle
              label="Live Pitch Tracker"
              description="During playback, show a live A440 tuner. With auto recording in Audio mode, pitch analysis fills the main screen right after each take while it plays once."
              checked={settings.pitchTrackerEnabled}
              onChange={(checked) => onUpdate({ pitchTrackerEnabled: checked })}
            />

            <AnimatedExpand open={settings.pitchTrackerEnabled}>
              <div className="space-y-3 pt-3">
                <SettingToggle
                  label="Live Mic Tuner (Idle)"
                  description="When an audio take is paused, listen through the microphone and show a full-screen live tuner. Turn off to only analyze pitch during playback."
                  checked={settings.liveMicTunerEnabled}
                  onChange={(checked) => onUpdate({ liveMicTunerEnabled: checked })}
                />
                <SettingInstrumentPicker
                  value={settings.tunerInstrument}
                  onChange={(tunerInstrument) => onUpdate({ tunerInstrument })}
                />
              </div>
            </AnimatedExpand>
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

            <SettingToggle
              label="Show Take Cards"
              description="Show Best Take and Current Take on the main screen. Turn off to keep new recordings in the vault only."
              checked={settings.showTakeCards}
              onChange={(checked) => onUpdate({ showTakeCards: checked })}
            />
          </section>

          <Pressable
            type="button"
            intensity="soft"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-50 py-2.5 text-xs font-semibold text-stone-600 hover:bg-stone-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </Pressable>
        </div>
        )}
      </div>
    </AnimatedBottomSheet>
  )
}
