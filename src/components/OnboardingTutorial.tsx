import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Search, X } from 'lucide-react'
import { INSTRUMENT_FAMILIES, getInstrumentProfile, getInstrumentProfilesByFamily } from '../utils/instrumentProfiles'
import { markOnboardingComplete } from '../utils/onboardingTutorial'
import { triggerLightHaptic } from '../utils/haptics'
import { PremiumMotionDiv } from './ui/PremiumMotionSurface'
import '../styles/practice-introduction.css'
import '../styles/premium-intro.css'

interface OnboardingTutorialProps {
  onComplete: () => void
  onSkip: () => void
  onSelectInstrument: (instrumentId: string) => void
  initialInstrumentId?: string
  hapticFeedback?: boolean
}

const steps = [
  { id: 'welcome', title: 'Welcome to BestTake', body: 'Record your practice. Hear your progress.', cta: 'Get started' },
  { id: 'instrument', title: 'What do you play?', body: 'We’ll suggest routines for your instrument.', cta: 'Start practicing' },
] as const
const ease = [.22, 1, .36, 1] as const

export default function OnboardingTutorial({ onComplete, onSkip, onSelectInstrument, initialInstrumentId, hapticFeedback = true }: OnboardingTutorialProps) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [selected, setSelected] = useState(initialInstrumentId ?? '')
  const [picker, setPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [leaving, setLeaving] = useState(false)
  const finishAction = useRef<(() => void) | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const pickerDialog = useRef<HTMLDivElement>(null)
  const pickerTitle = useRef<HTMLHeadingElement>(null)
  const pickerButton = useRef<HTMLButtonElement>(null)
  const reducedMotion = useReducedMotion()
  const step = steps[index]
  const last = index === steps.length - 1
  const profile = selected ? getInstrumentProfile(selected) : undefined
  const groups = useMemo(() => INSTRUMENT_FAMILIES.map(family => ({family, items:getInstrumentProfilesByFamily(family).filter(item=>item.label.toLowerCase().includes(search.trim().toLowerCase()))})).filter(group=>group.items.length), [search])
  const duration = reducedMotion ? 0 : .414
  const feedback = () => { void triggerLightHaptic(hapticFeedback) }
  const finish = (action: () => void = onComplete) => {
    if (finishAction.current || leaving) return
    feedback()
    markOnboardingComplete()
    finishAction.current = action
    setLeaving(true)
  }
  const completeExit = () => {
    if (!leaving) return
    const action = finishAction.current
    finishAction.current = null
    action?.()
  }
  const closePicker = () => { feedback(); setPicker(false); setSearch(''); requestAnimationFrame(()=>pickerButton.current?.focus({preventScroll:true})) }
  const navigate = (next: number) => { feedback(); setDirection(next > index ? 1 : -1); setIndex(next) }

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const siblings = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog.current)
    const inertBefore = siblings.map(element => element.inert)
    siblings.forEach(element => { element.inert = true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('tutorial-active')
    return () => {
      siblings.forEach((element, position) => { element.inert = inertBefore[position] })
      document.body.style.overflow = overflow
      document.body.classList.remove('tutorial-active')
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const stagger = {
    hidden: { opacity:0, y:reducedMotion ? 0 : 13 },
    visible: (order: number) => ({ opacity:1, y:0, transition:{duration, ease, delay:reducedMotion ? 0 : order*.063} }),
  }

  return createPortal(
    <motion.div className="practice-intro premium-intro" role="dialog" aria-modal="true" aria-labelledby="practice-intro-title" aria-describedby="practice-intro-description" ref={dialog}
      initial={{opacity:0}} animate={{opacity:leaving?0:1,scale:leaving&&!reducedMotion ? .99 : 1}}
      transition={{duration:reducedMotion ? 0 : leaving ? .198 : .315}}
      onAnimationComplete={completeExit}
      onKeyDown={event=>{
        event.stopPropagation()
        if(event.key==='Escape'){event.preventDefault();if(picker)closePicker();else finish(onSkip);return}
        if(event.key!=='Tab')return
        const scope=picker?pickerDialog.current:dialog.current
        const controls=Array.from(scope?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')??[]).filter(node=>node.getClientRects().length>0)
        const first=controls[0],end=controls.at(-1)
        if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();end?.focus()}
        else if(!event.shiftKey&&(document.activeElement===end||!controls.includes(document.activeElement as HTMLElement))){event.preventDefault();first?.focus()}
      }}>
      <div className={`practice-intro__shell ${index===0?'practice-intro__shell--welcome':''}`} inert={picker||leaving}>
        <header className="practice-intro__header">
          <span className="practice-intro__brand"><img src="/icons/icon.png" alt=""/>BestTake</span>
          <motion.button whileTap={reducedMotion?undefined:{scale:.96}} className="practice-intro__quiet" onClick={()=>finish(onSkip)}>Skip intro</motion.button>
        </header>
        <div className="premium-intro-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={2} aria-valuenow={index+1}>
          <motion.span initial={false} animate={{scaleX:(index+1)/steps.length}} transition={{duration:reducedMotion?0:.495,ease}}/>
        </div>
        <div className="premium-intro-stage">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.main key={step.id} className="practice-intro__body" data-onboarding-card={step.id} custom={direction}
              variants={{enter:(d:number)=>({opacity:0,x:reducedMotion?0:d*24,filter:reducedMotion?'none':'blur(3px)'}),center:{opacity:1,x:0,filter:'blur(0px)'},exit:(d:number)=>({opacity:0,x:reducedMotion?0:d*-16,filter:reducedMotion?'none':'blur(2px)',transition:{duration:reducedMotion?0:.144}})}}
              initial="enter" animate="center" exit="exit" transition={{duration,ease}}
              onAnimationComplete={state=>{if(state==='center')heading.current?.focus({preventScroll:true})}}>
              {step.id==='welcome'&&<motion.div className="practice-intro__welcome-mark" aria-hidden initial={reducedMotion?false:{scale:.88,opacity:0,y:16,rotate:-3}} animate={{scale:1,opacity:1,y:0,rotate:0}} transition={reducedMotion?{duration:0}:{type:'spring',stiffness:191.36,damping:23.33,delay:.045}}><img src="/icons/icon.png" alt="" draggable={false}/></motion.div>}
              <motion.h1 id="practice-intro-title" tabIndex={-1} ref={heading} variants={stagger} initial="hidden" animate="visible" custom={1}>{step.title}</motion.h1>
              <motion.p id="practice-intro-description" className="practice-intro__description" variants={stagger} initial="hidden" animate="visible" custom={2}>{step.body}</motion.p>
              {step.id==='instrument'&&<motion.div className="premium-instrument" variants={stagger} initial="hidden" animate="visible" custom={3}>
                <span className="premium-instrument-label" id="instrument-label">Your instrument</span>
                <motion.button ref={pickerButton} className={`premium-instrument-select ${selected?'is-selected':''}`} aria-labelledby="instrument-label instrument-choice" aria-haspopup="dialog" aria-expanded={picker} whileTap={reducedMotion?undefined:{scale:.985}} onClick={()=>{feedback();setPicker(true)}}>
                  <span id="instrument-choice">{profile?.label||'Choose instrument'}</span>
                  <AnimatePresence mode="wait" initial={false}><motion.span key={selected||'empty'} className="premium-instrument-check" initial={{opacity:0,scale:.7}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:.8}} transition={{duration:reducedMotion?0:.18}}>{selected?<Check aria-hidden/>:<ChevronDown aria-hidden/>}</motion.span></AnimatePresence>
                </motion.button>
                <p className="practice-intro__note" aria-live="polite">{selected?'You can change this anytime.':'Choose now or set it later.'}</p>
              </motion.div>}
            </motion.main>
          </AnimatePresence>
        </div>
        <footer className="practice-intro__footer">
          <div className="premium-intro-footer-meta"><motion.button className="practice-intro__back" aria-label="Previous step" disabled={index===0} whileTap={reducedMotion?undefined:{scale:.9}} onClick={()=>navigate(index-1)}><ArrowLeft/></motion.button><span className="practice-intro__count">{index+1}<span> / {steps.length}</span></span></div>
          <motion.button className="practice-intro__primary" whileHover={reducedMotion?undefined:{y:-1}} whileTap={reducedMotion?undefined:{scale:.975,y:1}} onClick={()=>last?finish():navigate(index+1)}><span>{step.cta}</span><motion.span key={index} initial={reducedMotion?false:{x:-5,opacity:0}} animate={{x:0,opacity:1}} transition={{duration:.27}}><ArrowRight/></motion.span></motion.button>
        </footer>
      </div>
      <AnimatePresence>
        {picker&&<PremiumMotionDiv className="premium-picker-layer" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reducedMotion?0:.18}}>
          <button className="premium-picker-backdrop" tabIndex={-1} aria-label="Close instrument picker" onClick={closePicker}/>
          <motion.div ref={pickerDialog} className="premium-picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" variants={{closed:{y:reducedMotion?0:'100%'},open:{y:0}}} initial="closed" animate="open" exit="closed" transition={reducedMotion?{duration:0}:{type:'spring',stiffness:370.37,damping:37.78}} onAnimationComplete={state=>{if(state==='open')pickerTitle.current?.focus({preventScroll:true})}}>
            <div className="premium-picker-handle" aria-hidden/>
            <header><h2 ref={pickerTitle} tabIndex={-1} id="picker-title">Your instrument</h2><button aria-label="Close instrument picker" onClick={closePicker}><X/></button></header>
            <label className="premium-picker-search"><Search aria-hidden/><input aria-label="Search instruments" placeholder="Search instruments" value={search} onChange={event=>setSearch(event.target.value)}/></label>
            <div className="premium-picker-options">{groups.length?groups.map(group=><section key={group.family} aria-label={group.family}><h3>{group.family}</h3>{group.items.map(item=><button key={item.id} aria-pressed={selected===item.id} onClick={()=>{setSelected(item.id);onSelectInstrument(item.id);closePicker()}}><span>{item.label}</span>{selected===item.id&&<Check aria-hidden/>}</button>)}</section>):<p className="premium-picker-empty">No matching instruments.</p>}</div>
          </motion.div>
        </PremiumMotionDiv>}
      </AnimatePresence>
    </motion.div>,document.body,
  )
}
