import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Check, MousePointer2 } from 'lucide-react'
import Pressable from './ui/Pressable'
import { ONBOARDING_CARDS } from '../utils/tutorialContent'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { triggerLightHaptic } from '../utils/haptics'

interface OnboardingTutorialProps {
  onComplete: () => void
  onSkip: () => void
  hapticFeedback?: boolean
}

export default function OnboardingTutorial({
  onComplete,
  onSkip,
  hapticFeedback = true,
}: OnboardingTutorialProps) {
  const [index, setIndex] = useState(0)
  const card = ONBOARDING_CARDS[index] ?? ONBOARDING_CARDS[0]
  const isLast = index >= ONBOARDING_CARDS.length - 1

  useEffect(() => {
    document.body.classList.add('tutorial-active')
    return () => {
      document.body.classList.remove('tutorial-active')
    }
  }, [])

  const finish = useCallback(() => {
    markOnboardingComplete()
    onComplete()
  }, [onComplete])

  const skip = useCallback(() => {
    markOnboardingComplete()
    onSkip()
  }, [onSkip])

  const handleNext = useCallback(() => {
    void triggerLightHaptic(hapticFeedback)
    if (isLast) {
      finish()
      return
    }
    setIndex((value) => Math.min(ONBOARDING_CARDS.length - 1, value + 1))
  }, [finish, hapticFeedback, isLast])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      handleNext()
    },
    [handleNext],
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="onboarding-lite fixed inset-0 z-[145]"
      role="dialog"
      aria-modal="true"
      aria-label="BestTake onboarding"
      tabIndex={0}
      onClick={handleNext}
      onKeyDown={handleKeyDown}
    >
      <motion.div
        className="onboarding-lite__backdrop absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className={`onboarding-lite__card onboarding-lite__card--${card.id}`}
        data-onboarding-card={card.id}
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={iosSpringSnappy}
        style={motionGpuLayer}
      >
        <header className="onboarding-lite__top onboarding-lite__top--single">
          <div className="onboarding-lite__glyph" aria-hidden>
            <img src="/icons/icon.png" alt="" draggable={false} />
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.section
            key={card.id}
            className="onboarding-lite__copy"
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            {card.kicker ? (
              <span className="onboarding-lite__kicker">{card.kicker}</span>
            ) : null}
            <h1>{card.title}</h1>
            <p>{card.body}</p>
            <div className="onboarding-lite__highlights" aria-label="Highlights">
              {card.highlights.map((highlight) => (
                <span key={highlight}>
                  <Check aria-hidden />
                  {highlight}
                </span>
              ))}
            </div>
          </motion.section>
        </AnimatePresence>

        <footer className="onboarding-lite__footer">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={(event) => {
              event.stopPropagation()
              skip()
            }}
            className="onboarding-lite__skip"
          >
            Skip Tour
          </Pressable>
          <div className="onboarding-lite__tap-hint" aria-hidden>
            <MousePointer2 className="h-4 w-4" />
            Start guided tour
          </div>
        </footer>
      </motion.div>
    </div>,
    document.body,
  )
}
