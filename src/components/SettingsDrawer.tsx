import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import {
  Command,
  Gauge,
  LockKeyhole,
  RadioTower,
  RotateCcw,
  Smartphone,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react'
import { motion } from 'framer-motion'
import type { AppSettings } from '../utils/appSettings'
import type { HudQuickSettings } from '../utils/hudQuickSettings'
import { getTunerProfile, TUNER_INSTRUMENTS, type TunerInstrument } from '../utils/pitchConfig'
import { DRONE_WAVEFORM_OPTIONS, type DroneWaveform } from '../utils/droneEngine'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import AnimatedExpand from './ui/AnimatedExpand'
import AudioEnhancer from './AudioEnhancer'
import { SettingsDrawerSkeleton } from './ui/DrawerSkeletons'
import IOSSegmentedControl from './ui/IOSSegmentedControl'
import IOSSwitch from './ui/IOSSwitch'
import Pressable from './ui/Pressable'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { useDeferredDrawerContent } from '../hooks/useDeferredDrawerContent'
import HelpSheet from './HelpSheet'
import { HELP_TOPICS, type HelpTopic, type HelpTopicId } from '../utils/tutorialContent'
import { resetTutorials } from '../utils/onboardingTutorial'

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
  onReplayTutorial?: () => void
  onOpenLabs?: () => void
  onOpenCreatorStudio?: () => void
  onOpenMultitrack?: () => void
  onOpenQuickTuner?: () => void
  recordingMode: 'video' | 'audio'
}

type QuickTunerSetupId =
  | 'lockScreen'
  | 'controlCenter'
  | 'actionButton'
  | 'siriOrShortcuts'
  | 'appIcon'

interface QuickTunerSetup {
  id: QuickTunerSetupId
  title: string
  description: string
  action: string
  availability: string
  steps: string[]
  note?: string
}

const QUICK_TUNER_SETUPS: QuickTunerSetup[] = [
  {
    id: 'lockScreen',
    title: 'Lock Screen',
    description: 'Open the tuner from the bottom of your Lock Screen.',
    action: 'Set Up',
    availability: 'iOS 18+',
    steps: [
      'Touch and hold your Lock Screen, then tap Customize.',
      'Choose Lock Screen and tap one of the control positions at the bottom.',
      'Search for BestTake, then choose Quick Tuner.',
      'Tap Done. The control now opens the same lightweight tuner.',
    ],
  },
  {
    id: 'controlCenter',
    title: 'Control Center',
    description: 'Open Quick Tuner from anywhere.',
    action: 'Set Up',
    availability: 'iOS 18+',
    steps: [
      'Open Control Center and touch and hold an empty area.',
      'Tap Add a Control.',
      'Search for BestTake, then choose Quick Tuner.',
      'Drag the control to your preferred position.',
    ],
  },
  {
    id: 'actionButton',
    title: 'Action Button',
    description: 'Hold the Action Button to open Quick Tuner.',
    action: 'Set Up',
    availability: 'Supported iPhones',
    steps: [
      'Open the iOS Settings app and choose Action Button.',
      'Choose Controls or Shortcut, depending on the options shown on your iPhone.',
      'Select BestTake Quick Tuner.',
      'Press and hold the Action Button to test it.',
    ],
    note: 'Action Button availability depends on your iPhone model. BestTake cannot detect or change this assignment for you.',
  },
  {
    id: 'siriOrShortcuts',
    title: 'Siri & Shortcuts',
    description: 'Say “Open BestTake Tuner” or add it to Shortcuts.',
    action: 'Set Up',
    availability: 'iOS 16+',
    steps: [
      'Say “Open BestTake tuner” or “Start BestTake tuner.”',
      'Or open the Shortcuts app and browse App Shortcuts.',
      'Choose BestTake, then add Quick Tuner to a shortcut or automation.',
      'The shortcut opens directly to the same lightweight tuner.',
    ],
  },
  {
    id: 'appIcon',
    title: 'App Icon',
    description: 'Long-press the BestTake icon and choose Open Tuner.',
    action: 'How It Works',
    availability: 'Ready after install',
    steps: [
      'Find BestTake on your Home Screen or in the App Library.',
      'Touch and hold the BestTake app icon.',
      'Tap Open Tuner.',
      'This static action is available before the app is opened for the first time.',
    ],
  },
]

function QuickTunerAccessRow({
  setup,
  onOpen,
}: {
  setup: QuickTunerSetup
  onOpen: () => void
}) {
  const Icon =
    setup.id === 'lockScreen'
      ? LockKeyhole
      : setup.id === 'controlCenter'
        ? RadioTower
        : setup.id === 'actionButton'
          ? Sparkles
          : setup.id === 'siriOrShortcuts'
            ? Command
            : Smartphone

  return (
    <Pressable
      type="button"
      intensity="soft"
      haptic="light"
      onClick={onOpen}
      className="settings-group-row flex w-full items-center gap-3 rounded-2xl border border-white/70 bg-white/72 px-4 py-3.5 text-left shadow-sm backdrop-blur-xl"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <strong className="text-sm font-semibold text-stone-900">{setup.title}</strong>
          <small className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
            {setup.availability}
          </small>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
          {setup.description}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-600">
        {setup.action}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </Pressable>
  )
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
      className={`settings-group-row flex min-h-[4.75rem] items-start justify-between gap-4 rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl ${
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
    <div className="settings-group-row rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl">
      <p className="text-sm font-semibold text-stone-900">Source Instrument</p>
      <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
        Adjusts pitch detection and trace smoothing for the Audio Tuner tab and pitch analysis.
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
    <div className="settings-group-row rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl">
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
  onReplayTutorial,
  onOpenLabs,
  onOpenCreatorStudio,
  onOpenMultitrack,
  onOpenQuickTuner,
  recordingMode,
}: SettingsDrawerProps) {
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)
  const [activeHelpTopicId, setActiveHelpTopicId] = useState<HelpTopicId | null>(null)
  const [activeQuickTunerSetupId, setActiveQuickTunerSetupId] =
    useState<QuickTunerSetupId | null>(null)
  const helpTopicById = useMemo(
    () => new Map(HELP_TOPICS.map((topic) => [topic.id, topic] as const)),
    [],
  )
  const activeHelpTopic: HelpTopic | null = activeHelpTopicId
    ? helpTopicById.get(activeHelpTopicId) ?? null
    : null
  const activeQuickTunerSetup = activeQuickTunerSetupId
    ? QUICK_TUNER_SETUPS.find((setup) => setup.id === activeQuickTunerSetupId) ?? null
    : null

  useEffect(() => {
    if (!isOpen) setActiveQuickTunerSetupId(null)
  }, [isOpen])

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

  const handleCloseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      onClose()
    },
    [onClose],
  )

  const handleResetTutorials = useCallback(() => {
    resetTutorials()
    setActiveHelpTopicId(null)
    onReplayTutorial?.()
  }, [onReplayTutorial])

  return (
    <>
      <AnimatedBottomSheet
        isOpen={isOpen}
        onClose={onClose}
        ariaLabel="Settings"
        motionPreset="premium"
        elevated
        elevatedLight={recordingMode === 'audio'}
        onEnterComplete={handleSheetEnterComplete}
      >
      <div className="native-sheet-header sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5 pb-4 pt-3">
        <div className="native-sheet-title-block min-w-0 flex-1">
          <span className="native-sheet-kicker">BestTake</span>
          <h2 className="native-sheet-title">Settings</h2>
          <p className="native-sheet-subtitle">Recording, pitch tools, and on-screen controls</p>
        </div>
        <Pressable
          type="button"
          intensity="icon"
          onClick={handleCloseClick}
          haptic="light"
          className="native-sheet-close relative z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70 hover:bg-white hover:text-stone-800"
          aria-label="Close settings"
        >
          <X className="h-5 w-5" />
        </Pressable>
      </div>

      <div className="settings-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
        {!contentReady ? (
          <SettingsDrawerSkeleton />
        ) : (
        <div className="space-y-5 pb-2">
          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Appearance
            </h3>

            <SettingToggle
              label="Dark Mode"
              description="Uses darker native-style surfaces for Audio Mode, sheets, and non-camera UI."
              checked={settings.darkMode}
              onChange={(checked) => onUpdate({ darkMode: checked })}
            />
          </section>

          <section className="settings-group space-y-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Quick Tuner Access
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-500">
                Open the tuner without loading Camera Mode, takes, or the media workspace.
              </p>
            </div>

            {QUICK_TUNER_SETUPS.map((setup) => (
              <QuickTunerAccessRow
                key={setup.id}
                setup={setup}
                onOpen={() => setActiveQuickTunerSetupId(setup.id)}
              />
            ))}

            {onOpenQuickTuner ? (
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                onClick={onOpenQuickTuner}
                className="settings-group-row flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 text-sm font-semibold text-sky-700 shadow-sm"
              >
                <Gauge className="h-4.5 w-4.5" aria-hidden />
                Test Quick Tuner
              </Pressable>
            ) : null}
          </section>

          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Audio Recording
            </h3>

            <SettingToggle
              label="Hands-Free Record & Play"
              description="In Camera and Audio modes, starts the visible take when your playing crosses the trigger level, stops after silence, then plays it back automatically."
              checked={settings.autoSoundRecording}
              onChange={(checked) => onUpdate({ autoSoundRecording: checked })}
            />

            <SettingToggle
              label="Use iPhone Mic"
              description="When headphones are connected, record with the iPhone microphone instead of the headset mic."
              checked={settings.micInputPreference === 'iphone'}
              onChange={(checked) =>
                onUpdate({ micInputPreference: checked ? 'iphone' : 'headphone' })
              }
            />

            <div className="space-y-3 pl-1 pt-1">
              <SettingSlider
                label="Stop After Silence"
                description="How long the app waits before ending the take and starting playback."
                value={settings.soundSilenceSeconds}
                min={0}
                max={6}
                step={0.5}
                unit="s"
                formatValue={(value) => (value === 0 ? 'Immediate' : `${value}s`)}
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
          </section>

          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Pitch & Tuning
            </h3>

            <SettingToggle
              label="Pitch Analysis"
              description="Shows a live pitch graph and tuner during playback. With hands-free recording, analysis appears on the main screen while each take plays back."
              checked={hudQuickSettings.pitchTrackerEnabled}
              onChange={handlePitchTrackerToggle}
            />

            <div className="pt-1">
              <SettingInstrumentPicker
                value={settings.tunerInstrument}
                onChange={(tunerInstrument) => onUpdate({ tunerInstrument })}
              />
            </div>

            <AnimatedExpand open={hudQuickSettings.pitchTrackerEnabled}>
              <div className="space-y-3 pt-3">
                <SettingToggle
                  label="Idle Mic Tuner"
                  description="Between takes, listen through the microphone and show a live tuner on the main screen. Turn off to analyze pitch only during playback."
                  checked={settings.liveMicTunerEnabled}
                  onChange={(checked) => onUpdate({ liveMicTunerEnabled: checked })}
                />
              </div>
            </AnimatedExpand>

            <SettingSlider
              label="Drone Volume"
              description="Reference-tone loudness for the tuner drone keyboard. Lower levels reduce speaker bleed into the mic."
              value={settings.droneVolume}
              min={0}
              max={100}
              step={1}
              unit="%"
              formatValue={(value) => `${value}%`}
              onChange={(droneVolume) => onUpdate({ droneVolume })}
            />

            <div className="settings-group-row rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl">
              <p className="text-sm font-semibold text-stone-900">Drone Waveform</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                Timbre for reference tones on the tuner keyboard.
              </p>

              <IOSSegmentedControl
                className="mt-3"
                layoutId="settings-drone-waveform-segment"
                ariaLabel="Drone waveform"
                value={settings.droneWaveform}
                onChange={(droneWaveform: DroneWaveform) => onUpdate({ droneWaveform })}
                segments={DRONE_WAVEFORM_OPTIONS.map((option) => ({
                  id: option.value,
                  label: option.label,
                }))}
              />
            </div>
          </section>

          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Playback
            </h3>

            <div data-tutorial="settings-enhancer">
              <SettingToggle
                label="Audio Enhancer"
                description="Bakes smart EQ, compression, and reverb presets into new recordings, and enhances playback of older takes. Off keeps the original flat mix."
                checked={hudQuickSettings.audioEnhancerEnabled}
                onChange={onAudioEnhancerChange}
              />
            </div>

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

          <section className="settings-group space-y-3">
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
              description="Tactile confirmation for important buttons, toggles, recording actions, and long presses."
              checked={settings.hapticFeedback}
              onChange={(checked) => onUpdate({ hapticFeedback: checked })}
            />
          </section>

          <section className="settings-group space-y-3">
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

          {(onOpenLabs || onOpenCreatorStudio || onOpenMultitrack) && (
            <section className="settings-group space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Experimental (In Development)
              </h3>

              {onOpenLabs && (
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={onOpenLabs}
                  className="settings-group-row flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/72 px-4 py-4 text-left shadow-sm backdrop-blur-xl"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900">🧪 Labs</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      Prototype games like Scale Rush. Does not affect recording or playback.
                    </p>
                  </div>
                </Pressable>
              )}

              {onOpenCreatorStudio && (
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={onOpenCreatorStudio}
                  className="settings-group-row flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/72 px-4 py-4 text-left shadow-sm backdrop-blur-xl"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Creator Studio</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      Trim, crop, and export a video take.
                    </p>
                  </div>
                </Pressable>
              )}

              {onOpenMultitrack && (
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={onOpenMultitrack}
                  className="settings-group-row flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/72 px-4 py-4 text-left shadow-sm backdrop-blur-xl"
                >
                  <div>
                    <p className="text-sm font-semibold text-stone-900">Multitrack</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                      Record up to six synced camera boxes with optional music on screen.
                    </p>
                  </div>
                </Pressable>
              )}

            </section>
          )}

          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Learn the App
            </h3>

            <div className="settings-learn-list">
              {[
                ['recording-modes', 'Recording Modes'],
                ['hands-free-recording', 'Hands-Free Recording'],
                ['quick-settings-widgets', 'Quick Settings Widgets'],
                ['take-vault', 'Take Vault'],
                ['pinning-best-takes', 'Best Take Pinning'],
                ['media-youtube', 'Media & YouTube'],
                ['expand-mode', 'Expand Mode'],
                ['metronome', 'Metronome'],
                ['tuner-drones', 'Tuner & Drones'],
              ].map(([id, label]) => (
                <Pressable
                  key={id}
                  type="button"
                  intensity="soft"
                  haptic="light"
                  onClick={() => setActiveHelpTopicId(id as HelpTopicId)}
                  className="settings-learn-row"
                >
                  <span>{label}</span>
                  <ChevronRight className="h-4 w-4" />
                </Pressable>
              ))}
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                onClick={handleResetTutorials}
                className="settings-learn-row settings-learn-row--reset"
              >
                <span>Reset Tutorials</span>
                <RotateCcw className="h-4 w-4" />
              </Pressable>
            </div>
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
      <HelpSheet topic={activeHelpTopic} onClose={() => setActiveHelpTopicId(null)} />
      <AnimatedBottomSheet
        isOpen={activeQuickTunerSetup !== null}
        onClose={() => setActiveQuickTunerSetupId(null)}
        ariaLabel={activeQuickTunerSetup ? `Set up ${activeQuickTunerSetup.title}` : 'Quick Tuner setup'}
        elevated
        elevatedLight
        maxHeightClass="max-h-[min(72vh,42rem)]"
        zClass={{ backdrop: 'z-[110]', sheet: 'z-[120]' }}
      >
        {activeQuickTunerSetup ? (
          <>
            <div className="native-sheet-header flex shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5 pb-4 pt-3">
              <div className="native-sheet-title-block min-w-0 flex-1">
                <span className="native-sheet-kicker">Quick Tuner Access</span>
                <h2 className="native-sheet-title">{activeQuickTunerSetup.title}</h2>
                <p className="native-sheet-subtitle">{activeQuickTunerSetup.description}</p>
              </div>
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                onClick={() => setActiveQuickTunerSetupId(null)}
                className="native-sheet-close grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70"
                aria-label="Close setup instructions"
              >
                <X className="h-5 w-5" />
              </Pressable>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 pt-5">
              <ol className="space-y-4">
                {activeQuickTunerSetup.steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                      {index + 1}
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-stone-700">{step}</p>
                  </li>
                ))}
              </ol>
              {activeQuickTunerSetup.note ? (
                <p className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900/75">
                  {activeQuickTunerSetup.note}
                </p>
              ) : null}
              <p className="mt-5 text-xs leading-relaxed text-stone-400">
                iOS owns these customization screens, so BestTake provides the correct steps instead of showing a toggle that cannot change the system assignment.
              </p>
            </div>
          </>
        ) : null}
      </AnimatedBottomSheet>
    </>
  )
}
