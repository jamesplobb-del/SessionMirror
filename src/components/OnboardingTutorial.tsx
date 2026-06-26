import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  AudioWaveform,
  CircleCheck,
  Clapperboard,
  FolderOpen,
  Maximize2,
  Sparkles,
  Video,
  Youtube,
  type LucideIcon,
} from 'lucide-react'
import Pressable from './ui/Pressable'
import { useTutorial } from '../context/TutorialContext'
import {
  getTutorialTargetSelector,
  markOnboardingComplete,
  type TutorialIconId,
  type TutorialPanelDock,
  type TutorialTargetId,
} from '../utils/onboardingTutorial'
import { iosFade } from '../utils/motionPresets'
import { triggerLightHaptic } from '../utils/haptics'

const ICONS: Record<TutorialIconId, LucideIcon> = {
  welcome: Sparkles,
  record: Video,
  review: Clapperboard,
  vault: FolderOpen,
  auto: AudioWaveform,
  expand: Maximize2,
  youtube: Youtube,
  done: CircleCheck,
}

const SPOTLIGHT_PAD = 10
const PANEL_GAP = 12
const MIN_PANEL_SPACE = 148

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

function readTargetRect(target: TutorialTargetId | null): SpotlightRect | null {
  if (!target || typeof document === 'undefined') return null
  const node = document.querySelector(getTutorialTargetSelector(target))
  if (!node) return null
  const rect = node.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const margin = 10
  const vpH = window.visualViewport?.height ?? window.innerHeight
  const vpW = window.visualViewport?.width ?? window.innerWidth
  const offsetTop = window.visualViewport?.offsetTop ?? 0
  const offsetLeft = window.visualViewport?.offsetLeft ?? 0

  const top = Math.max(offsetTop + margin, rect.top - SPOTLIGHT_PAD)
  const left = Math.max(offsetLeft + margin, rect.left - SPOTLIGHT_PAD)
  const right = Math.min(offsetLeft + vpW - margin, rect.right + SPOTLIGHT_PAD)
  const bottom = Math.min(offsetTop + vpH - margin, rect.bottom + SPOTLIGHT_PAD)

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function resolvePanelDock(
  preferred: TutorialPanelDock,
  spotlight: SpotlightRect | null,
): TutorialPanelDock {
  if (preferred === 'center' || !spotlight) return preferred

  const vpH = window.visualViewport?.height ?? window.innerHeight
  const offsetTop = window.visualViewport?.offsetTop ?? 0
  const safeTop = 56
  const safeBottom = 56

  const spaceAbove = spotlight.top - offsetTop - safeTop
  const spaceBelow =
    vpH - (spotlight.top + spotlight.height - offsetTop) - safeBottom

  if (preferred === 'top' && spaceAbove < MIN_PANEL_SPACE && spaceBelow > spaceAbove) {
    return 'bottom'
  }
  if (preferred === 'bottom' && spaceBelow < MIN_PANEL_SPACE && spaceAbove > spaceBelow) {
    return 'top'
  }

  return preferred
}

function panelLayoutStyle(
  dock: TutorialPanelDock,
  spotlight: SpotlightRect | null,
): React.CSSProperties {
  const safeTop = 'max(0.75rem, env(safe-area-inset-top, 0px))'
  const safeBottom = 'max(0.75rem, env(safe-area-inset-bottom, 0px))'
  const horizontal = 'max(1rem, env(safe-area-inset-left, 0px))'

  const base: React.CSSProperties = {
    position: 'fixed',
    left: horizontal,
    right: horizontal,
    marginLeft: 'auto',
    marginRight: 'auto',
    width: '100%',
    maxWidth: '24rem',
    zIndex: 44,
    boxSizing: 'border-box',
  }

  if (dock === 'center' || !spotlight) {
    return {
      ...base,
      top: safeTop,
      bottom: safeBottom,
      marginTop: 'auto',
      marginBottom: 'auto',
      maxHeight: `calc(100dvh - ${safeTop} - ${safeBottom} - 1.5rem)`,
    }
  }

  if (dock === 'top') {
    const maxHeight = Math.max(120, spotlight.top - PANEL_GAP - 16)
    return {
      ...base,
      top: safeTop,
      maxHeight: `${maxHeight}px`,
    }
  }

  const spotlightBottom = spotlight.top + spotlight.height
  const vpH = window.visualViewport?.height ?? window.innerHeight
  const maxHeight = Math.max(120, vpH - spotlightBottom - PANEL_GAP - 16)
  return {
    ...base,
    bottom: safeBottom,
    maxHeight: `${maxHeight}px`,
  }
}

function SpotlightShade({ rect }: { rect: SpotlightRect | null }) {
  if (!rect) {
    return (
      <div className="tutorial-spotlight__shade pointer-events-auto absolute inset-0 bg-black/70 backdrop-blur-[1px]" />
    )
  }

  const { top, left, width, height } = rect
  const bottom = top + height
  const right = left + width

  return (
    <>
      <div
        className="tutorial-spotlight__shade pointer-events-auto absolute left-0 right-0 top-0 bg-black/70 backdrop-blur-[1px]"
        style={{ height: top }}
      />
      <div
        className="tutorial-spotlight__shade pointer-events-auto absolute left-0 bg-black/70 backdrop-blur-[1px]"
        style={{ top, width: left, height }}
      />
      <div
        className="tutorial-spotlight__shade pointer-events-auto absolute bg-black/70 backdrop-blur-[1px]"
        style={{ top, left: right, right: 0, height }}
      />
      <div
        className="tutorial-spotlight__shade pointer-events-auto absolute left-0 right-0 bg-black/70 backdrop-blur-[1px]"
        style={{ top: bottom, bottom: 0 }}
      />
    </>
  )
}

function SpotlightRing({ rect }: { rect: SpotlightRect }) {
  return (
    <div
      className="tutorial-spotlight__ring pointer-events-none fixed rounded-2xl border-2 border-sky-400/85 shadow-[0_0_0_1px_rgba(56,189,248,0.28),0_0_24px_rgba(56,189,248,0.24)]"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        zIndex: 52,
      }}
      aria-hidden
    />
  )
}

interface OnboardingTutorialProps {
  onClose: () => void
  hapticFeedback?: boolean
}

export default function OnboardingTutorial({
  onClose,
  hapticFeedback = true,
}: OnboardingTutorialProps) {
  const tutorial = useTutorial()
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)

  const step = tutorial?.step
  const stepIndex = tutorial?.stepIndex ?? 0
  const stepCount = tutorial?.stepCount ?? 1

  const syncSpotlight = useCallback(() => {
    if (!step) return
    setSpotlightRect(readTargetRect(step.target))
  }, [step])

  useLayoutEffect(() => {
    syncSpotlight()
  }, [syncSpotlight, step?.id, step?.target])

  useEffect(() => {
    document.body.classList.add('tutorial-active')
    return () => {
      document.body.classList.remove('tutorial-active')
    }
  }, [])

  useEffect(() => {
    syncSpotlight()
    window.addEventListener('resize', syncSpotlight)
    window.visualViewport?.addEventListener('resize', syncSpotlight)
    window.visualViewport?.addEventListener('scroll', syncSpotlight)
    const intervalId = window.setInterval(syncSpotlight, 250)
    return () => {
      window.removeEventListener('resize', syncSpotlight)
      window.visualViewport?.removeEventListener('resize', syncSpotlight)
      window.visualViewport?.removeEventListener('scroll', syncSpotlight)
      window.clearInterval(intervalId)
    }
  }, [syncSpotlight])

  useEffect(() => {
    if (!step?.target) return
    const node = document.querySelector(getTutorialTargetSelector(step.target))
    if (!node) return
    node.classList.add('tutorial-spotlight-target')
    return () => {
      node.classList.remove('tutorial-spotlight-target')
    }
  }, [step?.id, step?.target])

  const finish = useCallback(() => {
    markOnboardingComplete()
    onClose()
  }, [onClose])

  const handleSkip = useCallback(() => {
    void triggerLightHaptic(hapticFeedback)
    finish()
  }, [finish, hapticFeedback])

  const handlePrimary = useCallback(() => {
    if (!tutorial || !step) return
    void triggerLightHaptic(hapticFeedback)

    if (step.completeOn === 'finish') {
      finish()
      return
    }

    tutorial.advanceStep()
  }, [finish, hapticFeedback, step, tutorial])

  const resolvedDock = useMemo(
    () => resolvePanelDock(step?.panelDock ?? 'center', spotlightRect),
    [spotlightRect, step?.panelDock],
  )

  const panelStyle = useMemo(
    () => panelLayoutStyle(resolvedDock, spotlightRect),
    [resolvedDock, spotlightRect],
  )

  if (!tutorial || !step) return null

  const Icon = ICONS[step.icon]
  const showSpotlight = Boolean(step.target && spotlightRect)
  const isCenterStep = resolvedDock === 'center' || !step.target

  const content = (
    <>
      <div
        className="tutorial-spotlight-backdrop pointer-events-none fixed inset-0 z-[38]"
        aria-hidden
      >
        <SpotlightShade rect={showSpotlight ? spotlightRect : isCenterStep ? null : spotlightRect} />
      </div>

      {showSpotlight && spotlightRect && <SpotlightRing rect={spotlightRect} />}

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          className="onboarding-tutorial__panel pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-[1.25rem] border border-white/12 bg-stone-950/94 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          style={panelStyle}
          role="dialog"
          aria-modal="true"
          aria-label="BestTake tutorial"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={iosFade}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/8 px-4 pb-3 pt-[max(0.875rem,env(safe-area-inset-top,0px))]">
            <div className="flex min-w-0 items-center gap-2" aria-hidden>
              {Array.from({ length: stepCount }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === stepIndex
                      ? 'w-5 bg-white'
                      : index < stepIndex
                        ? 'w-1.5 bg-white/55'
                        : 'w-1.5 bg-white/20'
                  }`}
                />
              ))}
            </div>
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              onClick={handleSkip}
              className="shrink-0 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium text-white/55 hover:bg-white/8 hover:text-white/85"
            >
              Skip
            </Pressable>
          </div>

          <div className="tutorial-panel__body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-white/92">
                <Icon className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.65} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="tutorial-panel__title text-[1.0625rem] font-semibold leading-tight tracking-[-0.02em] text-white">
                  {step.title}
                </h2>
                <p className="tutorial-panel__body-text mt-2 text-[0.9375rem] leading-[1.45] text-white/72">
                  {step.body}
                </p>
                {step.hint && step.target && (
                  <p className="mt-3 text-[0.8125rem] leading-snug text-sky-200/78">{step.hint}</p>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-white/8 px-4 py-3 pb-[max(0.875rem,env(safe-area-inset-bottom,0px))]">
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              onClick={handlePrimary}
              className="flex h-11 w-full items-center justify-center rounded-full bg-white text-[0.9375rem] font-semibold text-stone-950 shadow-[0_8px_24px_rgba(255,255,255,0.14)] hover:bg-white/94"
            >
              {step.primaryCta ?? 'Next'}
            </Pressable>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
