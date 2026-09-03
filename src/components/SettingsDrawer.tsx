import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  AudioLines,
  BookOpen,
  ChevronRight,
  CloudUpload,
  Gamepad2,
  Mic,
  Moon,
  RotateCcw,
  Smartphone,
  Sparkles,
  VolumeX,
  Vibrate,
  X,
  Youtube,
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
  /** Shared overlay values — the on-screen Workspace menu owns their toggles. */
  hudQuickSettings: HudQuickSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onAudioEnhancerChange: (enabled: boolean) => void
  onReset: () => void
  onReplayTutorial?: () => void
  onOpenLabs?: () => void
  onOpenQuickTuner?: () => void
  onOpenQuickMetronome?: () => void
}

/** iOS-style icon tile fills. Kept off the app's gold/blue signal colors where
 *  those already mean "live position" and "selected" elsewhere in the UI. */
const TINT = {
  indigo: '#5856d6',
  pink: '#ff2d55',
  blue: '#1598ff',
  red: '#ff3b30',
  green: '#34c759',
  teal: '#30b0c7',
  purple: '#af52de',
  orange: '#ff9500',
  gray: '#8e8e93',
} as const

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
    note: 'Only iPhone 15 Pro and later have an Action Button.',
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
      { id: 'overlays', label: 'Workspace' },
      { id: 'multitrack', label: 'Multitrack' },
    ],
  },
  {
    title: 'Practice Tools',
    topics: [
      { id: 'practice-games', label: 'Practice Games' },
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

/**
 * Scroll a container to the position `resolveTop()` reports, over `duration`,
 * driven by rAF.
 *
 * `scrollTo({ behavior: 'smooth' })` is silently ignored in some WebKit/WKWebView
 * states, which left the category nav highlighting a section it never scrolled
 * to. Animating by hand always lands on the target.
 *
 * `resolveTop` is re-read when the tween finishes: content above the target can
 * reflow mid-animation, and re-resolving lands the heading exactly where it
 * belongs instead of a dozen pixels under the sticky nav.
 *
 * Returns a cancel function so a manual scroll can take the wheel back.
 */
function animateScrollTop(
  container: HTMLElement,
  resolveTop: () => number,
  duration = 420,
): () => void {
  const top = resolveTop()
  const start = container.scrollTop
  const distance = top - start
  if (Math.abs(distance) < 1) {
    container.scrollTop = top
    return () => {}
  }

  let frame = 0
  let cancelled = false
  let done = false
  const began = performance.now()

  const step = (now: number) => {
    if (cancelled) return
    const progress = Math.min(1, (now - began) / duration)
    // Standard iOS ease-out: fast off the mark, settles into the target.
    const eased = 1 - Math.pow(1 - progress, 3)
    container.scrollTop = start + distance * eased
    if (progress < 1) {
      frame = requestAnimationFrame(step)
      return
    }
    done = true
    container.scrollTop = resolveTop()
  }

  frame = requestAnimationFrame(step)

  // rAF is frozen while the page is hidden, so the tween can stall partway (or
  // never start). Land on the target regardless — arriving is what matters.
  const settle = window.setTimeout(() => {
    if (cancelled || done) return
    cancelAnimationFrame(frame)
    container.scrollTop = resolveTop()
  }, duration + 140)

  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
    window.clearTimeout(settle)
  }
}

type SettingsSectionId = 'general' | 'recording' | 'tuner' | 'playback' | 'help'

const SETTINGS_SECTIONS: ReadonlyArray<{ id: SettingsSectionId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'recording', label: 'Recording' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'playback', label: 'Playback' },
  { id: 'help', label: 'Help' },
]

/* ---------------------------------------------------------------- primitives */

function SettingsSection({
  id,
  title,
  children,
}: {
  id: SettingsSectionId
  title: string
  children: ReactNode
}) {
  return (
    <section id={`settings-section-${id}`} className="set-section" aria-label={title}>
      <h3 className="set-section__title">{title}</h3>
      {children}
    </section>
  )
}

function SettingsGroup({
  title,
  footer,
  plain = false,
  children,
}: {
  title?: string
  footer?: ReactNode
  /** Rows without icon tiles — separators run full width. */
  plain?: boolean
  children: ReactNode
}) {
  return (
    <div className="set-group">
      {title ? <p className="set-group__title">{title}</p> : null}
      <div className={`set-list${plain ? ' set-list--plain' : ''}`}>{children}</div>
      {footer ? <p className="set-group__footer">{footer}</p> : null}
    </div>
  )
}

function RowIcon({ icon: Icon, tint }: { icon: typeof Moon; tint: string }) {
  return (
    <span className="set-row__icon" style={{ ['--set-icon-bg' as string]: tint }} aria-hidden>
      <Icon />
    </span>
  )
}

function SwitchRow({
  icon,
  tint,
  label,
  checked,
  onChange,
  disabled = false,
}: {
  icon: typeof Moon
  tint: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <motion.label
      className={`set-row set-row--switch ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
      whileTap={disabled ? undefined : { scale: 0.996 }}
      transition={iosSpringSnappy}
    >
      <RowIcon icon={icon} tint={tint} />
      <span className="set-row__label">{label}</span>
      <IOSSwitch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        ariaLabel={label}
      />
    </motion.label>
  )
}

function LinkRow({
  icon,
  tint,
  label,
  value,
  expanded,
  onClick,
  dataTutorial,
  ariaControls,
}: {
  icon: typeof Moon
  tint: string
  label: string
  value?: string
  /** Present when the row toggles an inline panel — rotates the chevron. */
  expanded?: boolean
  onClick: () => void
  dataTutorial?: string
  ariaControls?: string
}) {
  return (
    <Pressable
      type="button"
      intensity="soft"
      haptic="light"
      onClick={onClick}
      className="set-row"
      data-tutorial={dataTutorial}
      aria-expanded={expanded}
      aria-controls={ariaControls}
    >
      <RowIcon icon={icon} tint={tint} />
      <span className="set-row__label">{label}</span>
      {value ? <span className="set-row__value">{value}</span> : null}
      <ChevronRight
        className={`set-row__chevron${expanded ? ' set-row__chevron--open' : ''}`}
        aria-hidden
      />
    </Pressable>
  )
}

function TopicRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Pressable
      type="button"
      intensity="soft"
      haptic="light"
      onClick={onClick}
      className="set-row"
    >
      <span className="set-row__label">{label}</span>
      <ChevronRight className="set-row__chevron" aria-hidden />
    </Pressable>
  )
}

function SliderBlock({
  label,
  hint,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (value: number) => string
  onChange: (value: number) => void
}) {
  const display = formatValue(value)

  return (
    <div className="set-block">
      <div className="set-block__head">
        <span className="set-block__label">{label}</span>
        <motion.span
          key={display}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 1 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          className="set-block__value"
        >
          {display}
        </motion.span>
      </div>
      {hint ? <p className="set-block__hint">{hint}</p> : null}
      <input
        type="range"
        className="set-slider"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function SegmentBlock<T extends string>({
  label,
  hint,
  value,
  segments,
  layoutId,
  size = 'md',
  onChange,
}: {
  label: string
  hint?: string
  value: T
  segments: { id: T; label: string }[]
  layoutId: string
  /** Four or more options need the compact size to stay on one line. */
  size?: 'sm' | 'md'
  onChange: (value: T) => void
}) {
  return (
    <div className="set-block">
      <div className="set-block__head">
        <span className="set-block__label">{label}</span>
      </div>
      {hint ? <p className="set-block__hint">{hint}</p> : null}
      <IOSSegmentedControl
        className="mt-2.5"
        layoutId={layoutId}
        ariaLabel={label}
        size={size}
        value={value}
        onChange={onChange}
        segments={segments}
      />
    </div>
  )
}

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
      className="set-subrow"
    >
      <span className="min-w-0 flex-1">
        <span className="set-subrow__title">
          {setup.title}
          <small className="set-row__badge">{setup.availability}</small>
        </span>
        <span className="set-subrow__desc">{setup.description}</span>
      </span>
      <span className="set-subrow__action">
        {setup.action}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </span>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ drawer */

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
  /** Set while a jump-nav scroll animates, so the spy does not fight the target. */
  const jumpTargetRef = useRef<SettingsSectionId | null>(null)
  const jumpTimerRef = useRef<number | null>(null)
  const cancelJumpScrollRef = useRef<(() => void) | null>(null)
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>('general')
  const helpTopicById = useMemo(
    () => new Map(HELP_TOPICS.map((topic) => [topic.id, topic] as const)),
    [],
  )
  const activeHelpTopic: HelpTopic | null = activeHelpTopicId
    ? helpTopicById.get(activeHelpTopicId) ?? null
    : null
  const activeInstrument = getTunerProfile(settings.tunerInstrument)

  useEffect(() => {
    if (!isOpen) {
      setActiveQuickFunctionSetup(null)
      setQuickFunctionsAccessOpen(false)
      setQuickAccessDestination('tuner')
      setActiveSettingsSection('general')
      jumpTargetRef.current = null
      cancelJumpScrollRef.current?.()
    }
  }, [isOpen])

  useEffect(() => () => {
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    cancelJumpScrollRef.current?.()
  }, [])

  const handleSettingsScroll = useCallback(() => {
    const container = settingsScrollRef.current
    if (!container) return
    if (jumpTargetRef.current) return

    // A section counts as current once its heading passes just under the nav.
    const threshold = container.getBoundingClientRect().top + 82
    let nextSection: SettingsSectionId = SETTINGS_SECTIONS[0].id
    for (const section of SETTINGS_SECTIONS) {
      const element = container.querySelector<HTMLElement>(`#settings-section-${section.id}`)
      if (!element) continue
      if (element.getBoundingClientRect().top <= threshold) nextSection = section.id
    }

    // The last section can never reach the threshold on a short tail, so claim
    // it once the list is scrolled to the bottom.
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 24) {
      nextSection = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id
    }

    setActiveSettingsSection((current) => (current === nextSection ? current : nextSection))
  }, [])

  const handleSettingsSectionSelect = useCallback((sectionId: SettingsSectionId) => {
    const container = settingsScrollRef.current
    const target = container?.querySelector<HTMLElement>(`#settings-section-${sectionId}`)
    if (!container || !target) return

    setActiveSettingsSection(sectionId)
    jumpTargetRef.current = sectionId
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = window.setTimeout(() => {
      jumpTargetRef.current = null
    }, 520)

    // Leave the sticky nav's height clear above the heading.
    const resolveTop = () => {
      const containerTop = container.getBoundingClientRect().top
      const targetTop = target.getBoundingClientRect().top - containerTop + container.scrollTop
      return Math.max(0, targetTop - 70)
    }
    cancelJumpScrollRef.current?.()
    cancelJumpScrollRef.current = animateScrollTop(container, resolveTop)
  }, [])

  // Keep the active pill in view — horizontally only. scrollIntoView would also
  // nudge the vertical container, fighting the jump-nav tween mid-flight.
  useEffect(() => {
    if (!isOpen) return
    const activeButton = settingsScrollRef.current?.querySelector<HTMLElement>(
      `[data-settings-section="${activeSettingsSection}"]`,
    )
    const track = activeButton?.parentElement
    if (!activeButton || !track) return
    if (track.scrollWidth <= track.clientWidth) return

    const target =
      activeButton.offsetLeft - (track.clientWidth - activeButton.offsetWidth) / 2
    track.scrollLeft = Math.max(0, Math.min(target, track.scrollWidth - track.clientWidth))
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
        elevatedLight
        onEnterComplete={handleSheetEnterComplete}
      >
      <div className="settings-sheet settings-sheet-host flex min-h-0 flex-1 flex-col">
      <div className="native-sheet-header sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 px-5 pb-4 pt-3">
        <div className="native-sheet-title-block min-w-0 flex-1">
          <span className="native-sheet-kicker">BestTake</span>
          <h2 className="native-sheet-title">Settings</h2>
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
        className="settings-drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-3"
      >
        {!contentReady ? (
          <SettingsDrawerSkeleton />
        ) : (
        <div className="set-page pb-2">
          <nav className="set-nav" aria-label="Settings sections">
            <div className="set-nav__track">
              {SETTINGS_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className="set-nav__button"
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

          <SettingsSection id="general" title="General">
            <SettingsGroup footer="Dark Mode restyles sheets, Audio Mode, and every screen that is not backed by the camera.">
              <SwitchRow
                icon={Moon}
                tint={TINT.indigo}
                label="Dark Mode"
                checked={settings.darkMode}
                onChange={(checked) => onUpdate({ darkMode: checked })}
              />
              <SwitchRow
                icon={Vibrate}
                tint={TINT.pink}
                label="Haptic Feedback"
                checked={settings.hapticFeedback}
                onChange={(checked) => onUpdate({ hapticFeedback: checked })}
              />
            </SettingsGroup>

            <SettingsGroup
              title="Storage"
              footer="Takes stay on this device either way. Video fills iCloud fast — turn this off if your storage is tight."
            >
              <SwitchRow
                icon={CloudUpload}
                tint={TINT.blue}
                label="Back Up Takes to iCloud"
                checked={settings.backUpTakesToIcloud}
                onChange={(checked) => onUpdate({ backUpTakesToIcloud: checked })}
              />
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="recording" title="Recording">
            <SettingsGroup footer="With headphones connected, record through the iPhone's own mic instead of the headset mic.">
              <SwitchRow
                icon={Mic}
                tint={TINT.red}
                label="Use iPhone Mic"
                checked={settings.micInputPreference === 'iphone'}
                onChange={(checked) =>
                  onUpdate({ micInputPreference: checked ? 'iphone' : 'headphone' })
                }
              />
            </SettingsGroup>

            <SettingsGroup
              title="Hands-Free"
              plain
              footer="Hands-free waits for you to play, records the take, stops after silence, then plays it straight back. Turn it on from the record button — these two dials tune how it listens."
            >
              <SliderBlock
                label="Stop After Silence"
                hint="How long a quiet passage runs before the take ends."
                value={settings.soundSilenceSeconds}
                min={0}
                max={6}
                step={0.5}
                formatValue={(value) => (value === 0 ? 'Immediate' : `${value}s`)}
                onChange={(value) => onUpdate({ soundSilenceSeconds: value })}
              />
              <SliderBlock
                label="Trigger Sensitivity"
                hint="How loud you have to play before recording starts."
                value={settings.soundVolumeThreshold}
                min={1}
                max={100}
                step={1}
                formatValue={(value) =>
                  value <= 30 ? 'Sensitive' : value >= 70 ? 'Loud only' : 'Balanced'
                }
                onChange={(value) => onUpdate({ soundVolumeThreshold: value })}
              />
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="tuner" title="Tuner">
            <SettingsGroup
              plain
              footer={activeInstrument.description}
            >
              <SegmentBlock
                label="Source Instrument"
                hint="Tunes pitch detection and trace smoothing for the Tuner tab and pitch analysis."
                value={settings.tunerInstrument}
                layoutId="settings-instrument-segment"
                onChange={(tunerInstrument: TunerInstrument) => onUpdate({ tunerInstrument })}
                segments={TUNER_INSTRUMENTS.map((instrument) => ({
                  id: instrument,
                  label: getTunerProfile(instrument).label,
                }))}
              />
            </SettingsGroup>

            <SettingsGroup footer="The Tuner tab always listens. This adds the same live readout to Audio Mode and Review between takes.">
              <SwitchRow
                icon={AudioLines}
                tint={TINT.teal}
                label="Idle Mic Tuner"
                checked={settings.liveMicTunerEnabled}
                onChange={(checked) => onUpdate({ liveMicTunerEnabled: checked })}
              />
            </SettingsGroup>

            <SettingsGroup plain footer="Timbre of the reference tones on the tuner keyboard.">
              <SegmentBlock
                label="Drone Waveform"
                size="sm"
                value={settings.droneWaveform}
                layoutId="settings-drone-waveform-segment"
                onChange={(droneWaveform: DroneWaveform) => onUpdate({ droneWaveform })}
                segments={DRONE_WAVEFORM_OPTIONS.map((option) => ({
                  id: option.value,
                  label: option.label,
                }))}
              />
            </SettingsGroup>

            <SettingsGroup footer="Reach the tuner or metronome from the Lock Screen, Control Center, the Action Button, or Siri — without opening BestTake first.">
              <LinkRow
                icon={Smartphone}
                tint={TINT.purple}
                label="Open From iOS"
                expanded={quickFunctionsAccessOpen}
                onClick={handleQuickFunctionsAccessToggle}
                dataTutorial="quick-tools-access"
                ariaControls="quick-functions-access-settings"
              />
              <AnimatedExpand open={quickFunctionsAccessOpen}>
                <div id="quick-functions-access-settings" className="set-nested">
                  <div data-tutorial="quick-tools-destination">
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
                </div>
                <div>
                  {QUICK_FUNCTION_SETUPS[quickAccessDestination].map((setup) => (
                    <QuickFunctionAccessRow
                      key={`${setup.destination}-${setup.id}`}
                      setup={setup}
                      onOpen={() => handleOpenQuickFunctionSetup(setup)}
                    />
                  ))}

                  {quickAccessDestination === 'tuner' && onOpenQuickTuner ? (
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      onClick={onOpenQuickTuner}
                      className="set-subrow set-row--action"
                    >
                      <span className="set-row__label">Test Quick Tuner</span>
                      <ChevronRight className="set-row__chevron" aria-hidden />
                    </Pressable>
                  ) : null}

                  {quickAccessDestination === 'metronome' && onOpenQuickMetronome ? (
                    <Pressable
                      type="button"
                      intensity="soft"
                      haptic="light"
                      onClick={onOpenQuickMetronome}
                      className="set-subrow set-row--action"
                    >
                      <span className="set-row__label">Test Quick Metronome</span>
                      <ChevronRight className="set-row__chevron" aria-hidden />
                    </Pressable>
                  ) : null}
                </div>
              </AnimatedExpand>
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="playback" title="Playback">
            <SettingsGroup footer="Bakes EQ, compression, and reverb into new recordings and enhances older takes on playback. Off keeps the flat original.">
              <div data-tutorial="settings-enhancer">
                <SwitchRow
                  icon={Sparkles}
                  tint={TINT.orange}
                  label="Audio Enhancer"
                  checked={hudQuickSettings.audioEnhancerEnabled}
                  onChange={onAudioEnhancerChange}
                />
              </div>
              <AnimatedExpand open={hudQuickSettings.audioEnhancerEnabled}>
                <div className="set-nested">
                  <AudioEnhancer
                    settings={settings.audioEnhancerSettings}
                    onChange={(audioEnhancerSettings) => onUpdate({ audioEnhancerSettings })}
                  />
                </div>
              </AnimatedExpand>
            </SettingsGroup>

            <SettingsGroup footer="Both keep other sound out of the take. The metronome's clock keeps running while muted, so it stays locked when playback ends.">
              <SwitchRow
                icon={VolumeX}
                tint={TINT.gray}
                label="Mute Metronome on Playback"
                checked={settings.muteMetronomeDuringPlayback}
                onChange={(checked) => onUpdate({ muteMetronomeDuringPlayback: checked })}
              />
              <SwitchRow
                icon={Youtube}
                tint={TINT.red}
                label="Pause YouTube While Recording"
                checked={settings.excludeYoutubeFromRecording}
                onChange={(checked) => onUpdate({ excludeYoutubeFromRecording: checked })}
              />
            </SettingsGroup>
          </SettingsSection>

          <SettingsSection id="help" title="Help">
            {onOpenLabs ? (
              <SettingsGroup footer="Pitch-controlled games for warm-ups. They never touch recording or playback.">
                <LinkRow
                  icon={Gamepad2}
                  tint={TINT.green}
                  label="Practice Games"
                  onClick={onOpenLabs}
                />
              </SettingsGroup>
            ) : null}

            {LEARN_APP_SECTIONS.map((section) => (
              <SettingsGroup key={section.title} title={section.title} plain>
                {section.topics.map(({ id, label }) => (
                  <TopicRow key={id} label={label} onClick={() => setActiveHelpTopicId(id)} />
                ))}
              </SettingsGroup>
            ))}

            <SettingsGroup>
              <LinkRow
                icon={BookOpen}
                tint={TINT.blue}
                label="Replay the Welcome Tour"
                onClick={handleResetTutorials}
              />
            </SettingsGroup>

            <SettingsGroup plain>
              <Pressable
                type="button"
                intensity="soft"
                haptic="warning"
                onClick={onReset}
                className="set-row set-row--center set-row--destructive"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                <span className="set-row__label">Reset All Settings</span>
              </Pressable>
            </SettingsGroup>
          </SettingsSection>
        </div>
        )}
      </div>
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
          <div className="settings-sheet flex min-h-0 flex-1 flex-col">
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
                    <p className="set-quick-step pt-1 text-sm leading-relaxed text-stone-700">{step}</p>
                  </li>
                ))}
              </ol>
              {activeQuickFunctionSetup.note ? (
                <p className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900/75">
                  {activeQuickFunctionSetup.note}
                </p>
              ) : null}
              <p className="set-quick-footnote mt-5 text-xs leading-relaxed text-stone-400">
                iOS owns these customization screens, so BestTake gives you the exact steps instead of a switch that cannot change a system assignment.
              </p>
            </div>
          </div>
        ) : null}
      </AnimatedBottomSheet>
    </>
  )
}
