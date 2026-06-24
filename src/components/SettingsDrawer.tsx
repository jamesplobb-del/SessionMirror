import { useCallback } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { AppSettings } from '../utils/appSettings'
import type { HudQuickSettings } from '../utils/hudQuickSettings'
import { getTunerProfile, TUNER_INSTRUMENTS, type TunerInstrument } from '../utils/pitchConfig'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import AnimatedExpand from './ui/AnimatedExpand'
import AudioEnhancer from './AudioEnhancer'
import { SettingsDrawerSkeleton } from './ui/DrawerSkeletons'
import IOSSegmentedControl from './ui/IOSSegmentedControl'
import IOSSwitch from './ui/IOSSwitch'
import Pressable from './ui/Pressable'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { useDeferredDrawerContent } from '../hooks/useDeferredDrawerContent'
import { applyUseIphoneMicForRecording } from '../utils/audioSessionRoute'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  /** Shared quick-settings values — must match the long-press branch wheel. */
  hudQuickSettings: HudQuickSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onPitchTrackerChange: (enabled: boolean) => void
  onShowTakeCardsChange: (show: boolean) => void
  onShowMetronomeChange: (show: boolean) => void
  onAudioEnhancerChange: (enabled: boolean) => void
  onReset: () => void
  recordingMode: 'video' | 'audio'
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  hapticFeedback = true,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hapticFeedback?: boolean
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
        hapticFeedback={hapticFeedback}
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
      <p className="text-sm font-semibold text-stone-900">Source Instrument</p>
      <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
        Adjusts how aggressively pitch is detected and how smooth the tuner trace looks.
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
  hudQuickSettings,
  onUpdate,
  onPitchTrackerChange,
  onShowTakeCardsChange,
  onShowMetronomeChange,
  onAudioEnhancerChange,
  onReset,
  recordingMode,
}: SettingsDrawerProps) {
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)

  const handleSheetEnterComplete = useCallback(() => {
    markContentReady()
  }, [markContentReady])

  const handlePitchTrackerToggle = useCallback(
    (checked: boolean) => {
      if (recordingMode === 'audio') {
        onClose()
      }
      onPitchTrackerChange(checked)
    },
    [onClose, onPitchTrackerChange, recordingMode],
  )

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
          <p className="text-xs text-stone-500">Recording, pitch tools, and on-screen controls</p>
        </div>
        <Pressable
          type="button"
          intensity="icon"
          onClick={onClose}
          haptic="light"
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
              Audio Recording
            </h3>

            <SettingToggle
              label="Hands-Free Record & Play"
              description="In Audio mode, starts recording when your playing crosses the trigger level, stops after silence, then immediately plays the take back through the speaker."
              checked={settings.autoSoundRecording}
              onChange={(checked) => onUpdate({ autoSoundRecording: checked })}
            />

            <SettingToggle
              label="Use device mic for recording (prevents Bluetooth quality drop)"
              description="Routes backing tracks and playback through Bluetooth headphones (A2DP) while keeping the device built-in microphone for recording — better quality for the Audio Enhancer and hands-free takes."
              checked={settings.useIphoneMicForRecording}
              onChange={(checked) => {
                onUpdate({ useIphoneMicForRecording: checked })
                void applyUseIphoneMicForRecording(checked)
              }}
            />

            <AnimatedExpand open={settings.autoSoundRecording}>
              <div className="space-y-3 pl-1 pt-3">
                {recordingMode !== 'audio' && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"
                  >
                    Switch to Audio on the record carousel for hands-free recording to run.
                  </motion.p>
                )}

                <SettingSlider
                  label="Stop After Silence"
                  description="How long the app waits in silence before ending the take."
                  value={settings.soundSilenceSeconds}
                  min={0.5}
                  max={6}
                  step={0.5}
                  unit="s"
                  formatValue={(value) => `${value}s`}
                  onChange={(value) => onUpdate({ soundSilenceSeconds: value })}
                />

                <SettingSlider
                  label="Trigger Sensitivity"
                  description="How loud your playing must be to start recording. Left catches quieter playing; right needs a stronger signal."
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
              Pitch & Tuning
            </h3>

            <SettingToggle
              label="Pitch Analysis"
              description="Shows a live pitch graph and tuner during playback. With hands-free recording, analysis appears on the main screen while each take plays back."
              checked={hudQuickSettings.pitchTrackerEnabled}
              onChange={handlePitchTrackerToggle}
            />

            <AnimatedExpand open={hudQuickSettings.pitchTrackerEnabled}>
              <div className="space-y-3 pt-3">
                <SettingToggle
                  label="Idle Mic Tuner"
                  description="Between takes, listen through the microphone and show a live tuner on the main screen. Turn off to analyze pitch only during playback."
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
              Playback
            </h3>

            <SettingToggle
              label="Audio Enhancer"
              description="Applies smart EQ, compression, and reverb presets during take playback. Off keeps the original flat mix."
              checked={hudQuickSettings.audioEnhancerEnabled}
              onChange={onAudioEnhancerChange}
            />

            <AnimatedExpand open={hudQuickSettings.audioEnhancerEnabled}>
              <div className="pt-3">
                <AudioEnhancer
                  variant="inline"
                  settings={settings.audioEnhancerSettings}
                  onChange={(audioEnhancerSettings) => onUpdate({ audioEnhancerSettings })}
                />
              </div>
            </AnimatedExpand>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              On-Screen Tools
            </h3>

            <SettingToggle
              label="Metronome Widget"
              description="Shows a draggable metronome on the main screen. Pinch to resize; double-tap the widget to reset its size. Metronome audio is not recorded into takes."
              checked={hudQuickSettings.showMetronome}
              onChange={onShowMetronomeChange}
            />

            <AnimatedExpand open={hudQuickSettings.showMetronome}>
              <div className="pt-3">
                <SettingToggle
                  label="Mute During Take Playback"
                  description="Silences metronome clicks while a take is playing. Timing keeps running so tempo stays locked when playback ends."
                  checked={settings.muteMetronomeDuringPlayback}
                  onChange={(checked) => onUpdate({ muteMetronomeDuringPlayback: checked })}
                />
              </div>
            </AnimatedExpand>

            <SettingToggle
              label="Take Comparison Cards"
              description="Shows Best Take and Latest Take cards above the record button. Turn off to keep new recordings in the vault only."
              checked={hudQuickSettings.showTakeCards}
              onChange={onShowTakeCardsChange}
            />

            <AnimatedExpand open={hudQuickSettings.showTakeCards}>
              <div className="space-y-2 pt-3">
                <label className="block space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-stone-800">Take Card Size</span>
                    <span className="text-xs tabular-nums text-stone-500">{settings.takeCardScale}%</span>
                  </div>
                  <input
                    type="range"
                    min={85}
                    max={125}
                    step={5}
                    value={settings.takeCardScale}
                    onChange={(e) => onUpdate({ takeCardScale: Number(e.target.value) })}
                    className="w-full accent-stone-700"
                    aria-label="Take card size"
                  />
                </label>
              </div>
            </AnimatedExpand>

            <SettingToggle
              label="Haptic Feedback"
              description="Light vibration when you arm a drag to pin a take as Best Take."
              checked={settings.hapticFeedback}
              onChange={(checked) => onUpdate({ hapticFeedback: checked })}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Play Along
            </h3>

            <SettingToggle
              label="Keep YouTube Out of Recordings"
              description="While recording, pauses YouTube reference playback and turns on mic echo cancellation to reduce bleed. Resume playback manually when you are done."
              checked={settings.excludeYoutubeFromRecording}
              onChange={(checked) => onUpdate({ excludeYoutubeFromRecording: checked })}
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
