import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import {
  RotateCcw,
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
import { useTutorialAction } from '../context/TutorialContext'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  /** Shared overlay values — the on-screen Overlays menu owns their toggles. */
  hudQuickSettings: HudQuickSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onAudioEnhancerChange: (enabled: boolean) => void
  onReset: () => void
  onReplayTutorial?: () => void
  onOpenLabs?: () => void
  onOpenQuickTuner?: () => void
  onOpenQuickMetronome?: () => void
  recordingMode: 'video' | 'audio'
}

type QuickFunctionDestination = 'tuner' | 'metronome'

type QuickFunctionSetupId =
  | 'lockScreen'
  | 'controlCenter'
  | 'actionButton'
  | 'siriOrShortcuts'
  | 'appIcon'

interface QuickFunctionSetup {
  id: QuickFunctionSetupId
  destination: QuickFunctionDestination
  toolName: string
  title: string
  description: string
  action: string
  availability: string
  steps: string[]
  note?: string
}

function createQuickFunctionSetups(
  destination: QuickFunctionDestination,
): QuickFunctionSetup[] {
  const isTuner = destination === 'tuner'
  const toolName = isTuner ? 'Quick Tuner' : 'Metronome'
  const spokenName = isTuner ? 'BestTake tuner' : 'BestTake metronome'
  const appIconAction = isTuner ? 'Open Tuner' : 'Open Metronome'

  return [{
    id: 'lockScreen',
    destination,
    toolName,
    title: 'Lock Screen',
    description: `Open the ${isTuner ? 'tuner' : 'metronome'} from the bottom of your Lock Screen.`,
    action: 'Set Up',
    availability: 'iOS 18+',
    steps: [
      'Touch and hold your Lock Screen, then tap Customize.',
      'Choose Lock Screen and tap one of the control positions at the bottom.',
      `Search for BestTake, then choose ${toolName}.`,
      `Tap Done. The control now opens directly to the ${isTuner ? 'lightweight tuner' : 'metronome'}.`,
    ],
  },
  {
    id: 'controlCenter',
    destination,
    toolName,
    title: 'Control Center',
    description: `Open ${toolName} from anywhere.`,
    action: 'Set Up',
    availability: 'iOS 18+',
    steps: [
      'Open Control Center and touch and hold an empty area.',
      'Tap Add a Control.',
      `Search for BestTake, then choose ${toolName}.`,
      'Drag the control to your preferred position.',
    ],
  },
  {
    id: 'actionButton',
    destination,
    toolName,
    title: 'Action Button',
    description: `Hold the Action Button to open ${toolName}.`,
    action: 'Set Up',
    availability: 'Supported iPhones',
    steps: [
      'Open the iOS Settings app and choose Action Button.',
      'Choose Controls or Shortcut, depending on the options shown on your iPhone.',
      `Select BestTake ${toolName}.`,
      'Press and hold the Action Button to test it.',
    ],
    note: 'Action Button availability depends on your iPhone model. BestTake cannot detect or change this assignment for you.',
  },
  {
    id: 'siriOrShortcuts',
    destination,
    toolName,
    title: 'Siri & Shortcuts',
    description: `Say “Open ${spokenName}” or add it to Shortcuts.`,
    action: 'Set Up',
    availability: 'iOS 16+',
    steps: [
      `Say “Open ${spokenName}” or “Start ${spokenName}.”`,
      'Or open the Shortcuts app and browse App Shortcuts.',
      `Choose BestTake, then add ${toolName} to a shortcut or automation.`,
      `The shortcut opens directly to the ${isTuner ? 'same lightweight tuner' : 'metronome'}.`,
    ],
  },
  {
    id: 'appIcon',
    destination,
    toolName,
    title: 'App Icon',
    description: `Long-press the BestTake icon and choose ${appIconAction}.`,
    action: 'How It Works',
    availability: 'Ready after install',
    steps: [
      'Find BestTake on your Home Screen or in the App Library.',
      'Touch and hold the BestTake app icon.',
      `Tap ${appIconAction}.`,
      'This static action is available before the app is opened for the first time.',
    ],
  }]
}

const QUICK_FUNCTION_SETUPS: Record<QuickFunctionDestination, QuickFunctionSetup[]> = {
  tuner: createQuickFunctionSetups('tuner'),
  metronome: createQuickFunctionSetups('metronome'),
}

const LEARN_APP_SECTIONS: {
  title: string
  topics: { id: HelpTopicId; label: string }[]
}[] = [
  {
    title: 'Recording',
    topics: [
      { id: 'camera-mode', label: 'Camera Mode' },
      { id: 'audio-mode', label: 'Audio Mode' },
      { id: 'hands-free-recording', label: 'Hands-Free Recording' },
      { id: 'overlays', label: 'Overlays' },
    ],
  },
  {
    title: 'Practice Tools',
    topics: [
      { id: 'practice-sessions', label: 'Practice Routines' },
      { id: 'metronome', label: 'Metronome' },
      { id: 'tuner-drones', label: 'Tuner & Drones' },
      { id: 'pitch-insights', label: 'Pitch Insights' },
      { id: 'quick-tools-access', label: 'iPhone Quick Tools' },
    ],
  },
  {
    title: 'Takes & References',
    topics: [
      { id: 'take-vault', label: 'Take Vault' },
      { id: 'take-cards', label: 'Move Take Cards' },
      { id: 'pinning-best-takes', label: 'Best Take Pinning' },
      { id: 'expand-mode', label: 'Expand View' },
      { id: 'media-youtube', label: 'Media & YouTube' },
    ],
  },
]

type SettingsSectionId = 'general' | 'recording' | 'tuner' | 'playback' | 'more'

const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'recording', label: 'Recording' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'playback', label: 'Playback' },
  { id: 'more', label: 'More' },
]

function QuickFunctionAccessRow({
  setup,
  onOpen,
}: {
  setup: QuickFunctionSetup
  onOpen: () => void
}) {
  return (
    <Pressable
      type="button"
      data-tutorial={`quick-tools-${setup.destination}-${setup.id}`}
      intensity="soft"
      haptic="light"
      onClick={onOpen}
      className="flex min-h-[4.2rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50/70"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="text-sm font-semibold text-stone-900">{setup.title}</strong>
          <small className="rounded-full bg-stone-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-500">
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
  onAudioEnhancerChange,
  onReset,
  onReplayTutorial,
  onOpenLabs,
  onOpenQuickTuner,
  onOpenQuickMetronome,
  recordingMode,
}: SettingsDrawerProps) {
  const notifyTutorial = useTutorialAction()
  const { contentReady, markContentReady } = useDeferredDrawerContent(isOpen)
  const [activeHelpTopicId, setActiveHelpTopicId] = useState<HelpTopicId | null>(null)
  const [activeQuickFunctionSetup, setActiveQuickFunctionSetup] =
    useState<QuickFunctionSetup | null>(null)
  const [quickFunctionsAccessOpen, setQuickFunctionsAccessOpen] = useState(false)
  const [quickAccessDestination, setQuickAccessDestination] =
    useState<QuickFunctionDestination>('tuner')
  const settingsScrollRef = useRef<HTMLDivElement>(null)
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>('general')
  const helpTopicById = useMemo(
    () => new Map(HELP_TOPICS.map((topic) => [topic.id, topic] as const)),
    [],
  )
  const activeHelpTopic: HelpTopic | null = activeHelpTopicId
    ? helpTopicById.get(activeHelpTopicId) ?? null
    : null
  useEffect(() => {
    if (!isOpen) {
      setActiveQuickFunctionSetup(null)
      setQuickFunctionsAccessOpen(false)
      setQuickAccessDestination('tuner')
      setActiveSettingsSection('general')
    }
  }, [isOpen])

  const handleSettingsScroll = useCallback(() => {
    const container = settingsScrollRef.current
    if (!container) return

    const threshold = container.getBoundingClientRect().top + 76
    let nextSection: SettingsSectionId = SETTINGS_SECTIONS[0].id
    for (const section of SETTINGS_SECTIONS) {
      const element = container.querySelector<HTMLElement>(`#settings-section-${section.id}`)
      if (!element) continue
      if (element.getBoundingClientRect().top <= threshold) nextSection = section.id
      else break
    }
    setActiveSettingsSection((current) => current === nextSection ? current : nextSection)
  }, [])

  const handleSettingsSectionSelect = useCallback((sectionId: SettingsSectionId) => {
    const container = settingsScrollRef.current
    const target = container?.querySelector<HTMLElement>(`#settings-section-${sectionId}`)
    if (!container || !target) return

    setActiveSettingsSection(sectionId)
    const containerTop = container.getBoundingClientRect().top
    const targetTop = target.getBoundingClientRect().top - containerTop + container.scrollTop
    container.scrollTo({ top: Math.max(0, targetTop - 66), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const activeButton = settingsScrollRef.current?.querySelector<HTMLElement>(
      `[data-settings-section="${activeSettingsSection}"]`,
    )
    activeButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeSettingsSection, isOpen])

  const handleSheetEnterComplete = useCallback(() => {
    markContentReady()
  }, [markContentReady])

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

  const handleQuickFunctionsAccessToggle = useCallback(() => {
    const nextOpen = !quickFunctionsAccessOpen
    setQuickFunctionsAccessOpen(nextOpen)
    if (nextOpen) notifyTutorial?.('quick-tools-opened')
  }, [notifyTutorial, quickFunctionsAccessOpen])

  const handleQuickAccessDestinationChange = useCallback(
    (destination: QuickFunctionDestination) => {
      setQuickAccessDestination(destination)
      if (destination === 'metronome') {
        notifyTutorial?.('quick-tools-metronome-selected')
      }
    },
    [notifyTutorial],
  )

  const handleOpenQuickFunctionSetup = useCallback(
    (setup: QuickFunctionSetup) => {
      setActiveQuickFunctionSetup(setup)
      notifyTutorial?.('quick-tool-setup-opened')
    },
    [notifyTutorial],
  )

  const handleCloseQuickFunctionSetup = useCallback(() => {
    setActiveQuickFunctionSetup(null)
    notifyTutorial?.('quick-tool-setup-closed')
  }, [notifyTutorial])

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
          <p className="native-sheet-subtitle">Choose a section to find what you need quickly</p>
        </div>
        <Pressable
          type="button"
          data-tutorial="settings-close"
          intensity="icon"
          onClick={handleCloseClick}
          haptic="light"
          className="native-sheet-close relative z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70 hover:bg-white hover:text-stone-800"
          aria-label="Close settings"
        >
          <X className="h-5 w-5" />
        </Pressable>
      </div>

      <div
        ref={settingsScrollRef}
        onScroll={handleSettingsScroll}
        className="settings-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4"
      >
        {!contentReady ? (
          <SettingsDrawerSkeleton />
        ) : (
        <div className="space-y-5 pb-2">
          <nav className="settings-category-nav" aria-label="Settings sections">
            <div className="settings-category-nav__track">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="settings-category-nav__button"
                  data-settings-section={section.id}
                  aria-controls={`settings-section-${section.id}`}
                  aria-current={activeSettingsSection === section.id ? 'page' : undefined}
                  onClick={() => handleSettingsSectionSelect(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          <section id="settings-section-general" className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              General
            </h3>

            <SettingToggle
              label="Dark Mode"
              description="Uses darker native-style surfaces for Audio Mode, sheets, and non-camera UI."
              checked={settings.darkMode}
              onChange={(checked) => onUpdate({ darkMode: checked })}
            />

            <SettingToggle
              label="Haptic Feedback"
              description="Tactile confirmation for important buttons, toggles, recording actions, and long presses."
              checked={settings.hapticFeedback}
              onChange={(checked) => onUpdate({ hapticFeedback: checked })}
            />
          </section>

          <section id="settings-section-recording" className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Audio Recording
            </h3>

            <div className="settings-group-row rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl">
              <p className="text-sm font-semibold text-stone-900">Hands-Free Recording</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                Turn this on from the record controls. It waits for your playing, records the visible take, stops after silence, then plays the take back automatically. These settings tune that behavior.
              </p>
            </div>

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
                description="Used by Hands-Free Recording to decide when to end a quiet take and begin playback."
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
                description="Used by Hands-Free Recording. Left catches quieter playing; right needs a stronger signal."
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

          <section id="settings-section-tuner" className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Pitch & Tuning
            </h3>

            <div className="settings-group-row rounded-2xl border border-white/70 bg-white/72 px-4 py-4 shadow-sm backdrop-blur-xl">
              <p className="text-sm font-semibold text-stone-900">Pitch Analysis</p>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                Turn it on from Overlays. The options below choose how pitch is detected and what happens between takes.
              </p>
            </div>

            <div className="settings-group-row overflow-hidden rounded-2xl border border-white/70 bg-white/72 shadow-sm backdrop-blur-xl">
              <Pressable
                type="button"
                data-tutorial="quick-tools-access"
                intensity="soft"
                haptic="light"
                onClick={handleQuickFunctionsAccessToggle}
                className="flex min-h-[4.75rem] w-full items-center gap-3 px-4 py-4 text-left"
                aria-expanded={quickFunctionsAccessOpen}
                aria-controls="quick-functions-access-settings"
              >
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-stone-900">
                    Quick Tools Access
                  </strong>
                  <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
                    Open the tuner or metronome directly from iOS.
                  </span>
                </span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${
                    quickFunctionsAccessOpen ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                />
              </Pressable>

              <AnimatedExpand open={quickFunctionsAccessOpen}>
                <div
                  id="quick-functions-access-settings"
                  className="border-t border-stone-100"
                >
                  <div className="px-4 pb-2 pt-3" data-tutorial="quick-tools-destination">
                    <IOSSegmentedControl
                      value={quickAccessDestination}
                      onChange={handleQuickAccessDestinationChange}
                      segments={[
                        { id: 'tuner', label: 'Quick Tuner' },
                        { id: 'metronome', label: 'Metronome' },
                      ]}
                      layoutId="settings-quick-tool-segment"
                      size="sm"
                      ariaLabel="Quick tool"
                    />
                  </div>

                  <div className="divide-y divide-stone-100">
                    {QUICK_FUNCTION_SETUPS[quickAccessDestination].map((setup) => (
                      <QuickFunctionAccessRow
                        key={`${setup.destination}-${setup.id}`}
                        setup={setup}
                        onOpen={() => handleOpenQuickFunctionSetup(setup)}
                      />
                    ))}
                  </div>

                  {quickAccessDestination === 'tuner' && onOpenQuickTuner ? (
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      onClick={onOpenQuickTuner}
                      className="flex min-h-12 w-full items-center justify-between border-t border-stone-100 px-4 py-3 text-left text-sm font-semibold text-sky-600 transition-colors hover:bg-sky-50/70"
                    >
                      <span>Test Quick Tuner</span>
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Pressable>
                  ) : null}

                  {quickAccessDestination === 'metronome' && onOpenQuickMetronome ? (
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      onClick={onOpenQuickMetronome}
                      className="flex min-h-12 w-full items-center justify-between border-t border-stone-100 px-4 py-3 text-left text-sm font-semibold text-sky-600 transition-colors hover:bg-sky-50/70"
                    >
                      <span>Test Quick Metronome</span>
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Pressable>
                  ) : null}
                </div>
              </AnimatedExpand>
            </div>

            <div className="pt-1">
              <SettingInstrumentPicker
                value={settings.tunerInstrument}
                onChange={(tunerInstrument) => onUpdate({ tunerInstrument })}
              />
            </div>

            <SettingToggle
              label="Idle Mic Tuner"
              description="When Pitch Analysis is on, listen through the microphone and show a live tuner between takes. Turn this off to analyze only during playback."
              checked={settings.liveMicTunerEnabled}
              onChange={(checked) => onUpdate({ liveMicTunerEnabled: checked })}
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

          <section id="settings-section-playback" className="settings-group space-y-3">
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
                  settings={settings.audioEnhancerSettings}
                  onChange={(audioEnhancerSettings) => onUpdate({ audioEnhancerSettings })}
                />
              </div>
            </AnimatedExpand>

            <SettingToggle
              label="Mute Metronome During Take Playback"
              description="When the metronome is shown from Overlays, silence its clicks while a take plays. Its timing keeps running so it stays locked when playback ends."
              checked={settings.muteMetronomeDuringPlayback}
              onChange={(checked) => onUpdate({ muteMetronomeDuringPlayback: checked })}
            />

            <SettingToggle
              label="Keep YouTube Out of Recordings"
              description="While recording, pauses YouTube reference playback and turns on mic echo cancellation to reduce bleed. Resume playback manually when you are done."
              checked={settings.excludeYoutubeFromRecording}
              onChange={(checked) => onUpdate({ excludeYoutubeFromRecording: checked })}
            />
          </section>

          <div id="settings-section-more" className="space-y-5">
          {onOpenLabs && (
            <section className="settings-group space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Practice
              </h3>

              <Pressable
                type="button"
                intensity="soft"
                onClick={onOpenLabs}
                className="settings-group-row flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/72 px-4 py-4 text-left shadow-sm backdrop-blur-xl"
              >
                <div>
                  <p className="text-sm font-semibold text-stone-900">Practice Games</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-stone-500">
                    Pitch-controlled practice games. Does not affect recording or playback.
                  </p>
                </div>
              </Pressable>
            </section>
          )}

          <section className="settings-group space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              Learn the App
            </h3>

            <div className="settings-learn-sections">
              {LEARN_APP_SECTIONS.map((section) => (
                <div key={section.title} className="settings-learn-section">
                  <p className="settings-learn-section__title">{section.title}</p>
                  <div className="settings-learn-list">
                    {section.topics.map(({ id, label }) => (
                      <Pressable
                        key={id}
                        type="button"
                        intensity="soft"
                        haptic="light"
                        onClick={() => setActiveHelpTopicId(id)}
                        className="settings-learn-row"
                      >
                        <span>{label}</span>
                        <ChevronRight className="h-4 w-4" />
                      </Pressable>
                    ))}
                  </div>
                </div>
              ))}
              <div className="settings-learn-list settings-learn-list--reset">
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
        </div>
        )}
      </div>
      </AnimatedBottomSheet>
      <HelpSheet topic={activeHelpTopic} onClose={() => setActiveHelpTopicId(null)} />
      <AnimatedBottomSheet
        isOpen={activeQuickFunctionSetup !== null}
        onClose={handleCloseQuickFunctionSetup}
        ariaLabel={
          activeQuickFunctionSetup
            ? `Set up ${activeQuickFunctionSetup.toolName} ${activeQuickFunctionSetup.title}`
            : 'Quick tool setup'
        }
        elevated
        elevatedLight
        maxHeightClass="max-h-[min(72vh,42rem)]"
        zClass={{ backdrop: 'z-[110]', sheet: 'z-[120]' }}
      >
        {activeQuickFunctionSetup ? (
          <>
            <div className="native-sheet-header flex shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5 pb-4 pt-3">
              <div className="native-sheet-title-block min-w-0 flex-1">
                <span className="native-sheet-kicker">
                  Quick Tools · {activeQuickFunctionSetup.toolName}
                </span>
                <h2 className="native-sheet-title">{activeQuickFunctionSetup.title}</h2>
                <p className="native-sheet-subtitle">{activeQuickFunctionSetup.description}</p>
              </div>
              <Pressable
                type="button"
                data-tutorial="quick-tool-setup-close"
                intensity="icon"
                haptic="light"
                onClick={handleCloseQuickFunctionSetup}
                className="native-sheet-close grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70"
                aria-label="Close setup instructions"
              >
                <X className="h-5 w-5" />
              </Pressable>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 pt-5">
              <ol className="space-y-4">
                {activeQuickFunctionSetup.steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                      {index + 1}
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-stone-700">{step}</p>
                  </li>
                ))}
              </ol>
              {activeQuickFunctionSetup.note ? (
                <p className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900/75">
                  {activeQuickFunctionSetup.note}
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
