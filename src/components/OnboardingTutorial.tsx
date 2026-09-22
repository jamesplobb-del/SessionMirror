import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, AudioLines, Timer, Pin, FolderOpen, Layers, ListChecks, Music2, Play, SlidersHorizontal, Gamepad2 } from 'lucide-react'
import { ONBOARDING_CARDS } from '../utils/tutorialContent'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import type { RoutineBuilderMode } from './RoutineBuilder'
import { INSTRUMENT_FAMILIES, getInstrumentProfile, getInstrumentProfilesByFamily } from '../utils/instrumentProfiles'
import { getTunerTransposition } from '../utils/tunerTransposition'
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
              ? `${profile.label} selected · ${getTunerTransposition(profile.tunerTransposition).shortLabel} written pitch. Change this anytime from Home.`
              : 'Choose your main instrument, or set this later.'}</p>
          </div>}

          {card.id === 'tools' && <div className="practice-intro__list">
            <div><AudioLines /><span><strong>Tuner & Drone</strong><p>Check your pitch. Play against a drone. See your tendencies in Insights.</p></span></div>
            <div><Timer /><span><strong>Metronome</strong><p>Set the beat. Use Program for tempo changes.</p></span></div>
            <div><Gamepad2 /><span><strong>Games</strong><p>Practice pitch and sight-reading by playing.</p></span></div>
          </div>}

          {card.id === 'record' && <div className="practice-intro__list">
            <div><Play /><span><strong>Listen back</strong><p>Tap Record to start and stop. Tap the saved take to play it.</p></span></div>
            <div><Pin /><span><strong>Keep your best</strong><p>Pin a Best Take to compare with your next try.</p></span></div>
            <div><FolderOpen /><span><strong>Library</strong><p>Takes save automatically. Open Library above Record to listen or share.</p></span></div>
            <p className="practice-intro__tip">Hands-free: hold Record to turn it on. Play to start; pause to stop.</p>
          </div>}

          {card.id === 'workspace' && <div className="practice-intro__list">
            <div><Layers /><span><strong>Floating tools</strong><p>Tap a widget’s circle to open it. Drag its header to move it; use the chevron to collapse it.</p></span></div>
            <div><Music2 /><span><strong>References</strong><p>Add YouTube or audio in References. Use its Resize grip for size, expand button for Expand View, or minus to collapse.</p></span></div>
            <div><SlidersHorizontal /><span><strong>Audio Enhance & Multitrack</strong><p>Open these from Workspace. Multitrack uses separate parts, a portrait layout, and waveform trimming.</p></span></div>
          </div>}

          {last && <>
            <p className="practice-intro__note">Your routine stays in a small widget. Tap its title for every step; pause or finish from the widget.</p>
            <button className="practice-intro__primary practice-intro__quick-play" onClick={() => finish(onQuickPlay)}><Play />Record & compare<ArrowRight /></button>
            <button className="practice-intro__secondary" onClick={() => finish(() => onChooseRoutine('presets'))}><ListChecks />Choose a routine<ArrowRight /></button>
            <button className="practice-intro__secondary" onClick={() => finish(() => onChooseRoutine('build'))}>Build my own routine<ArrowRight /></button>
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
