import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ListChecks, Music2, Play } from 'lucide-react'
import { ONBOARDING_CARDS } from '../utils/tutorialContent'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import type { RoutineBuilderMode } from './RoutineBuilder'
import { INSTRUMENT_FAMILIES, getInstrumentProfile, getInstrumentProfilesByFamily } from '../utils/instrumentProfiles'
import { triggerLightHaptic } from '../utils/haptics'
import '../styles/practice-introduction.css'

interface OnboardingTutorialProps {
  onComplete: () => void
  onSkip: () => void
  onQuickPlay: () => void
  onSelectInstrument: (instrumentId: string) => void
  onChooseRoutine: (mode: RoutineBuilderMode) => void
  initialInstrumentId?: string
  hapticFeedback?: boolean
}

export default function OnboardingTutorial({ onComplete, onSkip, onQuickPlay, onSelectInstrument, onChooseRoutine, initialInstrumentId, hapticFeedback = true }: OnboardingTutorialProps) {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(initialInstrumentId ?? '')
  const dialog = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const reducedMotion = useReducedMotion()
  const card = ONBOARDING_CARDS[index]
  const last = index === ONBOARDING_CARDS.length - 1
  const profile = selected ? getInstrumentProfile(selected) : undefined

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog.current)
    const inertBefore = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('tutorial-active')
    return () => {
      siblings.forEach((element, index) => { element.inert = inertBefore[index] })
      document.body.style.overflow = overflow
      document.body.classList.remove('tutorial-active')
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [index])

  const finish = (action: () => void) => {
    markOnboardingComplete()
    action()
  }
  const advance = () => {
    void triggerLightHaptic(hapticFeedback)
    if (last) finish(onComplete)
    else setIndex(index + 1)
  }

  return createPortal(
    <div className="practice-intro" role="dialog" aria-modal="true" aria-labelledby="practice-intro-title" ref={dialog}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.stopPropagation(); finish(onSkip) }
        if (event.key !== 'Tab') return
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select') ?? [])
        const first = controls[0], end = controls.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
          event.preventDefault(); end?.focus()
        } else if (!event.shiftKey && document.activeElement === end) {
          event.preventDefault(); first?.focus()
        }
      }}>
      <div className={`practice-intro__shell ${index === 0 ? 'practice-intro__shell--welcome' : ''}`}>
        <header className="practice-intro__header">
          <span className="practice-intro__brand"><img src="/icons/icon.png" alt="" />BestTake</span>
          <button className="practice-intro__quiet" onClick={() => finish(onSkip)}>Skip intro</button>
        </header>
        <div className="practice-intro__progress" aria-label={`Step ${index + 1} of ${ONBOARDING_CARDS.length}`}>
          {ONBOARDING_CARDS.map((step, i) => <span key={step.id} data-filled={i <= index} />)}
        </div>
        <motion.main key={card.id} className="practice-intro__body" data-onboarding-card={card.id}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24 }}>

          {card.id === 'welcome' && <div className="practice-intro__welcome-mark" aria-hidden="true">
            <img src="/icons/icon.png" alt="" draggable={false} />
          </div>}
          <h1 id="practice-intro-title" tabIndex={-1} ref={heading}>{card.title}</h1>
          {!last && <p className="practice-intro__description">{card.body}</p>}

          {card.id === 'instrument' && <div className="practice-intro__panel">
            <Music2 className="practice-intro__large-icon" aria-hidden="true" />
            <label htmlFor="intro-instrument">Your instrument</label>
            <select id="intro-instrument" value={selected} onChange={(event) => {
              setSelected(event.target.value); onSelectInstrument(event.target.value)
            }}>
              <option value="" disabled>Choose your instrument</option>
              {INSTRUMENT_FAMILIES.map(family => <optgroup key={family} label={family}>
                {getInstrumentProfilesByFamily(family).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </optgroup>)}
            </select>
            <p className="practice-intro__note" aria-live="polite">{profile
              ? `${profile.label} selected. Suggested routines will fit your instrument; the tuner stays in concert pitch. Change your instrument anytime from Home.`
              : 'Choose your main instrument, or set this later.'}</p>
          </div>}

          {last && <>
            <p className="practice-intro__note">Your takes save automatically. Listen after the first one, then decide what to try next.</p>
            <button className="practice-intro__primary practice-intro__quick-play" onClick={() => finish(onQuickPlay)}><Play />Record my first take<ArrowRight /></button>
            <button className="practice-intro__secondary" onClick={() => finish(() => onChooseRoutine('presets'))}><ListChecks />Try a suggested routine<ArrowRight /></button>
          </>}
        </motion.main>
        <footer className="practice-intro__footer">
          <button aria-label="Previous step" className="practice-intro__back" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft /></button>
          <span className="practice-intro__count">{index + 1} / {ONBOARDING_CARDS.length}</span>
          <button className={last ? 'practice-intro__quiet' : 'practice-intro__primary'} onClick={advance}>{card.cta}<ArrowRight /></button>
        </footer>
      </div>
    </div>, document.body,
  )
}
