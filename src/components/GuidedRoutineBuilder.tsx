import { canSaveRoutine } from '../utils/routineLibrary'
import { requirePlus } from '../plus/plusAccess'
import PremiumDisclosure from './ui/PremiumDisclosure'
import PremiumFlowPage from './ui/PremiumFlowPage'
import SwipeRoutineItem from './SwipeRoutineItem'
import { PRACTICE_GOALS, buildGoalRoutine, type PracticeGoal } from '../utils/routineGoals'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, FileMusic, Music2, Plus, Share2, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { kindNeedsDesk, type RoutineBuilderProps } from './RoutineBuilder'
import Pressable from './ui/Pressable'
import RoutineDeskSetup from './RoutineDeskSetup'
import RoutineMetronomeEditor from './RoutineMetronomeEditor'
import RoutineReferenceSetup from './RoutineReferenceSetup'
import RoutineMusicSetup from './RoutineMusicSetup'
import RoutineShareDialog from './RoutineShareDialog'
import { INSTRUMENT_FAMILIES, getInstrumentProfile, getInstrumentProfilesByFamily } from '../utils/instrumentProfiles'
import { buildPresetRoutine, getRoutinePresets, getStepTemplates, presetMinutes, stepFromTemplate } from '../utils/routinePresets'
import { blankDesk, createRoutine, createStep, formatMinutes, MAX_ROUTINE_NAME, MAX_ROUTINE_STEPS, MAX_STEP_TITLE, summarizeStep, type Routine, type RoutineStep, type RoutineStepKind } from '../utils/practiceRoutines'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import type { MetronomePrefs } from '../utils/metronomeConfig'
import { loadExerciseLibrary, loadRoutineLibrary, storeLibraryExercise, storeLibraryRoutine } from '../utils/routineLibrary'
import { hasPracticeChart, savePracticeChart } from '../utils/practiceChartStorage'
import { importPracticePlanFileFromText, MAX_PRACTICE_PLAN_BYTES, PRACTICE_PLAN_EXTENSION } from '../utils/practiceRoutineShare'
import { createMusicExercise, musicExerciseTitle, prepareRoutineMusicFile } from '../utils/routineMusic'
import type { LabsRoute } from './labs/LabsOverlay'
import '../styles/routine-guide.css'

type Screen = 'routines' | 'goals' | 'instrument' | 'choose' | 'lineup' | 'custom-items' | 'custom-tool' | 'custom-reference' | 'custom-settings' | 'library'
type ToolChoice = { key: string; kind: RoutineStepKind; mode?: 'audio' | 'video'; title: string; detail: string }
const toolChoices: ToolChoice[] = [
  { key: 'camera', kind: 'record', mode: 'video', title: 'Camera', detail: 'Record video, review, and retry' },
  { key: 'audio', kind: 'record', mode: 'audio', title: 'Audio', detail: 'Record sound, review, and retry' },
  { key: 'music', kind: 'record', mode: 'audio', title: 'Music', detail: 'Open on a PDF or photo of the part' },
  { key: 'tuner', kind: 'tune', mode: 'audio', title: 'Tuner', detail: 'Open pitch tracking and your saved desk' },
  { key: 'metronome', kind: 'metro', mode: 'audio', title: 'Metronome', detail: 'Open with a steady pulse ready' },
  { key: 'game', kind: 'game', title: 'Game', detail: 'Staff Jumper, Balance, or Learn' },
  { key: 'none', kind: 'free', title: 'Nothing', detail: 'A simple item to complete' },
]
const GAMES: Array<{ route: LabsRoute; label: string; hint: string }> = [
  { route: 'staff-jumper', label: 'Staff Jumper', hint: 'Sight-reading' },
  { route: 'balance', label: 'Balance', hint: 'Hold the centre' },
  { route: 'learn-instrument', label: 'Learn', hint: 'Fingerings' },
  { route: 'menu', label: 'Pick each time', hint: 'Opens the games menu' },
]

function toolKeyForStep(step: RoutineStep): string {
  if (step.desk?.showMusic) return 'music'
  if (step.kind === 'record' || step.kind === 'focus') return step.desk?.mode === 'video' ? 'camera' : 'audio'
  if (step.kind === 'tune') return 'tuner'
  if (step.kind === 'metro') return 'metronome'
  if (step.kind === 'game') return 'game'
  return 'none'
}

function toolSkipsDesk(key: string | null): boolean {
  return key === 'none' || key === 'game'
}

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
  const { mode, routine, liveDeskSnapshot, tunerTransposition, hapticFeedback, onSave, onSaveAndStart, onCreatePracticeItem, todayStarted, onCancel } = props
  const initialInstrument = mode === 'edit' && routine ? routine.instrumentId : props.instrumentId
  const [showReorder, setShowReorder] = useState(false)
  const [goal, setGoal] = useState<PracticeGoal>('balanced')
  const [screen, setScreen] = useState<Screen>(() => {
    if (mode === 'edit' && routine) return 'lineup'
    if (mode === 'build') return 'routines'
    return initialInstrument ? 'library' : 'instrument'
  })
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
  const [configuredIds, setConfiguredIds] = useState<string[]>(() => mode === 'edit' && routine ? routine.steps.map(step => step.id) : [])
  const [customInput, setCustomInput] = useState('')
  const [customItems, setCustomItems] = useState<string[]>([])
  const [customIndex, setCustomIndex] = useState(0)
  const [customSteps, setCustomSteps] = useState<RoutineStep[]>([])
  const [customToolKey, setCustomToolKey] = useState<string | null>(null)
  const [customGameRoute, setCustomGameRoute] = useState<LabsRoute>('menu')
  const [customSetup, setCustomSetup] = useState<RoutineStep | null>(null)
  const [customMinutes, setCustomMinutes] = useState(0)
  const [metronomeEditorOpen, setMetronomeEditorOpen] = useState(false)
  const [customReference, setCustomReference] = useState('')
  const [customReferenceVideo, setCustomReferenceVideo] = useState<string | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [direction, setDirection] = useState(1)
  const [error, setError] = useState('')
  const [musicImportStatus, setMusicImportStatus] = useState('')
  const [importingMusic, setImportingMusic] = useState(false)
  const [shareItem, setShareItem] = useState<Routine | null>(null)
  const [instrumentReturn, setInstrumentReturn] = useState<Screen>('library')
  const [changingInstrument, setChangingInstrument] = useState(false)
  const [libraryReturn, setLibraryReturn] = useState<Screen | null>(mode === 'presets' ? null : 'routines')
  const [lineupReturn, setLineupReturn] = useState<Screen>(mode === 'edit' ? 'routines' : 'library')
  const reducedMotion = useReducedMotion()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const musicInputRef = useRef<HTMLInputElement>(null)
  const musicImportBusyRef = useRef(false)
  const instrumentName = instrument ? getInstrumentProfile(instrument)?.label ?? 'Your instrument' : 'Any instrument'
  const musicSetup = customToolKey === 'music'
  const templates = useMemo(() => getStepTemplates(instrument), [instrument])
  const presets = useMemo(() => getRoutinePresets(instrument), [instrument])
  const savedRoutines = useMemo(() => {
    const newestById = new Map<string, Routine>()
    for (const item of routine ? [routine, ...library] : library) {
      const saved = newestById.get(item.id)
      if (!saved || item.updatedAt > saved.updatedAt) newestById.set(item.id, item)
    }
    return Array.from(newestById.values())
      .sort((a, b) => {
        if (a.id === routine?.id) return -1
        if (b.id === routine?.id) return 1
        return b.updatedAt - a.updatedAt
      })
  }, [library, routine])
  const setupTitle = (editingStepId ? draft.steps.find(step => step.id === editingStepId)?.title : customItems[customIndex]) ?? 'Your item'
  const total = draft.steps.reduce((sum, step) => sum + step.minutes, 0)
  const titles: Record<Screen, string> = {
    routines: 'Your\nroutines.', goals: 'What would you like\nto build?', instrument: 'What do you play?', choose: 'Add an exercise.', lineup: 'Ready when\nyou are.',
    'custom-settings': 'Set up your tools.', 'custom-reference': musicSetup ? 'Add your music.' : 'Add a reference.', 'custom-items': 'Build your own.', 'custom-tool': setupTitle, library: 'Build your\nroutine.',
  }
  const subtitles: Record<Screen, string> = {
    routines: 'Create a new plan or open one you’ve already built.', goals: 'Choose what you want to practice. You can change the exercises later.', instrument: 'A starting point that fits your instrument.', choose: `Suggestions for ${instrumentName.toLowerCase()}.`, lineup: 'Review your exercises and their order.',
    'custom-settings': setupTitle, 'custom-reference': musicSetup ? `A PDF or photo · ${setupTitle}` : `Optional · ${setupTitle}`, 'custom-items': 'Type every item in the order you want to practice it.',
    'custom-tool': editingStepId || customItems.length <= 1 ? 'What should open with it?' : `Item ${customIndex + 1} of ${customItems.length} · What should open with it?`,
    library: 'Start with a suggestion, then make it yours.',
  }
  const move = (next: Screen, backwards = false) => { setDirection(backwards ? -1 : 1); setError(''); setScreen(next) }
  useEffect(() => { scrollRef.current?.scrollTo(0, 0) }, [screen])
  const clearItemSetup = () => {
    setEditingStepId(null); setCustomToolKey(null); setCustomSetup(null); setCustomMinutes(0); setCustomReference(''); setCustomReferenceVideo(null); setCustomGameRoute('menu'); setUseCurrent(false); setMetronomeEditorOpen(false)
  }
  const back = () => {
    if (screen === 'routines') onCancel()
    else if (screen === 'goals') move('library', true)
    else if (screen === 'custom-reference') move('custom-settings', true)
    else if (screen === 'custom-settings') move('custom-tool', true)
    else if (screen === 'custom-tool' && editingStepId) { clearItemSetup(); move('lineup', true) }
    else if (screen === 'custom-tool' && customIndex > 0) {
      const previous = customSteps[customIndex - 1]
      setCustomReference(previous?.referenceQuery ?? '')
      setCustomReferenceVideo(previous?.referenceVideoId ?? null)
      setCustomMinutes(previous?.minutes ?? 0)
      setCustomToolKey(previous ? toolKeyForStep(previous) : null)
      setCustomGameRoute(previous?.gameRoute ?? 'menu')
      setCustomIndex(index => index - 1); setCustomSteps(steps => steps.slice(0, -1)); setDirection(-1)
    }
    else if (screen === 'custom-tool') move('custom-items', true)
    else if (screen === 'custom-items') move('library', true)
    else if (screen === 'choose') move('lineup', true)
    else if (screen === 'lineup') move(lineupReturn, true)
    else if (screen === 'instrument') {
      if (changingInstrument) move(instrumentReturn, true)
      else if (mode === 'build') move('routines', true)
      else onCancel()
    }
    else if (screen === 'library' && libraryReturn) move(libraryReturn, true)
    else onCancel()
  }
  const toggle = (key: string, create: () => RoutineStep) => {
    const existingId = selection[key]
    if (existingId && draft.steps.some(step => step.id === existingId)) {
      setDraft(current => ({ ...current, steps: current.steps.filter(step => step.id !== existingId) }))
      setConfiguredIds(ids => ids.filter(id => id !== existingId))
      return
    }
    if (draft.steps.length >= MAX_ROUTINE_STEPS) { setError(`Keep your routine to ${MAX_ROUTINE_STEPS} items or fewer.`); return }
    const step = create()
    setSelection(current => ({ ...current, [key]: step.id }))
    setConfiguredIds(ids => [...ids, step.id])
    setDraft(current => ({ ...current, steps: [...current.steps, step] }))
  }
  const isSelected = (key: string) => draft.steps.some(step => step.id === selection[key])
  const startCustomRoutine = () => {
    setDraft(createRoutine('My practice', [], instrument)); setCustomItems([]); setCustomInput('')
    setCustomIndex(0); setCustomSteps([]); clearItemSetup(); setLineupReturn('library'); move('custom-items')
  }
  const startNewRoutine = () => {
    if (props.onStartMusicRoutine) {
      props.onStartMusicRoutine()
      return
    }
    setDraft(createRoutine('My practice', [], instrument))
    setSelection({}); setConfiguredIds([]); setCustomItems([]); setCustomInput(''); setCustomIndex(0); setCustomSteps([])
    clearItemSetup()
    setLibraryReturn('routines'); setLineupReturn('library')
    setInstrumentReturn('library'); setChangingInstrument(false)
    move(instrument ? 'library' : 'instrument')
  }
  const openSavedRoutine = (item: Routine) => {
    if (props.onOpenMusicRoutine) {
      props.onOpenMusicRoutine(item)
      return
    }
    setDraft(item); setInstrument(item.instrumentId); setSelection(selectionForRoutine(item))
    setConfiguredIds(item.steps.map(step => step.id)); clearItemSetup()
    setLineupReturn('routines'); move('lineup')
  }
  const openItemSetup = (step: RoutineStep) => {
    setEditingStepId(step.id)
    setCustomItems([step.title])
    setCustomIndex(0)
    setCustomSteps([])
    setCustomToolKey(toolKeyForStep(step))
    setCustomGameRoute(step.gameRoute ?? 'menu')
    setCustomSetup(createStep(step))
    setCustomMinutes(step.minutes)
    setCustomReference(step.referenceQuery)
    setCustomReferenceVideo(step.referenceVideoId)
    setUseCurrent(false)
    if (step.kind === 'metro') setMetronomeEditorOpen(true)
    else move('custom-tool')
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
  const makeCustomStep = (key = customToolKey) => {
    const choice = toolChoices.find(item => item.key === key)
    const title = setupTitle
    if (!choice || !title) return null
    const keepDesk = customSetup && toolKeyForStep(customSetup) === choice.key && !useCurrent
    const desk = choice.kind === 'free' || choice.kind === 'game'
      ? null
      : useCurrent ? { ...liveDeskSnapshot, mode: choice.mode ?? 'audio' }
        : keepDesk && customSetup?.desk ? { ...customSetup.desk }
          : blankDesk(choice.mode ?? 'audio')
    if (desk && choice.kind === 'metro') desk.showMetronome = true
    if (desk && choice.kind === 'tune') desk.pitchTrackerEnabled = true
    if (desk && choice.key === 'music') {
      desk.mode = 'audio'
      desk.showMusic = true
    } else if (desk && choice.key !== 'music') {
      desk.showMusic = false
    }
    return createStep({
      ...(customSetup ?? {}),
      title,
      kind: choice.kind,
      topic: customSetup?.topic ?? 'other',
      minutes: customMinutes,
      desk,
      id: editingStepId ?? customSetup?.id,
      projectId: customSetup?.projectId ?? null,
      programId: desk ? customSetup?.programId ?? null : null,
      gameRoute: choice.kind === 'game' ? customGameRoute : null,
      referenceQuery: '',
      referenceVideoId: toolSkipsDesk(choice.key) ? null : customReferenceVideo,
    })
  }
  const openCustomTools = () => {
    const step = makeCustomStep()
    if (!step || !kindNeedsDesk(step.kind)) return
    setCustomSetup(step)
    if (step.kind === 'metro') setMetronomeEditorOpen(true)
    else move('custom-settings')
  }
  const saveCustomTool = (stepOverride?: RoutineStep) => {
    const base = stepOverride ?? (toolSkipsDesk(customToolKey) ? makeCustomStep() : customSetup)
    if (!base) return
    const step = createStep({
      ...base,
      referenceQuery: '',
      referenceVideoId: toolSkipsDesk(customToolKey) ? null : customReferenceVideo,
    })
    if (editingStepId) {
      try {
        storeLibraryExercise({ instrumentId: instrument, step })
        setExercises(loadExerciseLibrary())
        setDraft(current => ({ ...current, steps: current.steps.map(item => item.id === editingStepId ? step : item) }))
        setConfiguredIds(ids => [...ids.filter(id => id !== editingStepId), editingStepId])
        clearItemSetup()
        move('lineup', true)
      } catch { setError('Could not save this exercise on your device. Please try again.') }
      return
    }
    const nextSteps = [...customSteps, step]
    if (customIndex < customItems.length - 1) {
      setCustomSteps(nextSteps); setCustomIndex(index => index + 1); setCustomToolKey(null); setCustomSetup(null); setCustomMinutes(0); setCustomReferenceVideo(null); setCustomReference(''); setCustomGameRoute('menu'); setUseCurrent(false); move('custom-tool')
      return
    }
    try {
      nextSteps.forEach(item => storeLibraryExercise({ instrumentId: instrument, step: item }))
      setConfiguredIds(nextSteps.map(item => item.id)); setExercises(loadExerciseLibrary()); setDraft(current => ({ ...current, steps: nextSteps })); setSelection({}); setLineupReturn('library'); clearItemSetup(); move('lineup')
    } catch { setError('Could not save these exercises on your device. Please try again.') }
  }
  const saveMetronomeItem = (prefs: MetronomePrefs) => {
    const base = customSetup ?? makeCustomStep('metronome')
    if (!base) return
    const desk = { ...(base.desk ?? blankDesk('audio')), showMetronome: true, metronome: normalizeDeskMetronome(prefs) }
    saveCustomTool(createStep({ ...base, kind: 'metro', desk }))
  }
  const customMusicPinned = Boolean(customSetup?.projectId && hasPracticeChart(customSetup.projectId))
  const pendingSetup = draft.steps.filter(step => !configuredIds.includes(step.id))
  const saveDraft = (start: boolean) => {
    if (!canSaveRoutine(draft, () => saveDraft(start))) return
    if (pendingSetup.length) { openItemSetup(pendingSetup[0]); return }
    const next = { ...draft, steps: draft.steps.map(step => createStep(step)), name: draft.name.trim() || `${instrumentName} practice`, instrumentId: instrument, updatedAt: Date.now() }
    try {
      if (routine && routine.id !== next.id) storeLibraryRoutine(routine)
      storeLibraryRoutine(next)
      setDraft(next); setLibrary(loadRoutineLibrary())
      if (start && onSaveAndStart) onSaveAndStart(next)
      else onSave(next)
    } catch { setError('Could not save your routine on this device. Please try again.') }
  }
  const removeFromToday = () => {
    if (!routine) return
    try { storeLibraryRoutine(routine); props.onDelete() }
    catch { setError('Could not keep a copy of your routine. Please try again.') }
  }

  /* ---- Passing a routine to someone else --------------------------------
   *
   * A teacher writes the week once and sends it; every student opens the
   * attachment and has the same session, with the same tools set up on each
   * item. Attached metronome programs travel with the routine, so the
   * recipient can play the same tempo and meter sequence.
   */
  const shareRoutine = (item: Routine) => { setError(''); setShareItem(item) }

  const importInputRef = useRef<HTMLInputElement>(null)
  const importFile = (file: File) => {
    setError('')
    if (file.size > MAX_PRACTICE_PLAN_BYTES) { setError('That file is too large to be a routine.'); return }
    void file.text().then(async text => {
      const result = await importPracticePlanFileFromText(text)
      if (!result.ok) { setError(result.error); return }
      setLibrary(loadRoutineLibrary())
      openSavedRoutine(result.routine)
    }).catch(() => setError('Could not read that routine file. Please try again.'))
  }
  const importMusicFiles = async (files: File[]) => {
    if (!requirePlus('music')) return
    if (!files.length || musicImportBusyRef.current) return
    musicImportBusyRef.current = true
    setImportingMusic(true)
    setMusicImportStatus('')
    setError('')
    const failures: string[] = []
    let added = 0
    try {
      for (const [index, original] of files.entries()) {
        setMusicImportStatus(`Importing music ${index + 1} of ${files.length}…`)
        try {
          const file = await prepareRoutineMusicFile(original)
          const projectId = await onCreatePracticeItem(musicExerciseTitle(file.name))
          await savePracticeChart(projectId, file)
          added += 1
          try { storeLibraryExercise({ instrumentId: instrument, step: createMusicExercise(file.name, projectId) }) }
          catch { failures.push(`${file.name}: added to Music Library, but could not save it as a recent exercise.`) }
        } catch (cause) {
          failures.push(`${original.name}: ${cause instanceof Error ? cause.message : 'Could not import this file.'}`)
        }
      }
      if (added) setExercises(loadExerciseLibrary())
      setMusicImportStatus(added ? `${added} ${added === 1 ? 'score' : 'scores'} added to Music Library.` : '')
      if (failures.length) setError(failures.join('\n'))
    } finally {
      musicImportBusyRef.current = false
      setImportingMusic(false)
    }
  }
  const canStart = screen === 'lineup' && !pendingSetup.length && Boolean(onSaveAndStart)
  const editingToday = routine?.id === draft.id
  const startLabel = editingToday && todayStarted ? 'Save & continue' : 'Start routine'
  const secondaryAction = canStart ? { label: editingToday ? 'Save changes' : 'Save for later', run: () => saveDraft(false) } : null
  const action = screen === 'goals' ? () => { const next = buildGoalRoutine(instrument, goal); setDraft(next); setSelection(selectionForRoutine(next)); setConfiguredIds(next.steps.map(step => step.id)); setLineupReturn('goals'); move('lineup') }
    : screen === 'instrument' ? () => move(instrumentReturn)
    : screen === 'choose' ? () => move('lineup')
    : screen === 'lineup' ? () => saveDraft(canStart)
    : screen === 'custom-items' ? () => { setCustomIndex(0); setCustomSteps([]); setCustomToolKey(null); setCustomReferenceVideo(null); setCustomReference(''); setCustomGameRoute('menu'); move('custom-tool') }
    : screen === 'custom-tool' ? () => toolSkipsDesk(customToolKey) ? saveCustomTool() : openCustomTools()
    : screen === 'custom-settings' ? () => move('custom-reference')
    : screen === 'custom-reference' ? () => { if (!customReferenceVideo) setCustomReference(''); saveCustomTool() }
    : undefined
  const actionLabel = screen === 'goals' ? 'Build my practice plan' : screen === 'choose' ? 'Done' : screen === 'lineup' ? pendingSetup.length ? `Set up items · ${pendingSetup.length}` : canStart ? startLabel : 'Save routine' : screen === 'custom-items' ? `Set up ${customItems.length} ${customItems.length === 1 ? 'item' : 'items'}` : screen === 'custom-tool' ? toolSkipsDesk(customToolKey) ? 'Save item' : customToolKey === 'metronome' ? 'Set metronome' : 'Continue to tools' : screen === 'custom-settings' ? musicSetup ? 'Continue to music' : 'Continue to reference' : screen === 'custom-reference' ? musicSetup ? customMusicPinned ? 'Save item' : 'Skip music & save item' : customReferenceVideo ? 'Save item' : 'Skip reference & save item' : 'Continue'
  const disabled = screen === 'instrument' ? !instrument : screen === 'choose' || screen === 'lineup' ? !draft.steps.length : screen === 'custom-items' ? !customItems.length : screen === 'custom-tool' ? !customToolKey : false
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
    {screen !== 'routines' && <div className="routine-guide-progress" aria-label={screen === 'instrument' ? 'Step 1 of 3' : screen === 'choose' ? 'Step 2 of 3' : 'Your routine'}>
      {[0, 1, 2].map(index => <i key={index} className={index <= (screen === 'instrument' ? 0 : screen === 'library' || screen === 'choose' || screen.startsWith('custom') ? 1 : 2) ? 'is-on' : ''} />)}
    </div>}
    <div className="routine-guide-scroll" ref={scrollRef}>
        <PremiumFlowPage key={`${screen}-${screen === 'custom-tool' ? `${customIndex}-${editingStepId ?? ''}` : 0}`}
          direction={direction} data-routine-screen={screen}
          onAnimationComplete={() => {
            // Do not steal focus if the musician has already started editing.
            const page = titleRef.current?.closest('.premium-flow-page')
            if (page?.contains(document.activeElement) && document.activeElement !== page) return
            titleRef.current?.focus({ preventScroll: true })
          }}>
          <header className="routine-guide-heading">
            <div className="routine-guide-motif" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map(index => <i key={index} />)}</div>
            {screen !== 'instrument' && screen !== 'routines' && <button className="routine-guide-instrument" type="button" onClick={() => { setInstrumentReturn(screen); setChangingInstrument(true); move('instrument', true) }}>{instrumentName}<ChevronRight aria-hidden /></button>}
            <h2 ref={titleRef} tabIndex={-1}>{titles[screen]}</h2>
            <p>{subtitles[screen]}</p>
          </header>
          {screen === 'routines' && <div className="routine-guide-routines">
            <button type="button" className="routine-guide-new-routine" onClick={startNewRoutine}>
              <span><Plus aria-hidden /></span>
              <strong>New routine</strong>
              <small>Choose music, then set up your exercises</small>
              <ChevronRight aria-hidden />
            </button>
            <section className="routine-guide-saved" aria-label="Your saved routines">
              <h3>{savedRoutines.length ? 'Built routines' : 'Built routines will appear here'}</h3>
              {savedRoutines.length ? (
                <div className="routine-guide-saved-list">
                  {savedRoutines.map(item => {
                    const itemInstrument = item.instrumentId
                      ? getInstrumentProfile(item.instrumentId)?.label ?? 'Instrument'
                      : 'General'
                    const itemMinutes = item.steps.reduce((sum, step) => sum + step.minutes, 0)
                    const active = item.id === routine?.id
                    return <div key={item.id} className="routine-guide-saved-row">
                      <button type="button" className="routine-guide-saved-routine" onClick={() => openSavedRoutine(item)}>
                        <span className="routine-guide-saved-routine__copy">
                          <strong>{item.name}</strong>
                          <small>{itemInstrument} · {item.steps.length} {item.steps.length === 1 ? 'exercise' : 'exercises'} · {formatMinutes(itemMinutes)}</small>
                        </span>
                        {active ? <em>Today</em> : null}
                        <ChevronRight aria-hidden />
                      </button>
                      <Pressable type="button" intensity="icon" haptic="light" hapticFeedback={hapticFeedback}
                        className="routine-guide-saved-share" onClick={() => shareRoutine(item)}
                        aria-label={`Share ${item.name}`} title={`Share ${item.name}`}>
                        <Share2 aria-hidden /><span>Share</span>
                      </Pressable>
                    </div>
                  })}
                </div>
              ) : (
                <p>Your saved practice plans will stay together on this page.</p>
              )}
            </section>

            <section className="routine-guide-imports" aria-label="Import into your library">
              <h3>Import</h3>
              <div className="routine-guide-import-grid">
                <button type="button" className="routine-guide-own" disabled={importingMusic} onClick={() => musicInputRef.current?.click()}>
                  <FileMusic aria-hidden />
                  <span><strong>Import PDF</strong><small>Or a photo of your music</small></span>
                  <ArrowRight aria-hidden />
                </button>
                <button type="button" className="routine-guide-own" onClick={() => importInputRef.current?.click()}>
                  <Upload aria-hidden />
                  <span><strong>Import routine</strong><small>Open a shared .{PRACTICE_PLAN_EXTENSION} file</small></span>
                  <ArrowRight aria-hidden />
                </button>
              </div>
              {musicImportStatus && <p className="routine-guide-import-status" role="status">{musicImportStatus}</p>}
              <input ref={musicInputRef} type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp,.pdf" onChange={event => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                void importMusicFiles(files)
              }} />
              <input
                ref={importInputRef}
                type="file"
                accept={`.${PRACTICE_PLAN_EXTENSION},application/json`}
                hidden
                onChange={event => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) importFile(file)
                }}
              />
            </section>
            {props.onOpenMusicLibrary && <section className="routine-guide-music-link" aria-label="Music Library">
              <h3>Music</h3>
              <button type="button" className="routine-guide-own" onClick={props.onOpenMusicLibrary}>
                <Music2 aria-hidden />
                <span><strong>Music Library</strong><small>Open your scores and practice with them</small></span>
                <ArrowRight aria-hidden />
              </button>
            </section>}
          </div>}
          {screen === 'goals' && <>
            <div className="routine-guide-tool-list">{PRACTICE_GOALS.map(item => <button type="button" key={item.id} className="routine-guide-choice" aria-pressed={goal === item.id} onClick={() => setGoal(item.id)}><span><strong>{item.title}</strong><small>{item.detail}</small></span>{goal === item.id && <Check aria-hidden />}</button>)}</div>
          </>}
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
            {templates.length > 6 && <PremiumDisclosure className="routine-guide-more"><summary>More exercises</summary><div className="routine-guide-grid">{templates.slice(6).map(renderTemplate)}</div></PremiumDisclosure>}
            <button type="button" className="routine-guide-text" onClick={() => move('lineup')}>Back to lineup</button>
          </>}
          {screen === 'lineup' && <>
            <button type="button" className="routine-guide-own" disabled={!draft.steps.length} onClick={() => shareRoutine(draft)}><Share2 aria-hidden /> Share routine file</button>
            <label className="routine-guide-field routine-guide-field--name">Routine name<input id="guide-routine-name" maxLength={MAX_ROUTINE_NAME} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <div className="routine-guide-lineup-meta">{draft.steps.length} exercises <span>·</span> {formatMinutes(total)}</div>
            <p className="routine-guide-ready-note">{pendingSetup.length ? null : <Check size={16} aria-hidden />}{pendingSetup.length ? 'Set up the remaining exercises before starting.' : 'Ready to start. Tap an exercise to adjust.'}</p>
            <ol className="routine-guide-lineup">
              {draft.steps.map((step, index) => <SwipeRoutineItem key={step.id} title={step.title} onRemove={() => setDraft(current => ({ ...current, steps: current.steps.filter(item => item.id !== step.id) }))}>
                <span className="routine-guide-number">{String(index + 1).padStart(2, '0')}</span>
                <button type="button" className="routine-guide-item" onClick={() => openItemSetup(step)}><strong>{step.title}</strong><small>{summarizeStep(step, tunerTransposition)}</small></button>
                {showReorder ? <div className="routine-guide-reorder">
                  {[-1, 1].map(delta => <button key={delta} type="button" aria-label={`Move ${step.title} ${delta === -1 ? 'up' : 'down'}`} disabled={index + delta < 0 || index + delta >= draft.steps.length} onClick={() => setDraft(current => {
                    const steps = [...current.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]]; return { ...current, steps }
                  })}>{delta === -1 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}</button>)}
                </div> : <ChevronRight aria-hidden className="routine-guide-edit-exercise" />}
              </SwipeRoutineItem>)}
            </ol>
            <div className="routine-guide-lineup-actions"><button type="button" className="routine-guide-text" onClick={() => move('choose', true)}>＋ Add an exercise</button><button type="button" className="routine-guide-text" aria-pressed={showReorder} onClick={() => setShowReorder(value=>!value)}>{showReorder ? 'Done reordering' : 'Reorder exercises'}</button></div>
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
            <ol className="routine-guide-custom-list">{customItems.map((item, index) => <SwipeRoutineItem key={`${item}-${index}`} title={item} onRemove={() => setCustomItems(items => items.filter((_, itemIndex) => itemIndex !== index))}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong><div><button type="button" disabled={index === 0} onClick={() => moveCustomItem(index, -1)} aria-label={`Move ${item} up`}><ArrowUp aria-hidden /></button><button type="button" disabled={index === customItems.length - 1} onClick={() => moveCustomItem(index, 1)} aria-label={`Move ${item} down`}><ArrowDown aria-hidden /></button><button type="button" onClick={() => setCustomItems(items => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item}`}><Trash2 aria-hidden /></button></div></SwipeRoutineItem>)}</ol>
          </div>}
          {screen === 'custom-tool' && <>
            {!editingStepId && customItems.length > 1 && <div className="routine-guide-item-progress" aria-label="Routine item progress">{customItems.map((item, index) => <span key={`${item}-${index}`} className={index < customIndex ? 'is-done' : index === customIndex ? 'is-current' : ''}>{index < customIndex ? <Check aria-hidden /> : index + 1}</span>)}</div>}
            <div className="routine-guide-tool-list">{toolChoices.map(choice => <Pressable type="button" key={choice.key} haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-choice" aria-pressed={customToolKey === choice.key} onClick={() => {
              setCustomToolKey(choice.key)
              if (choice.kind === 'game' && !customGameRoute) setCustomGameRoute('menu')
              if (choice.kind === 'metro') {
                const step = makeCustomStep(choice.key)
                if (step) { setCustomSetup(step); setMetronomeEditorOpen(true) }
              }
            }}><span><strong>{choice.title}</strong><small>{choice.detail}</small></span>{customToolKey === choice.key && <Check aria-hidden />}</Pressable>)}</div>
            {customToolKey === 'game' && <div className="routine-guide-tool-list" role="radiogroup" aria-label="Which game">{GAMES.map(game => <Pressable type="button" key={game.route} haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-choice" role="radio" aria-checked={customGameRoute === game.route} onClick={() => { setCustomToolKey('game'); setCustomGameRoute(game.route) }}><span><strong>{game.label}</strong><small>{game.hint}</small></span>{customGameRoute === game.route && <Check aria-hidden />}</Pressable>)}</div>}
            {customToolKey && !toolSkipsDesk(customToolKey) && <label className="routine-guide-current"><input type="checkbox" checked={useCurrent} onChange={event => setUseCurrent(event.target.checked)} /><SlidersHorizontal aria-hidden /><span>Also use my current workspace settings</span></label>}
            <label className="routine-guide-field">Minutes <small>· optional</small><input type="number" inputMode="numeric" min={0} max={180} aria-label="Exercise minutes" value={customMinutes || ''} placeholder="Untimed" onChange={event => setCustomMinutes(Math.max(0, Math.min(180, Math.round(Number(event.target.value) || 0))))} /></label>
          </>}
          {screen === 'custom-settings' && customSetup && <div className="routine-guide-editor">
            <RoutineDeskSetup
              step={customSetup}
              instrumentId={instrument}
              tunerTransposition={getInstrumentProfile(instrument ?? '')?.tunerTransposition ?? tunerTransposition}
              hapticFeedback={hapticFeedback}
              onChange={patch => setCustomSetup(current => current ? { ...current, ...patch } : current)}
            />
          </div>}
          {screen === 'custom-reference' && musicSetup && customSetup && (
            <RoutineMusicSetup step={customSetup} onCreatePracticeItem={onCreatePracticeItem}
              onChange={patch => setCustomSetup(current => current ? { ...current, ...patch } : current)} />
          )}
          {screen === 'custom-reference' && !musicSetup && (
            <RoutineReferenceSetup instrumentId={instrument} title={setupTitle} value={customReference} onChange={setCustomReference}
              videoId={customReferenceVideo} onVideoIdChange={setCustomReferenceVideo} />
          )}
          {screen === 'library' && <>
            <section className="routine-guide-library"><h3>Suggested for {instrumentName.toLowerCase()}</h3>{presets.map(preset => <button type="button" key={preset.id} className="routine-guide-choice" onClick={() => { const next = buildPresetRoutine(preset, instrument); setDraft(next); setSelection(selectionForRoutine(next)); setConfiguredIds(next.steps.map(step => step.id)); setLineupReturn('library'); clearItemSetup(); move('lineup') }}><span><strong>{preset.name}</strong><small>{preset.blurb} · About {presetMinutes(preset, instrument)} min</small></span><ChevronRight aria-hidden /></button>)}</section>
            <button type="button" className="routine-guide-choice routine-goal-entry" onClick={() => move('goals')}><span><strong>Build a plan for my goals</strong><small>Choose what you want to work on</small></span><ArrowRight aria-hidden /></button>
            <button type="button" className="routine-guide-own" onClick={startCustomRoutine}><Plus aria-hidden /><span><strong>Build your own routine</strong><small>Type your practice items and choose what opens for each.</small></span><ArrowRight aria-hidden /></button>
          </>}
        </PremiumFlowPage>
    </div>
    {error && <p className="routine-guide-error" role="alert">{error}</p>}
    <RoutineMetronomeEditor
      isOpen={metronomeEditorOpen}
      itemTitle={setupTitle}
      value={normalizeDeskMetronome(customSetup?.desk?.metronome)}
      onSave={saveMetronomeItem}
      onClose={() => {
        setMetronomeEditorOpen(false)
        if (screen === 'lineup') clearItemSetup()
      }}
    />
    <AnimatePresence>{shareItem && <RoutineShareDialog routine={shareItem} onClose={() => setShareItem(null)} />}</AnimatePresence>
    {action && <footer className="routine-guide-footer"><div className="routine-guide-footer__actions">
      {secondaryAction && <Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-secondary" disabled={disabled} onClick={secondaryAction.run}>{secondaryAction.label}</Pressable>}
      <Pressable type="button" haptic="light" hapticFeedback={hapticFeedback} squish={!reducedMotion} className="routine-guide-continue" disabled={disabled} onClick={action}>{actionLabel}<ArrowRight aria-hidden /></Pressable>
    </div></footer>}
  </section>
}
