import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { CheckCircle2, ChevronLeft, Sparkles, X } from 'lucide-react'
import Pressable from './ui/Pressable'
import { ONBOARDING_CARDS } from '../utils/tutorialContent'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { triggerLightHaptic } from '../utils/haptics'

interface OnboardingTutorialProps {
  onClose: () => void
  hapticFeedback?: boolean
}

export default function OnboardingTutorial({
  onClose,
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
    onClose()
  }, [onClose])

  const handleNext = useCallback(() => {
    void triggerLightHaptic(hapticFeedback)
    if (isLast) {
      finish()
      return
    }
    setIndex((value) => Math.min(ONBOARDING_CARDS.length - 1, value + 1))
  }, [finish, hapticFeedback, isLast])

  const handleBack = useCallback(() => {
    void triggerLightHaptic(hapticFeedback)
    setIndex((value) => Math.max(0, value - 1))
  }, [hapticFeedback])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="onboarding-lite fixed inset-0 z-[145]" role="dialog" aria-modal="true" aria-label="BestTake onboarding">
      <motion.div
        className="onboarding-lite__backdrop absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="onboarding-lite__card"
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={iosSpringSnappy}
        style={motionGpuLayer}
      >
        <header className="onboarding-lite__top">
          <Pressable
            type="button"
            intensity="icon"
            onClick={handleBack}
            disabled={index === 0}
            className="onboarding-lite__icon-btn"
            aria-label="Previous card"
          >
            <ChevronLeft className="h-5 w-5" />
          </Pressable>
          <div className="onboarding-lite__glyph" aria-hidden>
            <Sparkles className="h-5 w-5" />
          </div>
          <Pressable
            type="button"
            intensity="icon"
            onClick={finish}
            className="onboarding-lite__icon-btn"
            aria-label="Close onboarding"
          >
            <X className="h-4 w-4" />
          </Pressable>
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
            <h1>{card.title}</h1>
            <p>{card.body}</p>
          </motion.section>
        </AnimatePresence>

        <div className="onboarding-lite__dots" aria-hidden>
          {ONBOARDING_CARDS.map((item, dotIndex) => (
            <span key={item.id} className={dotIndex === index ? 'is-active' : undefined} />
          ))}
        </div>

        <footer className="onboarding-lite__footer">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            hapticFeedback={hapticFeedback}
            onClick={handleNext}
            className="onboarding-lite__primary"
          >
            {isLast ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Start Practicing
              </>
            ) : (
              'Next'
            )}
          </Pressable>
        </footer>
      </motion.div>
    </div>,
    document.body,
  )
}
