import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { StepEditor, type RoutineBuilderProps } from './RoutineBuilder'
import Pressable from './ui/Pressable'
import RoutineReferenceSetup from './RoutineReferenceSetup'
import { INSTRUMENT_FAMILIES, getInstrumentProfile, getInstrumentProfilesByFamily } from '../utils/instrumentProfiles'
import { buildPresetRoutine, getRoutinePresets, getStepTemplates, stepFromTemplate } from '../utils/routinePresets'
import { blankDesk, createRoutine, createStep, formatMinutes, MAX_ROUTINE_NAME, MAX_ROUTINE_STEPS, MAX_STEP_TITLE, summarizeStep, type Routine, type RoutineStep, type RoutineStepKind } from '../utils/practiceRoutines'
import { loadExerciseLibrary, loadRoutineLibrary, storeLibraryExercise, storeLibraryRoutine } from '../utils/routineLibrary'
import '../styles/routine-guide.css'

type Screen = 'instrument' | 'choose' | 'lineup' | 'custom-items' | 'custom-tool' | 'detail' | 'library'
type ToolChoice = { key: string; kind: RoutineStepKind; mode?: 'audio' | 'video'; title: string; detail: string }
const toolChoices: ToolChoice[] = [
  { key: 'camera', kind: 'record', mode: 'video', title: 'Camera', detail: 'Record video, review, and retry' },
  { key: 'audio', kind: 'record', mode: 'audio', title: 'Audio', detail: 'Record sound, review, and retry' },
  { key: 'tuner', kind: 'tune', mode: 'audio', title: 'Tuner', detail: 'Open pitch tracking and your saved desk' },
  { key: 'metronome', kind: 'metro', mode: 'audio', title: 'Metronome', detail: 'Open with a steady pulse ready' },
  { key: 'none', kind: 'free', title: 'Nothing', detail: 'A simple item to complete' },
]

function selectionForRoutine(routine: Routine): Record<string, string> {
  const choices = [
    ...getStepTemplates(routine.instrumentId).map(template => ({ key: template.id, title: template.title, kind: template.kind })),
    ...loadExerciseLibrary().filter(item => item.instrumentId === routine.instrumentId).map(({ step }) => ({ key: `saved:${step.id}`, title: step.title, kind: step.kind })),
  ]
  return Object.fromEntries(choices.flatMap(choice => {
    const step = routine.steps.find(item => item.title === choice.title && item.kind === choice.kind)
    return step ? [[choice.key, step.id]] : []
  }))
}

export default function GuidedRoutineBuilder(props: RoutineBuilderProps) {
  const { mode, routine, projects, liveDeskSnapshot, tunerTransposition, hapticFeedback, onSave, onCancel } = props
  const initialInstrument = mode === 'edit' && routine ? routine.instrumentId : props.instrumentId
  const [screen, setScreen] = useState<Screen>(() => mode === 'edit' && routine ? 'lineup' : initialInstrument ? 'library' : 'instrument')
  const [instrument, setInstrument] = useState(initialInstrument)
  const [draft, setDraft] = useState<Routine>(() => mode === 'edit' && routine ? routine : createRoutine('My daily practice', [], initialInstrument))
  const [library, setLibrary] = useState(() => {
    const saved = loadRoutineLibrary()
    const newerSaved = routine && saved.some(item => item.id === routine.id && item.updatedAt > routine.updatedAt)
    return routine && !newerSaved ? [routine, ...saved.filter(item => item.id !== routine.id)] : saved
  })
  const [exercises, setExercises] = useState(loadExerciseLibrary)
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    if (mode !== 'edit' || !routine) return {}
    return selectionForRoutine(routine)
  })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [customInput, setCustomInput] = useState('')
  const [customItems, setCustomItems] = useState<string[]>([])
  const [customIndex, setCustomIndex] = useState(0)
  const [customSteps, setCustomSteps] = useState<RoutineStep[]>([])
  const [customToolKey, setCustomToolKey] = useState<string | null>(null)
  const [customReference, setCustomReference] = useState('')
  const [customReferenceVideo, setCustomReferenceVideo] = useState<string | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)
  const [selectedRoutine, setSelectedRoutine] = useState<string | null>(routine?.id ?? null)
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState('')
  const [instrumentReturn, setInstrumentReturn] = useState<Screen>('library')
  const [changingInstrument, setChangingInstrument] = useState(false)
  const [libraryReturn, setLibraryReturn] = useState<Screen | null>(mode === 'presets' ? null : 'choose')
  const reducedMotion = useReducedMotion()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const instrumentName = instrument ? getInstrumentProfile(instrument)?.label ?? 'Your instrument' : 'Any instrument'
  const templates = useMemo(() => getStepTemplates(instrument), [instrument])
  const presets = useMemo(() => getRoutinePresets(instrument), [instrument])
  const detail = draft.steps.find(item => item.id === detailId)
  const total = draft.steps.reduce((sum, step) => sum + step.minutes, 0)
  const titles: Record<Screen, string> = {
    instrument: 'What do you play?', choose: 'Add an exercise.', lineup: 'Your practice\nlineup.',
    'custom-items': 'Build your own.', 'custom-tool': customItems[customIndex] ?? 'Choose a tool.', detail: detail?.title ?? 'Your exercise', library: 'Build your\nroutine.',
  }
  const subtitles: Record<Screen, string> = {
    instrument: 'A starting point that fits your instrument.', choose: `Suggestions made for ${instrumentName.toLowerCase()}.`, lineup: 'In your order. Set up and ready to play.',
    'custom-items': 'Type every item in the order you want to practice it.', 'custom-tool': `Item ${customIndex + 1} of ${customItems.length} · What should open with it?`, detail: 'Make this exercise work for you.', library: 'Start with your own plan, or use a researched preset.',
  }
  const move = (next: Screen, backwards = false) => { setDirection(backwards ? -1 : 1); setError(''); setScreen(next) }
  useEffect(() => { scrollRef.current?.scrollTo(0, 0) }, [screen])
  const back = () => {
    if (screen === 'detail') move('lineup', true)
    else if (screen === 'custom-tool' && customIndex > 0) {
      setCustomReference(customSteps[customIndex - 1]?.referenceQuery ?? '')
      setCustomReferenceVideo(customSteps[customIndex - 1]?.referenceVideoId ?? null)
      setCustomIndex(index => index - 1); setCustomSteps(steps => steps.slice(0, -1)); setCustomToolKey(null); setDirection(-1)
    }
    else if (screen === 'custom-tool') move('custom-items', true)
    else if (screen === 'custom-items') move('library', true)
    else if (screen === 'lineup') move('library', true)
    else if (screen === 'instrument') { if (changingInstrument) move(instrumentReturn, true); else onCancel() }
    else if (screen === 'library' && libraryReturn) move(libraryReturn, true)
    else onCancel()
  }
  const toggle = (key: string, create: () => RoutineStep) => {
    const existingId = selection[key]
    if (existingId && draft.steps.some(step => step.id === existingId)) {
      setDraft(current => ({ ...current, steps: current.steps.filter(step => step.id !== existingId) }))
      return
    }
    if (draft.steps.length >= MAX_ROUTINE_STEPS) { setError(`Keep your routine to ${MAX_ROUTINE_STEPS} items or fewer.`); return }
    const step = create()
    setSelection(current => ({ ...current, [key]: step.id }))
    setDraft(current => ({ ...current, steps: [...current.steps, step] }))
  }
  const isSelected = (key: string) => draft.steps.some(step => step.id === selection[key])
  const startCustomRoutine = () => {
    setDraft(createRoutine('My practice', [], instrument)); setCustomItems([]); setCustomInput('')
    setCustomIndex(0); setCustomSteps([]); setCustomToolKey(null); setCustomReference(''); setUseCurrent(false); move('custom-items')
  }
  const addCustomItem = () => {
    const title = customInput.trim().slice(0, MAX_STEP_TITLE)
    if (!title || customItems.length >= MAX_ROUTINE_STEPS) return
    setCustomItems(items => [...items, title]); setCustomInput('')
  }
  const moveCustomItem = (index: number, delta: number) => {
    const destination = index + delta
    if (destination < 0 || destination >= customItems.length) return
    setCustomItems(items => { const next = [...items]; [next[index], next[destination]] = [next[destination], next[index]]; return next })
  }
  const saveCustomTool = () => {
    const choice = toolChoices.find(item => item.key === customToolKey)
    const title = customItems[customIndex]
    if (!choice || !title) return
    const desk = choice.kind === 'free' ? null : useCurrent ? { ...liveDeskSnapshot, mode: choice.mode ?? 'audio' } : blankDesk(choice.mode ?? 'audio')
    if (desk && choice.kind === 'metro') desk.showMetronome = true
    if (desk && choice.kind === 'tune') desk.pitchTrackerEnabled = true
    const step = createStep({ title, kind: choice.kind, topic: 'other', minutes: 0, desk, referenceQuery: choice.kind === 'free' ? '' : customReference,
      referenceVideoId: choice.kind === 'free' ? null : customReferenceVideo })
    const nextSteps = [...customSteps, step]
    if (customIndex < customItems.length - 1) {
      setCustomSteps(nextSteps); setCustomIndex(index => index + 1); setCustomToolKey(null); setCustomReference(''); setCustomReferenceVideo(null); setUseCurrent(false); setDirection(1)
      return
    }
    try {
      nextSteps.forEach(item => storeLibraryExercise({ instrumentId: instrument, step: item }))
      setExercises(loadExerciseLibrary()); setDraft(current => ({ ...current, steps: nextSteps })); setSelection({}); move('lineup')
    } catch { setError('Could not save these exercises on your device. Please try again.') }
  }
  const saveDraft = () => {
    const next = { ...draft, steps: draft.steps.map(step => createStep(step)), name: draft.name.trim() || `${instrumentName} practice`, instrumentId: instrument, updatedAt: Date.now() }
    try {
      if (routine && routine.id !== next.id) storeLibraryRoutine(routine)
      storeLibraryRoutine(next)
      setDraft(next); setLibrary(loadRoutineLibrary()); setSelectedRoutine(next.id); setLibraryReturn('lineup'); move('library')
    } catch { setError('Could not save your routine on this device. Please try again.') }
  }
  const chosenRoutine = library.find(item => item.id === selectedRoutine && item.instrumentId === instrument)
  const useRoutine = () => {
    if (!chosenRoutine) return
    try {
      if (routine && routine.id !== chosenRoutine.id) storeLibraryRoutine(routine)
      onSave(chosenRoutine)
    } catch { setError('Could not save your routine on this device. Please try again.') }
  }
  const removeFromToday = () => {
    if (!routine) return
    try { storeLibraryRoutine(routine); props.onDelete() }
    catch { setError('Could not keep a copy of your routine. Please try again.') }
  }
  const action = screen === 'instrument' ? () => move(instrumentReturn)
    : screen === 'choose' ? () => move('lineup')
    : screen === 'lineup' ? saveDraft
    : screen === 'custom-items' ? () => { setCustomIndex(0); setCustomSteps([]); setCustomToolKey(null); setCustomReference(''); move('custom-tool') }
    : screen === 'custom-tool' ? saveCustomTool
    : screen === 'library' ? chosenRoutine ? useRoutine : undefined
    : screen === 'detail' ? () => move('lineup', true)
    : undefined
  const actionLabel = screen === 'choose' ? `Add selected · ${draft.steps.length}` : screen === 'lineup' ? 'Save routine' : screen === 'custom-items' ? `Set up ${customItems.length} ${customItems.length === 1 ? 'item' : 'items'}` : screen === 'custom-tool' ? customIndex < customItems.length - 1 ? 'Save & next' : 'Review lineup' : screen === 'library' ? 'Use this routine' : screen === 'detail' ? 'Done' : 'Continue'
  const disabled = screen === 'instrument' ? !instrument : screen === 'choose' || screen === 'lineup' ? !draft.steps.length : screen === 'custom-items' ? !customItems.length : screen === 'custom-tool' ? !customToolKey : screen === 'library' ? !chosenRoutine : false
  const renderTemplate = (template: typeof templates[number]) => <Pressable key={template.id} type="button" haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion}
    className="routine-guide-exercise" aria-pressed={isSelected(template.id)} onClick={() => toggle(template.id, () => stepFromTemplate(template, instrument))}>
    <span className="routine-guide-check">{isSelected(template.id) ? <Check aria-hidden /> : <Plus aria-hidden />}</span>
    <strong>{template.title}</strong><small>{formatMinutes(template.minutes)}</small>
  </Pressable>

  return <section className="routine-guide" aria-label="Build your routine" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back() }
  }}>
    <nav className="routine-guide-nav" aria-label="Routine navigation">
      <button type="button" onClick={back} aria-label="Back"><ArrowLeft aria-hidden /></button>
      <span>BESTTAKE <i /> YOUR PRACTICE</span>
      <button type="button" onClick={onCancel} aria-label="Close routine builder"><X aria-hidden /></button>
    </nav>
    <div className="routine-guide-progress" aria-label={screen === 'instrument' ? 'Step 1 of 3' : screen === 'choose' ? 'Step 2 of 3' : 'Your routine'}>
      {[0, 1, 2].map(index => <i key={index} className={index <= (screen === 'instrument' ? 0 : screen === 'library' || screen === 'choose' || screen.startsWith('custom') ? 1 : 2) ? 'is-on' : ''} />)}
    </div>
    <div className="routine-guide-scroll" ref={scrollRef}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={`${screen}-${screen === 'custom-tool' ? customIndex : 0}`} custom={direction}
          variants={{ enter: (d: number) => ({ opacity: 0, x: reducedMotion ? 0 : d * 32 }), center: { opacity: 1, x: 0 }, leave: (d: number) => ({ opacity: 0, x: reducedMotion ? 0 : d * -20 }) }}
          initial="enter" animate="center" exit="leave" onAnimationComplete={definition => { if (definition === 'center') titleRef.current?.focus({ preventScroll: true }) }} transition={{ duration: reducedMotion ? .08 : .3, ease: [.22, 1, .36, 1] }}>
          <header className="routine-guide-heading">
            <div className="routine-guide-motif" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(index => <i key={index} />)}</div>
            {screen !== 'instrument' && <button className="routine-guide-instrument" type="button" onClick={() => { setInstrumentReturn(screen); setChangingInstrument(true); move('instrument', true) }}>{instrumentName}<ChevronRight aria-hidden /></button>}
            <h2 ref={titleRef} tabIndex={-1}>{titles[screen]}</h2>
            <p>{subtitles[screen]}</p>
          </header>
          {screen === 'instrument' && <div className="routine-guide-instruments">
            {INSTRUMENT_FAMILIES.map(family => <section key={family}>
              <h3>{family}</h3><div className="routine-guide-grid">
                {getInstrumentProfilesByFamily(family).map(profile => <Pressable type="button" key={profile.id} haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion}
                  aria-pressed={instrument === profile.id} className="routine-guide-choice" onClick={() => setInstrument(profile.id)}>
                  <span>{profile.label}</span>{instrument === profile.id && <Check aria-hidden />}
                </Pressable>)}
              </div>
            </section>)}
            <button type="button" className="routine-guide-text" onClick={() => { setInstrument(null); move(instrumentReturn) }}>Use general exercises</button>
          </div>}
          {screen === 'choose' && <>
            <div className="routine-guide-grid">
              {templates.slice(0, 6).map(renderTemplate)}
              {exercises.filter(item => item.instrumentId === instrument).map(({ step }) => <Pressable key={step.id} type="button" haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion}
                className="routine-guide-exercise" aria-pressed={isSelected(`saved:${step.id}`)} onClick={() => toggle(`saved:${step.id}`, () => createStep({ ...step, id: undefined }))}>
                <span className="routine-guide-check">{isSelected(`saved:${step.id}`) ? <Check aria-hidden /> : <Plus aria-hidden />}</span><strong>{step.title}</strong><small>Your exercise</small>
              </Pressable>)}
            </div>
            {templates.length > 6 && <details className="routine-guide-more"><summary>More exercises</summary><div className="routine-guide-grid">{templates.slice(6).map(renderTemplate)}</div></details>}
            <button type="button" className="routine-guide-text" onClick={() => move('lineup')}>Back to lineup</button>
          </>}
          {screen === 'lineup' && <>
            <label className="routine-guide-field routine-guide-field--name">Routine name<input id="guide-routine-name" maxLength={MAX_ROUTINE_NAME} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <div className="routine-guide-lineup-meta">{draft.steps.length} exercises <span>·</span> {formatMinutes(total)}</div>
            <ol className="routine-guide-lineup">
              {draft.steps.map((step, index) => <li key={step.id}>
                <span className="routine-guide-number">{String(index + 1).padStart(2, '0')}</span>
                <button type="button" className="routine-guide-item" onClick={() => { setDetailId(step.id); move('detail') }}><strong>{step.title}</strong><small>{summarizeStep(step, tunerTransposition)}</small></button>
                <div className="routine-guide-reorder">
                  {[-1, 1].map(delta => <button key={delta} type="button" aria-label={`Move ${step.title} ${delta === -1 ? 'up' : 'down'}`} disabled={index + delta < 0 || index + delta >= draft.steps.length} onClick={() => setDraft(current => {
                    const steps = [...current.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]]; return { ...current, steps }
                  })}>{delta === -1 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}</button>)}
                </div>
              </li>)}
            </ol>
            <button type="button" className="routine-guide-text" onClick={() => move('choose', true)}>＋ Add an exercise</button>
            {routine?.id === draft.id && <button type="button" className="routine-guide-text" onClick={removeFromToday}>Remove from today · keep in library</button>}
          </>}
          {screen === 'custom-items' && <div className="routine-guide-custom-items">
            <label className="routine-guide-field routine-guide-field--name">Routine name<input maxLength={MAX_ROUTINE_NAME} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="Morning fundamentals" /></label>
            <div className="routine-guide-add-row"><label className="routine-guide-field">Add a practice item<input maxLength={MAX_STEP_TITLE} value={customInput} onChange={event => setCustomInput(event.target.value)} placeholder="Long tones, audition excerpt…" enterKeyHint="done" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustomItem() } }} /></label><Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} onClick={addCustomItem} disabled={!customInput.trim() || customItems.length >= MAX_ROUTINE_STEPS} aria-label="Add practice item"><Plus aria-hidden /></Pressable></div>
            <section className="routine-guide-suggestion-strip" aria-label={`Practice suggestions for ${instrumentName}`}><h3>For {instrumentName.toLowerCase()}</h3><div>{templates.filter(template => template.kind !== 'free' && template.kind !== 'game').slice(0, 8).map(template => {
              const title = template.title.slice(0, MAX_STEP_TITLE)
              const selected = customItems.includes(title)
              return <button key={template.id} type="button" aria-pressed={selected} disabled={!selected && customItems.length >= MAX_ROUTINE_STEPS} onClick={() => setCustomItems(items => selected ? items.filter(item => item !== title) : [...items, title])}>{selected ? <Check aria-hidden /> : <Plus aria-hidden />}{title}</button>
            })}</div></section>
            <ol className="routine-guide-custom-list">{customItems.map((item, index) => <li key={`${item}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><div><button type="button" disabled={index === 0} onClick={() => moveCustomItem(index, -1)} aria-label={`Move ${item} up`}><ArrowUp aria-hidden /></button><button type="button" disabled={index === customItems.length - 1} onClick={() => moveCustomItem(index, 1)} aria-label={`Move ${item} down`}><ArrowDown aria-hidden /></button><button type="button" onClick={() => setCustomItems(items => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item}`}><Trash2 aria-hidden /></button></div></li>)}</ol>
          </div>}
          {screen === 'custom-tool' && <>
            <div className="routine-guide-item-progress" aria-label="Routine item progress">{customItems.map((item, index) => <span key={`${item}-${index}`} className={index < customIndex ? 'is-done' : index === customIndex ? 'is-current' : ''}>{index < customIndex ? <Check aria-hidden /> : index + 1}</span>)}</div>
            <div className="routine-guide-tool-list">{toolChoices.map(choice => <Pressable type="button" key={choice.key} haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-choice" aria-pressed={customToolKey === choice.key} onClick={() => setCustomToolKey(choice.key)}><span><strong>{choice.title}</strong><small>{choice.detail}</small></span>{customToolKey === choice.key && <Check aria-hidden />}</Pressable>)}</div>
            {customToolKey && customToolKey !== 'none' && <label className="routine-guide-current"><input type="checkbox" checked={useCurrent} onChange={event => setUseCurrent(event.target.checked)} /><SlidersHorizontal aria-hidden /><span>Also use my current workspace settings</span></label>}
            {customToolKey && customToolKey !== 'none' && <RoutineReferenceSetup instrumentId={instrument} title={customItems[customIndex] ?? ''} value={customReference} onChange={setCustomReference}
              videoId={customReferenceVideo} onVideoIdChange={setCustomReferenceVideo} />}
          </>}
          {screen === 'detail' && detail && <div className="routine-guide-editor"><StepEditor showDone={false} step={detail} instrumentId={instrument} projects={projects} tunerTransposition={getInstrumentProfile(instrument ?? '')?.tunerTransposition ?? tunerTransposition} hapticFeedback={hapticFeedback}
            onChange={patch => setDraft(current => ({ ...current, steps: current.steps.map(step => step.id === detail.id ? { ...step, ...patch } : step) }))}
            onDone={() => move('lineup', true)} onRemove={() => { setDraft(current => ({ ...current, steps: current.steps.filter(step => step.id !== detail.id) })); move('lineup', true) }} /></div>}
          {screen === 'library' && <>
            <button type="button" className="routine-guide-own routine-guide-own--hero" onClick={startCustomRoutine}><Plus aria-hidden /><span><strong>Build your own routine</strong><small>Type your practice items, order them, then choose what opens for each.</small></span><ArrowRight aria-hidden /></button>
            <section className="routine-guide-library"><h3>Suggested routines</h3>{presets.map(preset => <button type="button" key={preset.id} className="routine-guide-choice" onClick={() => { const next = buildPresetRoutine(preset, instrument); setDraft(next); setSelection(selectionForRoutine(next)); move('lineup') }}><span><strong>{preset.name}</strong><small>{preset.blurb}</small></span><ChevronRight aria-hidden /></button>)}</section>
            {library.filter(item => item.instrumentId === instrument).length > 0 && <section className="routine-guide-library"><h3>Your routines</h3>{library.filter(item => item.instrumentId === instrument).map(item => <button type="button" key={item.id} className="routine-guide-choice" aria-pressed={selectedRoutine === item.id} onClick={() => setSelectedRoutine(item.id)}><span><strong>{item.name}</strong><small>{item.steps.length} exercises · {formatMinutes(item.steps.reduce((sum, step) => sum + step.minutes, 0))}</small></span>{selectedRoutine === item.id && <Check aria-hidden />}</button>)}</section>}
          </>}
        </motion.div>
      </AnimatePresence>
    </div>
    {error && <p className="routine-guide-error" role="alert">{error}</p>}
    {action && <footer className="routine-guide-footer"><Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-continue" disabled={disabled} onClick={action}>{actionLabel}<ArrowRight aria-hidden /></Pressable></footer>}
  </section>
}
