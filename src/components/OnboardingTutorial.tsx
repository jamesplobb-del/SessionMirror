import { useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  CircleDot,
  FolderOpen,
  Gauge,
  Maximize2,
  Mic2,
  Music2,
  Play,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Video,
  WandSparkles,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { useTutorial } from '../context/TutorialContext'
import { markOnboardingComplete, type TutorialIconId } from '../utils/onboardingTutorial'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { triggerLightHaptic } from '../utils/haptics'

const ICONS: Record<TutorialIconId, LucideIcon> = {
  welcome: Sparkles,
  camera: Camera,
  takes: FolderOpen,
  expand: Maximize2,
  media: Upload,
  handsfree: WandSparkles,
  audio: Mic2,
  tools: Gauge,
  settings: Settings2,
  done: CheckCircle2,
}

interface OnboardingTutorialProps {
  onClose: () => void
  hapticFeedback?: boolean
}

function MiniTakeCard({
  tone,
  label,
  title,
}: {
  tone: 'gold' | 'blue'
  label: string
  title: string
}) {
  const isGold = tone === 'gold'
  return (
    <div className={`tutorial-mini-card tutorial-mini-card--${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`tutorial-mini-badge ${isGold ? 'bg-amber-400 text-white' : 'bg-sky-500 text-white'}`}>
          {label}
        </span>
        <span className="tutorial-mini-dot">•••</span>
      </div>
      <p className="mt-3 text-[1.05rem] font-semibold text-slate-950">{title}</p>
      <div className={`tutorial-wave tutorial-wave--${tone}`} aria-hidden>
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} style={{ height: `${20 + ((index * 17) % 34)}%` }} />
        ))}
      </div>
    </div>
  )
}

function CameraVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--camera">
      <div className="tutorial-phone-top">
        <span>BestTake</span>
        <span className="tutorial-pill-icon"><Camera className="h-4 w-4" /></span>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3">
        <MiniTakeCard tone="gold" label="BEST TAKE" title="Reference" />
        <MiniTakeCard tone="blue" label="CURRENT" title="New take" />
      </div>
      <div className="tutorial-record-row">
        <span><Music2 className="h-4 w-4" /></span>
        <span><Camera className="h-4 w-4" /></span>
        <span className="tutorial-record-button"><Video className="h-5 w-5" /></span>
        <span><Mic2 className="h-4 w-4" /></span>
        <span><SlidersHorizontal className="h-4 w-4" /></span>
      </div>
    </div>
  )
}

function SplitVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--light">
      <div className="grid h-full gap-3">
        <MiniTakeCard tone="gold" label="BEST TAKE" title="Top comparison" />
        <MiniTakeCard tone="blue" label="CURRENT" title="Bottom comparison" />
      </div>
      <div className="tutorial-expand-chip">
        <Maximize2 className="h-4 w-4" />
        Expand Mode
      </div>
    </div>
  )
}

function MediaVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--light">
      <div className="tutorial-media-card">
        <span className="tutorial-mini-badge bg-amber-400 text-white">BEST TAKE</span>
        <p>Add a reference</p>
        <div className="grid grid-cols-2 gap-2">
          <span><Upload className="h-4 w-4" /> Upload</span>
          <span><Youtube className="h-4 w-4 text-red-500" /> YouTube</span>
        </div>
      </div>
    </div>
  )
}

function HandsFreeVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--dark">
      <div className="tutorial-handsfree-ring">
        <WandSparkles className="h-10 w-10" />
      </div>
      <p className="text-center text-xl font-semibold text-white">Hands-free Practice</p>
      <div className="tutorial-handsfree-flow">
        <span>Listen</span>
        <span>Record</span>
        <span>Playback</span>
      </div>
    </div>
  )
}

function AudioVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--audio">
      <div className="tutorial-audio-ring">
        <Mic2 className="h-12 w-12" />
      </div>
      <p className="text-center text-xl font-semibold text-slate-950">Ready to record</p>
      <div className="grid gap-3">
        <MiniTakeCard tone="gold" label="BEST TAKE" title="Best audio" />
        <MiniTakeCard tone="blue" label="CURRENT" title="Current audio" />
      </div>
    </div>
  )
}

function ToolsVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--tools">
      <div className="tutorial-tabs">
        <span>Audio</span>
        <span className="active">Metronome</span>
        <span>Tuner</span>
      </div>
      <div className="tutorial-tempo-wheel">
        <span>100</span>
        <small>BPM</small>
      </div>
      <div className="tutorial-tool-row">
        <span><Play className="h-4 w-4" /> Tap Tempo</span>
        <span><CircleDot className="h-4 w-4" /> Drone</span>
      </div>
    </div>
  )
}

function SettingsVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--light">
      {['Enhanced Audio', 'iPhone Mic', 'Dark Mode', 'Take Cards'].map((label) => (
        <div key={label} className="tutorial-setting-row">
          <span>{label}</span>
          <span className="tutorial-switch" />
        </div>
      ))}
    </div>
  )
}

function DoneVisual() {
  return (
    <div className="tutorial-visual tutorial-visual--done">
      <div className="tutorial-done-mark">
        <CheckCircle2 className="h-14 w-14" />
      </div>
      <p className="text-center text-xl font-semibold text-slate-950">Practice flow ready</p>
    </div>
  )
}

function TutorialVisual({ visual }: { visual: string }) {
  if (visual === 'split') return <SplitVisual />
  if (visual === 'media') return <MediaVisual />
  if (visual === 'handsfree') return <HandsFreeVisual />
  if (visual === 'audio') return <AudioVisual />
  if (visual === 'tools') return <ToolsVisual />
  if (visual === 'settings') return <SettingsVisual />
  if (visual === 'done') return <DoneVisual />
  return <CameraVisual />
}

export default function OnboardingTutorial({
  onClose,
  hapticFeedback = true,
}: OnboardingTutorialProps) {
  const tutorial = useTutorial()
  const step = tutorial?.step
  const stepIndex = tutorial?.stepIndex ?? 0
  const stepCount = tutorial?.stepCount ?? 1

  useEffect(() => {
    document.body.classList.add('tutorial-active')
    return () => {
      document.body.classList.remove('tutorial-active')
    }
  }, [])

  const finish = useCallback(() => {
    markOnboardingComplete()
    onClose()
  }, [onClose])

  const handleSkip = useCallback(() => {
    void triggerLightHaptic(hapticFeedback)
    finish()
  }, [finish, hapticFeedback])

  const handleNext = useCallback(() => {
    if (!tutorial || !step) return
    void triggerLightHaptic(hapticFeedback)
    if (step.completeOn === 'finish' || stepIndex >= stepCount - 1) {
      finish()
      return
    }
    tutorial.advanceStep()
  }, [finish, hapticFeedback, step, stepCount, stepIndex, tutorial])

  const handleBack = useCallback(() => {
    if (!tutorial || stepIndex === 0) return
    void triggerLightHaptic(hapticFeedback)
    tutorial.previousStep()
  }, [hapticFeedback, stepIndex, tutorial])

  if (!tutorial || !step || typeof document === 'undefined') return null

  const Icon = ICONS[step.icon]

  const content = (
    <div className="native-tutorial fixed inset-0 z-[145]" role="dialog" aria-modal="true" aria-label="BestTake guide">
      <motion.div
        className="native-tutorial__backdrop absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="native-tutorial__sheet"
        initial={{ opacity: 0, y: 34, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={iosSpringSnappy}
        style={motionGpuLayer}
      >
        <div className="native-tutorial__grabber" aria-hidden />

        <header className="native-tutorial__header">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={handleBack}
            disabled={stepIndex === 0}
            className="native-tutorial__nav-button"
            aria-label="Previous tutorial step"
          >
            <ChevronLeft className="h-5 w-5" />
          </Pressable>
          <div className="min-w-0 text-center">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {step.eyebrow}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {stepIndex + 1} of {stepCount}
            </p>
          </div>
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={handleSkip}
            className="native-tutorial__skip"
          >
            Skip
          </Pressable>
        </header>

        <div className="native-tutorial__progress" aria-hidden>
          {Array.from({ length: stepCount }, (_, index) => (
            <span
              key={index}
              className={index <= stepIndex ? 'native-tutorial__progress-dot--active' : ''}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            className="native-tutorial__content"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            <TutorialVisual visual={step.visual} />

            <section className="native-tutorial__copy">
              <div className="native-tutorial__icon">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h1>{step.title}</h1>
              <p>{step.body}</p>
              <div className="native-tutorial__bullets">
                {step.bullets.map((item) => (
                  <div key={item} className="native-tutorial__bullet">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        </AnimatePresence>

        <footer className="native-tutorial__footer">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={handleNext}
            className="native-tutorial__primary"
          >
            {step.primaryCta ?? 'Next'}
          </Pressable>
        </footer>
      </motion.div>
    </div>
  )

  return createPortal(content, document.body)
}
