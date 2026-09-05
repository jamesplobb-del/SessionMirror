import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowRight, Check, ChevronDown, ListChecks, Sparkles } from 'lucide-react'
import Pressable from './ui/Pressable'
import { ONBOARDING_CARDS } from '../utils/tutorialContent'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import type { RoutineBuilderMode } from './RoutineBuilder'
import {
  INSTRUMENT_FAMILIES,
  getInstrumentProfile,
  getInstrumentProfilesByFamily,
} from '../utils/instrumentProfiles'
import { getTunerProfile } from '../utils/pitchConfig'
import { getTunerTransposition } from '../utils/tunerTransposition'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { triggerLightHaptic } from '../utils/haptics'

interface OnboardingTutorialProps {
  onComplete: () => void
  onSkip: () => void
  /** Applies the tuner and hands-free settings implied by the chosen instrument. */
  onSelectInstrument: (instrumentId: string) => void
  /** Ends the cards and opens the routine builder in the hub. */
  onChooseRoutine: (mode: RoutineBuilderMode) => void
  hapticFeedback?: boolean
}

export default function OnboardingTutorial({
  onComplete,
  onSkip,
  onSelectInstrument,
  onChooseRoutine,
  hapticFeedback = true,
}: OnboardingTutorialProps) {
  const [index, setIndex] = useState(0)
  const [selectedInstrument, setSelectedInstrument] = useState<string | null>(null)
  const card = ONBOARDING_CARDS[index] ?? ONBOARDING_CARDS[0]
  const isLast = index >= ONBOARDING_CARDS.length - 1
  const isInstrumentStep = card.id === 'instrument'
  const isRoutineStep = card.id === 'routine'
  const isChoiceStep = isInstrumentStep || isRoutineStep

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

  /** The card body advances on tap, but only where there is nothing to choose. */
  const handleCardTap = useCallback(() => {
    if (isChoiceStep) return
    handleNext()
  }, [handleNext, isChoiceStep])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isChoiceStep) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      handleNext()
    },
    [handleNext, isChoiceStep],
  )

  const handleChooseRoutine = useCallback(
    (mode: RoutineBuilderMode) => {
      void triggerLightHaptic(hapticFeedback)
      markOnboardingComplete()
      onChooseRoutine(mode)
    },
    [hapticFeedback, onChooseRoutine],
  )

  const handleSelectInstrument = useCallback(
    (instrumentId: string) => {
      if (!instrumentId) return
      void triggerLightHaptic(hapticFeedback)
      setSelectedInstrument(instrumentId)
      onSelectInstrument(instrumentId)
    },
    [hapticFeedback, onSelectInstrument],
  )

  if (typeof document === 'undefined') return null

  const selectedProfile = selectedInstrument ? getInstrumentProfile(selectedInstrument) : undefined
  const selectionSummary = selectedProfile
    ? `${getTunerProfile(selectedProfile.tunerInstrument).label} · Written pitch: ${
        getTunerTransposition(selectedProfile.tunerTransposition).shortLabel
      }`
    : null

  return createPortal(
    <div
      className="onboarding-lite fixed inset-0 z-[145]"
      role="dialog"
      aria-modal="true"
      aria-label="BestTake onboarding"
      tabIndex={0}
      onClick={handleCardTap}
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
        <header className="onboarding-lite__top">
          <div className="onboarding-lite__brand">
            <div className="onboarding-lite__glyph" aria-hidden>
              <img src="/icons/icon.png" alt="" draggable={false} />
            </div>
            <span>
              <strong>BestTake</strong>
              <small>Quick tour</small>
            </span>
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

            {isInstrumentStep ? (
              <div className="onboarding-lite__instrument-field">
                {/*
                 * A plain <select> on purpose: iOS renders it as the system
                 * wheel picker, so the instrument list scrolls the way every
                 * other picker on the device does and needs no scroll
                 * container of our own.
                 */}
                <select
                  className="onboarding-lite__instrument-select"
                  aria-label="Instrument"
                  data-placeholder={selectedInstrument === null}
                  value={selectedInstrument ?? ''}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => handleSelectInstrument(event.target.value)}
                >
                  <option value="" disabled>
                    Choose your instrument
                  </option>
                  {INSTRUMENT_FAMILIES.map((family) => (
                    <optgroup key={family} label={family}>
                      {getInstrumentProfilesByFamily(family).map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="onboarding-lite__instrument-chevron" aria-hidden />
              </div>
            ) : null}

            {isInstrumentStep && selectionSummary ? (
              <p className="onboarding-lite__instrument-summary" aria-live="polite">
                <Check aria-hidden />
                {selectionSummary}
              </p>
            ) : null}

            {isRoutineStep ? (
              <div className="onboarding-lite__routine-choices">
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className="onboarding-lite__routine-choice is-primary"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleChooseRoutine('build')
                  }}
                >
                  <ListChecks aria-hidden />
                  <span>
                    <strong>Build my routine</strong>
                    <small>Add the things you actually do, in order.</small>
                  </span>
                  <ArrowRight aria-hidden />
                </Pressable>
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className="onboarding-lite__routine-choice"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleChooseRoutine('presets')
                  }}
                >
                  <Sparkles aria-hidden />
                  <span>
                    <strong>Start from a preset</strong>
                    <small>
                      {selectedProfile ? `A common ${selectedProfile.label.toLowerCase()} routine to edit.` : 'A common routine you can edit.'}
                    </small>
                  </span>
                  <ArrowRight aria-hidden />
                </Pressable>
              </div>
            ) : null}

            {card.highlights?.length ? (
              <div className="onboarding-lite__highlights" aria-label="Highlights">
                {card.highlights.map((highlight) => (
                  <span key={highlight}>
                    <Check aria-hidden />
                    {highlight}
                  </span>
                ))}
              </div>
            ) : null}
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
            Skip tour
          </Pressable>
          {isChoiceStep ? (
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              hapticFeedback={hapticFeedback}
              onClick={(event) => {
                event.stopPropagation()
                handleNext()
              }}
              className={`onboarding-lite__tap-hint ${isRoutineStep ? 'onboarding-lite__tap-hint--quiet' : ''}`}
            >
              {card.cta}
              <ArrowRight className="h-4 w-4" />
            </Pressable>
          ) : (
            <div className="onboarding-lite__tap-hint" aria-hidden>
              {card.cta}
              <ArrowRight className="h-4 w-4" />
            </div>
          )}
        </footer>
      </motion.div>
    </div>,
    document.body,
  )
}
