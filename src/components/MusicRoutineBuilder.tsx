import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Check, ChevronDown, ChevronRight, FileMusic, Music2, Plus, Share2, SlidersHorizontal, Trash2, Upload, Waves, X } from 'lucide-react'
import type { RoutineBuilderProps } from './RoutineBuilder'
import GuidedRoutineBuilder from './GuidedRoutineBuilder'
import RoutineMetronomeEditor from './RoutineMetronomeEditor'
import RoutineProgramSetup from './RoutineProgramSetup'
import RoutineReferenceSetup from './RoutineReferenceSetup'
import { blankDesk, createRoutine, createStep, MAX_ROUTINE_NAME, MAX_ROUTINE_STEPS, MAX_STEP_TITLE, summarizeStep, type Routine, type RoutineStep } from '../utils/practiceRoutines'
import { loadExerciseLibrary, loadRoutineLibrary, storeLibraryExercise, storeLibraryRoutine } from '../utils/routineLibrary'
import { hasPracticeChart, loadPracticeChart, practiceChartName, savePracticeChart } from '../utils/practiceChartStorage'
import { copyExerciseTools, createMusicExercise, musicExerciseTitle, prepareRoutineMusicFile, reuseMusicExercise } from '../utils/routineMusic'
import { homePitchClass } from '../utils/routinePresets'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import { getWrittenPitchLabel } from '../utils/tunerTransposition'
import { getPracticeRhythmOptions, AUDIO_PRACTICE_CLICK_SOUNDS } from './audioPractice/audioPracticeMetronome'
import { sharePracticeRoutine } from '../utils/practiceRoutineShare'
import type { DeskSnapshot } from '../utils/workspaceDesks'
import type { ChartDocument } from './practiceChart/chartDocument'
import '../styles/routine-guide.css'
import '../styles/music-routine-builder.css'

// Large music libraries must not start a PDF worker for every visible row at once.
let thumbnailQueue: Promise<void> = Promise.resolve()

/** A real first-page thumbnail, with an icon fallback if a file is unavailable. */
function ScoreThumbnail({ projectId, revision }: { projectId: string | null; revision: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [image, setImage] = useState('')
  const [rendered, setRendered] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let pdf: ChartDocument | undefined
    setImage(''); setRendered(false)
    if (projectId) thumbnailQueue = thumbnailQueue.then(async () => {
      if (controller.signal.aborted) return
      const chart = await loadPracticeChart(projectId)
      if (!chart || controller.signal.aborted) return
      if (!chart.bytes) { setImage(chart.objectUrl); return }
      const { openPdfChart } = await import('./practiceChart/chartDocument')
      if (controller.signal.aborted) return
      pdf = await openPdfChart(chart.bytes)
      try {
        if (!controller.signal.aborted && canvas.current) {
          await pdf.renderPage(0, canvas.current, 70, controller.signal)
          if (!controller.signal.aborted) setRendered(true)
        }
      } finally { pdf.destroy() }
    }).catch(() => { /* The row still has a name and file icon. */ })
    return () => { controller.abort(); pdf?.destroy() }
  }, [projectId, revision])
  return <span className="music-routine-thumb" aria-hidden>
    {!rendered && !image && <FileMusic />}
    <canvas ref={canvas} hidden={!rendered} />
    {image && <img src={image} alt="" />}
  </span>
}

function metronomeDetail(step: RoutineStep): string {
  const prefs = normalizeDeskMetronome(step.desk?.metronome)
  return [prefs.meter,
    getPracticeRhythmOptions(prefs.meter, prefs.pulseModeId).find(option => option.value === prefs.subdivision)?.name,
    AUDIO_PRACTICE_CLICK_SOUNDS.find(option => option.id === prefs.soundId)?.label,
  ].filter(Boolean).join(' · ')
}

/** The approved music-first flow. Existing plans keep the same routine model. */
export default function MusicRoutineBuilder(props: RoutineBuilderProps) {
  const [draft, setDraft] = useState(() => props.mode === 'edit' && props.routine ? props.routine : createRoutine('My practice', [], props.instrumentId))
  const [screen, setScreen] = useState<'music' | 'lineup'>(() => props.mode === 'edit' && props.routine ? 'lineup' : 'music')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [legacy, setLegacy] = useState<'library' | 'edit' | null>(null)
  const [exerciseLibrary, setExerciseLibrary] = useState(loadExerciseLibrary)
  const [visibleMusicCount, setVisibleMusicCount] = useState(8)
  const [routineLibrary, setRoutineLibrary] = useState(loadRoutineLibrary)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [showExercise, setShowExercise] = useState(false)
  const [exerciseName, setExerciseName] = useState('')
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  const [copyTargets, setCopyTargets] = useState<string[]>([])
  const [metronomeId, setMetronomeId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replaceId = useRef<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { scroll.current?.scrollTo(0, 0) }, [screen])

  const patchStep = (id: string, patch: Partial<RoutineStep>) => setDraft(current => ({ ...current, steps: current.steps.map(step => step.id === id ? { ...step, ...patch } : step) }))
  const patchDesk = (step: RoutineStep, patch: Partial<DeskSnapshot>) => patchStep(step.id, { desk: { ...(step.desk ?? blankDesk('audio')), ...patch } })
  const music = useMemo(() => {
    const saved = exerciseLibrary.filter(item => item.step.projectId && hasPracticeChart(item.step.projectId))
    const known = new Set(saved.map(item => item.step.projectId))
    const other = props.projects.filter(project => !known.has(project.id) && hasPracticeChart(project.id)).map(project => ({ instrumentId: props.instrumentId, step: createMusicExercise(project.name, project.id) }))
    return [...saved, ...other]
  }, [exerciseLibrary, props.projects, props.instrumentId, revision])
  const savedRoutines = useMemo(() => {
    const byId = new Map<string, Routine>()
    for (const item of [...routineLibrary, ...(props.routine ? [props.routine] : [])]) {
      if (!byId.has(item.id) || byId.get(item.id)!.updatedAt < item.updatedAt) byId.set(item.id, item)
    }
    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [routineLibrary, props.routine])
  const selectedMetronome = draft.steps.find(step => step.id === metronomeId)

  const openPicker = (id: string | null = null) => {
    replaceId.current = id
    if (fileInput.current) { fileInput.current.multiple = id === null; fileInput.current.click() }
  }
  const addSteps = (steps: RoutineStep[]) => {
    setDraft(current => ({ ...current, steps: [...current.steps, ...steps].slice(0, MAX_ROUTINE_STEPS) }))
    setScreen('lineup')
    if (steps[0]) setExpanded(steps[0].id)
  }
  const importFiles = async (files: File[]) => {
    if (busyRef.current || !files.length) return
    const replacement = replaceId.current ? draft.steps.find(step => step.id === replaceId.current) : null
    replaceId.current = null
    const capacity = replacement ? 1 : MAX_ROUTINE_STEPS - draft.steps.length
    if (capacity <= 0) { setError(`A routine can have up to ${MAX_ROUTINE_STEPS} exercises.`); return }
    busyRef.current = true; setBusy(true); setError('')
    const failures: string[] = []
    const added: RoutineStep[] = []
    const picked = files.slice(0, capacity)
    try {
      for (const [index, original] of picked.entries()) {
        setProgress(`Adding music ${index + 1} of ${picked.length}…`)
        try {
          const file = await prepareRoutineMusicFile(original)
          if (!alive.current) break
          const projectId = replacement?.projectId ?? await props.onCreatePracticeItem(musicExerciseTitle(file.name))
          await savePracticeChart(projectId, file)
          const step = replacement ? createStep({ ...replacement, projectId, kind: 'record', desk: { ...(replacement.desk ?? blankDesk('audio')), mode: 'audio', showMusic: true } }) : createMusicExercise(file.name, projectId)
          // An imported exercise stays in recent music if the draft is closed.
          // Library failure must not disguise a successfully stored file.
          try { storeLibraryExercise({ instrumentId: draft.instrumentId, step }) }
          catch { failures.push(`${file.name}: music was added, but its recent-exercise entry could not be saved.`) }
          if (replacement) patchStep(step.id, step)
          else added.push(step)
        } catch (cause) { failures.push(`${original.name}: ${cause instanceof Error ? cause.message : 'Could not add this file.'}`) }
      }
      if (!alive.current) return
      if (added.length) addSteps(added)
      if (replacement) setExpanded(replacement.id)
      if (files.length > capacity) failures.push(`Only ${capacity} ${capacity === 1 ? 'file fits' : 'files fit'} in this routine. Add the remaining music to another routine.`)
      setExerciseLibrary(loadExerciseLibrary()); setRevision(value => value + 1)
      setError(failures.join('\n'))
    } finally {
      busyRef.current = false
      if (alive.current) { setBusy(false); setProgress('') }
    }
  }
  const reuse = (step: RoutineStep) => {
    if (draft.steps.length >= MAX_ROUTINE_STEPS) { setError(`Keep your routine to ${MAX_ROUTINE_STEPS} exercises or fewer.`); return }
    const next = reuseMusicExercise(step)
    if (draft.steps.some(item => item.id === next.id)) { setExpanded(next.id); setScreen('lineup'); return }
    addSteps([next])
  }
  const addExercise = () => {
    if (!exerciseName.trim() || draft.steps.length >= MAX_ROUTINE_STEPS) return
    addSteps([createStep({ title: exerciseName, kind: 'record', minutes: 0, desk: blankDesk('audio') })])
    setExerciseName(''); setShowExercise(false)
  }
  const openRoutine = (routine: Routine) => { setDraft(routine); setExpanded(null); setScreen('lineup'); setError('') }
  const save = async (start: boolean) => {
    if (!draft.steps.length || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const next = { ...draft, name: draft.name.trim() || 'My practice', updatedAt: Date.now(), steps: draft.steps.map(step => createStep(step)) }
      next.steps.forEach(step => storeLibraryExercise({ instrumentId: next.instrumentId, step }))
      if (props.routine && props.routine.id !== next.id) storeLibraryRoutine(props.routine)
      storeLibraryRoutine(next)
      setDraft(next); setRoutineLibrary(loadRoutineLibrary()); setExerciseLibrary(loadExerciseLibrary())
      if (start && props.onSaveAndStart) await props.onSaveAndStart(next)
      else props.onSave(next)
    } catch { setError('Could not save or start this routine. Your draft is still here; please try again.') }
    finally { busyRef.current = false; if (alive.current) setBusy(false) }
  }
  const share = async () => {
    const result = await sharePracticeRoutine(draft)
    if (!result.ok) setError(result.error)
  }
  const reorder = (index: number, delta: number) => setDraft(current => {
    const steps = [...current.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]]
    return { ...current, steps }
  })

  if (props.mode === 'presets' || legacy) return <GuidedRoutineBuilder {...props}
    mode={legacy === 'edit' ? 'edit' : props.mode === 'presets' ? 'presets' : 'build'}
    routine={legacy === 'edit' ? draft : props.routine}
    onCancel={legacy ? () => setLegacy(null) : props.onCancel}
    onSave={legacy === 'edit' ? next => { openRoutine(next); setLegacy(null) } : props.onSave}
    onSaveAndStart={legacy === 'edit' ? undefined : props.onSaveAndStart} />

  return <section className="routine-guide music-routine-builder" aria-label="Build your routine" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!busyRef.current) props.onCancel() }
  }}>
    <nav className="music-routine-nav"><button type="button" disabled={busy} aria-label="Back" onClick={() => screen === 'lineup' ? setScreen('music') : props.onCancel()}><ArrowLeft /></button><span>BESTTAKE <i /> YOUR ROUTINE</span><button type="button" disabled={busy} aria-label="Close routine builder" onClick={props.onCancel}><X /></button></nav>
    <div className="music-routine-scroll" ref={scroll}>
      <fieldset className="music-routine-content" disabled={busy}>
        {screen === 'music' ? <>
          <header className="music-routine-heading"><span>NEW ROUTINE</span><h2>Your music.<br />Ready to practice.</h2><p>Add your scores, then choose each exercise’s tools.</p></header>
          <div className="music-routine-import"><button type="button" className="music-routine-primary" onClick={() => openPicker()}><Upload /> Import music</button><p>Choose one or more PDFs or photos.</p></div>
          {music.length > 0 && <section className="music-routine-recent"><div className="music-routine-section-title"><h3>Your music</h3><span>With saved exercise settings</span></div>{music.slice(0, visibleMusicCount).map(({ step }) => <button type="button" key={step.id} className="music-routine-recent-row" onClick={() => reuse(step)}><ScoreThumbnail projectId={step.projectId} revision={revision} /><span><strong>{step.title}</strong><small>{summarizeStep(step, 'concert')}</small></span><Plus /></button>)}{music.length > visibleMusicCount && <button type="button" className="music-routine-text" onClick={() => setVisibleMusicCount(count => count + 8)}>Show more music ({music.length - visibleMusicCount})</button>}</section>}
          <button type="button" className="music-routine-text" onClick={() => { setShowExercise(true); setScreen('lineup') }}>Add an exercise without music</button>
          {savedRoutines.length > 0 && <section className="music-routine-saved"><div className="music-routine-section-title"><h3>Saved routines</h3></div>{savedRoutines.map(item => <button type="button" key={item.id} onClick={() => openRoutine(item)}><span><strong>{item.name}</strong><small>{item.steps.length} exercises{props.routine?.id === item.id ? ' · Today' : ''}</small></span><ChevronRight /></button>)}</section>}
          <button type="button" className="music-routine-text" onClick={() => setLegacy('library')}>Presets, goals & shared routines <ChevronRight /></button>
        </> : <>
          <header className="music-routine-heading music-routine-heading--compact"><span>{draft.steps.length} {draft.steps.length === 1 ? 'EXERCISE' : 'EXERCISES'} · READY WHEN YOU ARE</span><h2>Your music is<br />the plan.</h2></header>
          <label className="music-routine-name"><span>Routine name</span><input aria-label="Routine name" maxLength={MAX_ROUTINE_NAME} value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
          <div className="music-routine-section-title"><h3>Your exercises</h3><span>Each has its own setup</span></div>
          <ol className="music-routine-list">{draft.steps.map((step, index) => {
            const desk = step.desk ?? blankDesk('audio')
            const metronome = normalizeDeskMetronome(desk.metronome)
            const toolsAllowed = step.kind !== 'game' && step.kind !== 'free'
            const attached = Boolean(step.projectId && hasPracticeChart(step.projectId))
            return <li key={step.id} className={expanded === step.id ? 'is-expanded' : ''}>
              <button type="button" className="music-routine-item" aria-expanded={expanded === step.id} onClick={() => setExpanded(expanded === step.id ? null : step.id)}><span className="music-routine-order">{index + 1}</span>{attached ? <ScoreThumbnail projectId={step.projectId} revision={revision} /> : <span className="music-routine-thumb"><Music2 /></span>}<span className="music-routine-copy"><strong>{step.title}</strong><small>{summarizeStep(step, 'concert')}</small></span><ChevronDown /></button>
              {expanded === step.id && <div className="music-routine-item-settings">
                {toolsAllowed && <>
                  <span className="music-routine-tool-label">Tools for this exercise</span>
                  <div className="music-routine-tools">{([
                    ['showMetronome', 'Metronome', SlidersHorizontal], ['showDrone', 'Drone', Waves], ['pitchTrackerEnabled', 'Pitch graph', AudioLines],
                  ] as const).map(([key, label, Icon]) => <button type="button" key={key} aria-pressed={desk[key]} onClick={() => patchDesk(step, { [key]: !desk[key], ...(key === 'showDrone' && !desk.showDrone ? { drone: { ...desk.drone, pitchClass: desk.drone.pitchClass ?? homePitchClass(draft.instrumentId) } } : {}) })}><Icon /><span>{label}</span>{desk[key] && <Check />}</button>)}</div>
                  {desk.showMetronome && <><label className="music-routine-setting"><span>Tempo</span><span><input type="number" aria-label="Tempo in BPM" min={20} max={300} value={metronome.bpm} onChange={event => patchDesk(step, { metronome: normalizeDeskMetronome({ ...metronome, bpm: event.target.value }) })} /> <small>BPM</small></span></label><button type="button" className="music-routine-open-metronome" onClick={() => setMetronomeId(step.id)}><SlidersHorizontal /><span><strong>Open metronome</strong><small>{metronomeDetail(step)}</small></span><ChevronRight /></button></>}
                  {desk.showDrone && <label className="music-routine-setting"><span>Drone note</span><select aria-label="Drone note" value={desk.drone.pitchClass ?? ''} onChange={event => patchDesk(step, { drone: { ...desk.drone, pitchClass: event.target.value === '' ? null : Number(event.target.value) } })}><option value="">Choose a note</option>{Array.from({ length: 12 }, (_, pitch) => <option key={pitch} value={pitch}>{getWrittenPitchLabel(pitch, desk.drone.octave, 'concert').label}</option>)}</select></label>}
                  <p className="music-routine-hint">Opens with this exercise every time.</p>
                  <details className="music-routine-reference"><summary><FileMusic /><span>References<small>{step.referenceVideoId ? 'Recording selected · opens with this exercise' : 'Choose a recording to hear alongside your music'}</small></span><ChevronDown /></summary><RoutineReferenceSetup instrumentId={draft.instrumentId} title={step.title} value={step.referenceQuery} onChange={referenceQuery => patchStep(step.id, { referenceQuery })} videoId={step.referenceVideoId} onVideoIdChange={referenceVideoId => patchStep(step.id, { referenceVideoId })} /></details>
                </>}
                {(!attached || !toolsAllowed) && <button type="button" className="music-routine-attach" onClick={() => openPicker(step.id)}><FileMusic /> Add music to this exercise</button>}
                <details className="music-routine-more"><summary>More options</summary>
                  <label className="music-routine-field">Exercise name<input aria-label="Exercise name" maxLength={MAX_STEP_TITLE} value={step.title} onChange={event => patchStep(step.id, { title: event.target.value })} /></label>
                  <label className="music-routine-setting"><span>Minutes <small>· optional</small></span><input type="number" aria-label="Exercise minutes" min={0} max={180} value={step.minutes} onChange={event => patchStep(step.id, { minutes: Number(event.target.value) })} /></label>
                  {attached && <div className="music-routine-attached"><FileMusic /><span>{practiceChartName(step.projectId!) ?? 'Sheet music'}</span><button type="button" onClick={() => openPicker(step.id)}>Change file</button></div>}
                  {toolsAllowed && <>
                    <label className="music-routine-check"><input type="checkbox" checked={desk.autoSoundRecording} onChange={event => patchDesk(step, { autoSoundRecording: event.target.checked })} /> Hands-free recording</label>
                    <RoutineProgramSetup value={step.programId} onChange={programId => patchStep(step.id, { programId })} />
                    {draft.steps.filter(item => item.id !== step.id && item.kind !== 'game' && item.kind !== 'free').length > 0 && <button type="button" className="music-routine-copy-setup" onClick={() => { setCopyFrom(copyFrom === step.id ? null : step.id); setCopyTargets([]) }}>Copy setup to other exercises…</button>}
                    {copyFrom === step.id && <div className="music-routine-copy-targets"><p>Choose which exercises to update.</p>{draft.steps.filter(item => item.id !== step.id && item.kind !== 'game' && item.kind !== 'free').map(item => <label key={item.id}><input type="checkbox" checked={copyTargets.includes(item.id)} onChange={() => setCopyTargets(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])} />{item.title}</label>)}<button type="button" disabled={!copyTargets.length} onClick={() => { setDraft(current => ({ ...current, steps: current.steps.map(item => copyTargets.includes(item.id) ? copyExerciseTools(step, item) : item) })); setCopyFrom(null); setCopyTargets([]) }}>Apply to selected</button></div>}
                  </>}
                  <div className="music-routine-item-actions"><button type="button" disabled={index === 0} aria-label={`Move ${step.title} up`} onClick={() => reorder(index, -1)}><ArrowUp /></button><button type="button" disabled={index === draft.steps.length - 1} aria-label={`Move ${step.title} down`} onClick={() => reorder(index, 1)}><ArrowDown /></button><button type="button" onClick={() => setDraft(current => ({ ...current, steps: current.steps.filter(item => item.id !== step.id) }))}><Trash2 /> Remove from routine</button></div>
                </details>
              </div>}
            </li>
          })}</ol>
          <button type="button" className="music-routine-add" disabled={draft.steps.length >= MAX_ROUTINE_STEPS} onClick={() => openPicker()}><Plus /> Add music</button>
          <button type="button" className="music-routine-text" disabled={draft.steps.length >= MAX_ROUTINE_STEPS} onClick={() => setShowExercise(value => !value)}>Add an exercise without music</button>
          {showExercise && <form className="music-routine-exercise-entry" onSubmit={event => { event.preventDefault(); addExercise() }}><input autoFocus aria-label="New exercise name" maxLength={MAX_STEP_TITLE} placeholder="Long tones, warm-up…" value={exerciseName} onChange={event => setExerciseName(event.target.value)} /><button type="submit" aria-label="Add exercise" disabled={!exerciseName.trim()}><Plus /></button></form>}
          <details className="music-routine-plan-options"><summary>Routine options</summary><button type="button" disabled={!draft.steps.length} onClick={() => void share()}><Share2 /> Share routine file</button><button type="button" onClick={() => setLegacy('edit')}>Full routine editor</button>{props.routine?.id === draft.id && <button type="button" onClick={() => { try { storeLibraryRoutine(draft); props.onDelete() } catch { setError('Could not save a copy of this routine.') } }}>Remove from today · keep in library</button>}</details>
        </>}
      </fieldset>
    </div>
    {error && <p className="music-routine-error" role="alert">{error}</p>}
    {busy && <p className="music-routine-progress" role="status">{progress || 'Saving routine…'}</p>}
    {screen === 'lineup' && <footer className="music-routine-footer"><button type="button" className="music-routine-save-later" disabled={busy || !draft.steps.length} onClick={() => void save(false)}>Save for later</button><button type="button" className="music-routine-primary" disabled={busy || !draft.steps.length} onClick={() => void save(Boolean(props.onSaveAndStart))}>{props.onSaveAndStart ? props.todayStarted && draft.id === props.routine?.id ? 'Save & continue' : 'Start routine' : 'Save routine'}<ArrowRight /></button></footer>}
    {screen === 'music' && draft.steps.length > 0 && <footer className="music-routine-footer"><button type="button" className="music-routine-primary" disabled={busy} onClick={() => setScreen('lineup')}>Continue with {draft.steps.length} exercises <ArrowRight /></button></footer>}
    <input ref={fileInput} type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp,.pdf" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files) }} />
    <RoutineMetronomeEditor isOpen={Boolean(selectedMetronome)} itemTitle={selectedMetronome?.title} value={normalizeDeskMetronome(selectedMetronome?.desk?.metronome)} onSave={metronome => { if (selectedMetronome) patchDesk(selectedMetronome, { metronome }) }} onClose={() => setMetronomeId(null)} />
  </section>
}
