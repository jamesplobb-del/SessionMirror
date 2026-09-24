import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, FileMusic, Mic, Moon, Music2, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Sun, Trash2, Upload, Waves, X } from 'lucide-react'
import { normalizeDeskMetronome } from '../../../src/utils/deskMetronome'
import type { MetronomePrefs } from '../../../src/utils/metronomeConfig'
import { getPracticeRhythmOptions, AUDIO_PRACTICE_CLICK_SOUNDS } from '../../../src/components/audioPractice/audioPracticeMetronome'
import '../../../src/styles/routine-guide.css'
import '../../../src/styles/open-lens-system.css'
import './routine-music-concepts.css'

// This is an isolated, memory-only product preview. It does not mount the app,
// write practice data, analyze notation, or start recording. The real metronome
// editor lives in a separate iframe and can be auditioned with its Play button.
type Concept = 'import' | 'shelf' | 'guided'
type Stage = 'music' | 'setup' | 'practice'
type Tool = 'metronome' | 'drone' | 'pitch'
type Settings = { tools: Tool[]; bpm: number; drone: string; metronome?: MetronomePrefs }
type EditorTarget = { scoreId: string | null; title: string; prefs: MetronomePrefs; requestId: string; dark: boolean }
type Score = { id: string; title: string; subtitle: string; settings: Settings; url?: string; mime?: string; exercise?: boolean }
const defaults: Settings = { tools: [], bpm: 80, drone: 'C' }
const choices = [
  { key: 'metronome' as const, name: 'Metronome', icon: SlidersHorizontal },
  { key: 'drone' as const, name: 'Drone', icon: Waves },
  { key: 'pitch' as const, name: 'Pitch', icon: AudioLines },
]
const concepts: Record<Concept, { label: string; tagline: string; detail: string; steps: string[]; advantage: string; tradeoff: string }> = {
  import: { label: 'Import & go', tagline: 'Each exercise. Its own setup.', detail: 'Import your music, then set the tools and tempo on each exercise. Everything stays in one list. Saved exercises bring their setup next time.', steps: ['Import your music', 'Set up each exercise', 'Start with its own tools'], advantage: 'Clarke at 100 BPM with pitch. Your next piece with a different setup.', tradeoff: 'Open one exercise at a time. Copy its setup to selected items only when you want to.' },
  shelf: { label: 'Your music shelf', tagline: 'Pick music you already know.', detail: 'Choose scores from your music, or import new ones into the same picker. Saved tools come with each score.', steps: ['Pick from your music', 'Check the selected scores', 'Start with saved tools'], advantage: 'Best for returning musicians reusing the same repertoire.', tradeoff: 'One extra selection step, but much less repeat setup.' },
  guided: { label: 'Quick rehearsal', tagline: 'One setup for the session.', detail: 'An alternative for rehearsal: choose the music, then one common set of tools. Use Import & go when each exercise needs its own setup.', steps: ['Choose the scores', 'Choose shared tools', 'Start your session'], advantage: 'Useful when you only need a pitch graph or drone throughout rehearsal.', tradeoff: 'Shared settings suit this specific use. Individual exercise settings are the main routine flow.' },
}

function Sheet({ score, large = false }: { score: Score; large?: boolean }) {
  if (score.exercise) return <div className="rm-no-score"><Music2 /><span>No sheet music</span></div>
  if (score.url) return score.mime === 'application/pdf'
    ? large ? <object className="rm-pdf" data={score.url} type="application/pdf" aria-label={score.title}><a href={score.url} target="_blank" rel="noreferrer">Open {score.title}</a></object> : <div className="rm-file-icon"><FileMusic /><span>PDF</span></div>
    : <img className="rm-image" src={score.url} alt={score.title} />
  return <div className="rm-file-icon"><FileMusic /><span>No file</span></div>
}

const metronomePrefs = (value: Settings) => normalizeDeskMetronome({ ...value.metronome, bpm: value.bpm })
function metronomeDescription(value: Settings) {
  const prefs = metronomePrefs(value)
  return [prefs.meter,
    getPracticeRhythmOptions(prefs.meter, prefs.pulseModeId).find(option => option.value === prefs.subdivision)?.name,
    AUDIO_PRACTICE_CLICK_SOUNDS.find(sound => sound.id === prefs.soundId)?.label,
  ].filter(Boolean).join(' · ')
}
function ToolPicker({ value, onChange, onOpenMetronome, detailed = false }: { value: Settings; onChange: (settings: Settings) => void; onOpenMetronome: () => void; detailed?: boolean }) {
  const toggle = (tool: Tool) => onChange({ ...value, tools: value.tools.includes(tool) ? value.tools.filter(t => t !== tool) : [...value.tools, tool] })
  return <div className={`rm-tools ${detailed ? 'rm-tools--detailed' : ''}`}>
    <div className="rm-tool-choices">{choices.map(({ key, name, icon: Icon }) => <button key={key} type="button" aria-pressed={value.tools.includes(key)} onClick={() => toggle(key)}><Icon /><span>{name}</span></button>)}</div>
    {value.tools.includes('metronome') && <label className="rm-setting"><span>Tempo</span><span><input aria-label="Tempo in BPM" type="number" min="20" max="300" value={value.bpm} onChange={event => { const bpm = Number(event.target.value); onChange({ ...value, bpm: Math.max(20, Math.min(300, bpm)) }) }} /> <small>BPM</small></span></label>}
    {value.tools.includes('metronome') && <button type="button" className="rm-open-metronome" onClick={onOpenMetronome}><SlidersHorizontal /><span><strong>Metronome settings</strong><small>{metronomeDescription(value)}</small></span><ChevronRight /></button>}
    {value.tools.includes('drone') && <label className="rm-setting"><span>Drone note</span><select aria-label="Drone note" value={value.drone} onChange={event => onChange({ ...value, drone: event.target.value })}>{['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'].map(n => <option key={n}>{n}</option>)}</select></label>}
    {detailed && <p className="rm-hint">Optional. You can also add tools while you practice.</p>}
  </div>
}
const summary = (settings: Settings) => settings.tools.length ? settings.tools.map(t => t === 'metronome' ? `${settings.bpm} BPM${settings.metronome ? ` · ${settings.metronome.meter}` : ''}` : t === 'drone' ? `${settings.drone} drone` : 'Pitch').join(' · ') : 'Music only'

export default function RoutineMusicConcepts() {
  const [concept, setConcept] = useState<Concept>('import')
  const [device, setDevice] = useState<'phone' | 'ipad'>('ipad')
  const [stage, setStage] = useState<Stage>('music')
  const [dark, setDark] = useState(false)
  const [scores, setScores] = useState<Score[]>([])
  const [library, setLibrary] = useState<Score[]>([])
  const [settings, setSettings] = useState<Settings>(defaults)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copyFrom, setCopyFrom] = useState<string | null>(null)
  const [copyTargets, setCopyTargets] = useState<string[]>([])
  const [name, setName] = useState('My practice')
  const [active, setActive] = useState(0)
  const [recording, setRecording] = useState(false)
  const [take, setTake] = useState(false)
  const [showExercise, setShowExercise] = useState(false)
  const [exercise, setExercise] = useState('')
  const [notice, setNotice] = useState('')
  const [complete, setComplete] = useState(false)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const editorFrame = useRef<HTMLIFrameElement>(null)
  const editorTrigger = useRef<HTMLElement | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const objectUrls = useRef<string[]>([])
  const config = concepts[concept]
  useEffect(() => { document.documentElement.classList.toggle('app-dark-mode', dark) }, [dark])
  useEffect(() => { scroll.current?.scrollTo(0, 0) }, [stage, concept])
  useEffect(() => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)), [])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3300); return () => clearTimeout(timer) }, [notice])
  useEffect(() => {
    if (!editor) return
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== editorFrame.current?.contentWindow) return
      const data = event.data
      if (!data || data.type !== 'routine-music-metronome' || data.requestId !== editor.requestId || !['save', 'cancel'].includes(data.action)) return
      if (data.action === 'save') {
        const next = normalizeDeskMetronome(data.prefs)
        const apply = (value: Settings): Settings => ({ ...value, bpm: next.bpm, metronome: next })
        if (editor.scoreId === null) {
          setSettings(apply)
          setScores(items => items.map(item => ({ ...item, settings: apply(item.settings) })))
        } else {
          setScores(items => items.map(item => item.id === editor.scoreId ? { ...item, settings: apply(item.settings) } : item))
        }
        setNotice(`Metronome saved for ${editor.title}`)
      }
      setEditor(null)
      requestAnimationFrame(() => editorTrigger.current?.focus({ preventScroll: true }))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [editor])
  const openMetronome = (score?: Score) => {
    editorTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNotice('')
    setEditor({ scoreId: score?.id ?? null, title: score?.title ?? 'this rehearsal', prefs: metronomePrefs(score?.settings ?? settings), requestId: crypto.randomUUID(), dark })
  }
  const reset = (next = concept) => { setConcept(next); setStage('music'); setScores([]); setSettings(defaults); setExpanded(null); setCopyFrom(null); setCopyTargets([]); setActive(0); setRecording(false); setTake(false); setComplete(false); setShowExercise(false); setName('My practice'); setNotice('') }
  const updateScore = (id: string, patch: Partial<Score>) => setScores(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  const selectScore = (score: Score) => setScores(items => items.some(item => item.id === score.id) ? items.filter(item => item.id !== score.id) : [...items, { ...score, settings: concept === 'shelf' ? score.settings : settings }])
  const addScores = (added: Score[]) => {
    setScores(items => [...items, ...added.filter(item => !items.some(existing => existing.id === item.id))].slice(0, 12))
    if (stage !== 'music') setStage('setup')
  }
  const chooseFiles = (files: FileList | null) => {
    if (!files?.length) return
    const accepted = Array.from(files).filter(file => file.type === 'application/pdf' || file.type.startsWith('image/'))
    const added = accepted.map((file, index) => {
      const url = URL.createObjectURL(file); objectUrls.current.push(url)
      return { id: `file-${Date.now()}-${index}`, title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), subtitle: file.name, settings, url, mime: file.type } satisfies Score
    })
    setLibrary(items => [...added, ...items]); addScores(added)
    setNotice(accepted.length === files.length ? `${added.length} ${added.length === 1 ? 'score' : 'scores'} added` : 'Choose a PDF or image file')
  }
  const setShared = (next: Settings) => { setSettings(next); setScores(items => items.map(item => ({ ...item, settings: next }))) }
  const reorder = (index: number, direction: number) => setScores(items => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next })
  const jump = (next: Stage) => {
    if (next !== 'music' && !scores.length) { setNotice('Import music or add an exercise first'); return }
    setStage(next); setActive(0); setRecording(false); setTake(false); setComplete(false)
  }
  const start = () => {
    // Remember imported exercises within this preview session.
    if (concept !== 'guided') setLibrary(items => [...scores, ...items.filter(item => !scores.some(score => score.id === item.id))])
    setStage('practice'); setActive(0); setRecording(false); setTake(false); setComplete(false)
  }
  const copySetup = () => {
    const source = scores.find(score => score.id === copyFrom)
    if (!source) return
    setScores(items => items.map(item => copyTargets.includes(item.id) ? { ...item, settings: { ...source.settings, tools: [...source.settings.tools] } } : item))
    setNotice(`Setup copied to ${copyTargets.length} ${copyTargets.length === 1 ? 'exercise' : 'exercises'}`)
    setCopyFrom(null); setCopyTargets([])
  }
  const current = scores[active]
  const addExercise = () => { if (!exercise.trim()) return; addScores([{ id: `exercise-${Date.now()}`, title: exercise.trim(), subtitle: 'Practice without a score', exercise: true, settings }]); setExercise(''); setShowExercise(false) }
  const back = () => { if (stage === 'practice') { setStage('setup'); setRecording(false); setComplete(false) } else setStage('music') }

  return <main className={`rm-review rm-review--${device}`}>
    <header className="rm-review-header"><div><span className="rm-eyebrow">BESTTAKE / ROUTINE DESIGN STUDY</span><h1>Start with the music.</h1><p>Three ways to turn your scores into a practice routine.</p></div><div className="rm-review-actions"><button className="rm-device-toggle" disabled={editor !== null} onClick={() => setDevice(value => value === 'ipad' ? 'phone' : 'ipad')}>{device === 'ipad' ? 'iPhone view' : 'iPad view'}</button><button className="rm-theme" disabled={editor !== null} aria-label={dark ? 'Use light appearance' : 'Use dark appearance'} onClick={() => setDark(value => !value)}>{dark ? <Sun /> : <Moon />}</button></div></header>
    <nav className="rm-concepts" inert={editor !== null} aria-label="Routine concepts">{(Object.keys(concepts) as Concept[]).map((key, index) => <button key={key} aria-pressed={concept === key} onClick={() => reset(key)}><span>0{index + 1}</span><strong>{concepts[key].label}</strong>{key === 'import' && <small>Recommended</small>}<ArrowRight /></button>)}</nav>
    <div className="rm-review-layout">
      <aside className="rm-explanation" inert={editor !== null}><span className="rm-eyebrow">CONCEPT 0{Object.keys(concepts).indexOf(concept) + 1}</span><h2>{config.tagline}</h2><p>{config.detail}</p>
        <ol className="rm-path">{(['music', 'setup', 'practice'] as Stage[]).map((item, index) => <li key={item}><button aria-current={stage === item ? 'step' : undefined} onClick={() => jump(item)}><span>{index + 1}</span><div><strong>{config.steps[index]}</strong><small>{stage === item ? 'Viewing now' : 'View this moment'}</small></div><ChevronRight /></button></li>)}</ol>
        <div className="rm-demo-controls"><button className="rm-reset" onClick={() => reset()}><RotateCcw /> Restart concept</button><p><b>Import music</b> to add your own PDFs or photos. This preview starts empty and only shows files you choose.</p></div>
        <div className="rm-design-note"><strong>{config.advantage}</strong><p>{config.tradeoff}</p></div>
        <p className="rm-preview-note">Design preview using your app’s shared styles. The full metronome is real and can play audio. Other playback and recording are simulated. Files and routines stay in this preview; nothing is uploaded or saved to your app.</p>
      </aside>
      <div className="rm-phone-wrap"><div className="rm-device">
        <div className="rm-status"><span>9:41</span><span className="rm-status-icons">●●● <span>▰</span></span></div>
        <section className="routine-guide rm-app" aria-label={`${config.label} preview`} inert={editor !== null}>
          <nav className="rm-app-nav"><button aria-label="Back" disabled={stage === 'music'} onClick={back}><ArrowLeft /></button><span>BESTTAKE <i /> {stage === 'practice' ? 'YOUR PRACTICE' : 'YOUR ROUTINE'}</span><button aria-label="Restart preview" onClick={() => reset()}><X /></button></nav>
          {concept === 'guided' && stage !== 'practice' && <div className="rm-step-strip"><span className={stage === 'music' ? 'is-current' : ''}>1 Music</span><i /><span className={stage === 'setup' ? 'is-current' : ''}>2 Tools</span></div>}
          <div className="rm-app-scroll" ref={scroll}>
            {stage === 'music' && concept !== 'shelf' && <>
              <header className="rm-heading"><span className="rm-overline">ROUTINE</span><h2>Choose your music.</h2><p>Select everything you want to practice, then set up each exercise.</p></header>
              {library.length === 0 && <div className="rm-import-hero"><button className="rm-primary" onClick={() => input.current?.click()}><Upload /> Import music</button><p>Choose one or more PDFs or photos.</p></div>}
              {library.length > 0 && <><div className="rm-section-title rm-library-head"><div><h3>Music library</h3><span>{scores.length} selected</span></div><button onClick={() => input.current?.click()}><Upload /> Import</button></div><div className="rm-library-list">{library.map(score => {
                const selected = scores.find(item => item.id === score.id)
                return <button key={score.id} className="rm-recent" aria-pressed={Boolean(selected)} onClick={() => selectScore(score)}><div className="rm-thumb"><Sheet score={score} /></div><span><strong>{score.title}</strong><small>{summary(selected?.settings ?? score.settings)}</small></span><span className="rm-select-check">{selected ? <Check /> : <Plus />}</span></button>
              })}</div></>}
              <button className="rm-text-button" onClick={() => { setShowExercise(true); setStage('setup') }}>Add an exercise without music</button>
            </>}
            {stage === 'music' && concept === 'shelf' && <>
              <header className="rm-heading"><span className="rm-overline">BUILD A ROUTINE</span><h2>What are you<br />playing today?</h2><p>Choose your music. Its tools come with it.</p></header>
              <button className="rm-import-row" onClick={() => input.current?.click()}><Upload /><span><strong>Import music</strong><small>Add PDFs or photos</small></span><Plus /></button>
              <div className="rm-section-title"><h3>Your music</h3><span>{scores.length} selected</span></div>
              <div className="rm-music-grid">{library.map(score => <button key={score.id} aria-pressed={scores.some(item => item.id === score.id)} onClick={() => selectScore(score)}><div className="rm-grid-cover"><Sheet score={score} /><span className="rm-select-check">{scores.some(item => item.id === score.id) ? <Check /> : <Plus />}</span></div><strong>{score.title}</strong><small>{summary(score.settings)}</small></button>)}</div>
            </>}
            {stage === 'setup' && concept !== 'guided' && <>
              <header className="rm-heading rm-heading--compact"><span className="rm-overline">ROUTINE</span><h2>Exercises</h2></header>
              <label className="rm-routine-name"><span>Routine name</span><input value={name} aria-label="Routine name" onChange={e => setName(e.target.value)} /></label>
              {concept === 'shelf' && <div className="rm-saved-note"><CircleCheck /><span>Each score’s saved tools are ready.<br /><small>Tap a score to adjust them.</small></span></div>}
              <div className="rm-section-title"><h3>Order and setup</h3><span>{scores.length} {scores.length === 1 ? 'exercise' : 'exercises'}</span></div>
              <ol className="rm-score-list">{scores.map((score, index) => <li key={score.id} className={expanded === score.id ? 'is-expanded' : ''}>
                <button className="rm-score-row" aria-expanded={expanded === score.id} onClick={() => setExpanded(expanded === score.id ? null : score.id)}><span className="rm-order">{index + 1}</span><div className="rm-thumb"><Sheet score={score} /></div><span className="rm-score-copy"><strong>{score.title}</strong><small>{summary(score.settings)}</small></span><ChevronDown /></button>
                {expanded === score.id && <div className="rm-score-details">
                  <span className="rm-exercise-tools-label">Tools</span>
                  <ToolPicker value={score.settings} onChange={next => updateScore(score.id, { settings: next })} onOpenMetronome={() => openMetronome(score)} />
                  <details className="rm-item-more"><summary>More options</summary>
                    <label className="rm-item-title">Item name<input aria-label="Item name" value={score.title} onChange={e => updateScore(score.id, { title: e.target.value })} /></label>
                    {scores.length > 1 && <button className="rm-copy-entry" onClick={() => { setCopyFrom(copyFrom === score.id ? null : score.id); setCopyTargets([]) }}>Copy setup to other exercises…</button>}
                    {copyFrom === score.id && <div className="rm-copy-targets"><p>Choose which exercises to update.</p>{scores.filter(item => item.id !== score.id).map(item => <label key={item.id}><input type="checkbox" checked={copyTargets.includes(item.id)} onChange={() => setCopyTargets(items => items.includes(item.id) ? items.filter(id => id !== item.id) : [...items, item.id])} />{item.title}</label>)}<button disabled={!copyTargets.length} onClick={copySetup}>Apply to selected</button></div>}
                    <div className="rm-item-actions"><button disabled={index === 0} aria-label={`Move ${score.title} up`} onClick={() => reorder(index, -1)}><ArrowUp /></button><button disabled={index === scores.length - 1} aria-label={`Move ${score.title} down`} onClick={() => reorder(index, 1)}><ArrowDown /></button><button className="rm-remove" onClick={() => setScores(items => items.filter(item => item.id !== score.id))}><Trash2 /> Remove</button></div>
                  </details>
                </div>}
              </li>)}</ol>
              <button className="rm-add-music" onClick={() => setStage('music')}><Plus /> Choose music</button>
              <button className="rm-text-button" onClick={() => setShowExercise(value => !value)}>Add an exercise without music</button>
              {showExercise && <form className="rm-exercise-entry" onSubmit={event => { event.preventDefault(); addExercise() }}><input autoFocus aria-label="Exercise name" placeholder="Long tones, warm-up…" value={exercise} onChange={e => setExercise(e.target.value)} /><button type="submit" disabled={!exercise.trim()} aria-label="Add exercise"><Plus /></button></form>}
            </>}
            {stage === 'setup' && concept === 'guided' && <>
              <header className="rm-heading"><span className="rm-overline">MUSIC ADDED</span><h2>What would<br />help you play?</h2><p>Choose tools once for this routine.</p></header>
              <div className="rm-chosen-strip"><div className="rm-mini-stack">{scores.filter(score => !score.exercise).slice(0, 3).map(score => <div key={score.id}><Sheet score={score} /></div>)}</div><span><strong>{scores.length} scores ready</strong><small>{scores.map(score => score.title).join(', ')}</small></span><button onClick={() => setStage('music')}>Change</button></div>
              <ToolPicker detailed value={settings} onChange={setShared} onOpenMetronome={() => openMetronome()} />
              <label className="rm-routine-name rm-name-bottom"><span>Routine name</span><input value={name} aria-label="Routine name" onChange={e => setName(e.target.value)} /></label>
              {showExercise && <form className="rm-exercise-entry" onSubmit={event => { event.preventDefault(); addExercise() }}><input autoFocus aria-label="Exercise name" placeholder="Long tones, warm-up…" value={exercise} onChange={e => setExercise(e.target.value)} /><button type="submit" disabled={!exercise.trim()} aria-label="Add exercise"><Plus /></button></form>}
            </>}
            {stage === 'practice' && current && !complete && <>
              <div className="rm-practice-heading"><span>{name || 'My practice'}</span><strong>{active + 1} of {scores.length}</strong></div>
              <div className="rm-progress-track">{scores.map((score, index) => <i key={score.id} className={index <= active ? 'is-done' : ''} />)}</div>
              <div className="rm-practice-title"><h2>{current.title}</h2><small>{current.exercise ? 'Free practice' : 'Music opens automatically'}</small></div>
              <div className="rm-practice-sheet"><Sheet score={current} large /></div>
              {current.settings.tools.length > 0 && <div className="rm-live-tools">{current.settings.tools.map(tool => <span key={tool}>{tool === 'metronome' ? <SlidersHorizontal /> : tool === 'drone' ? <Waves /> : <AudioLines />}{tool === 'metronome' ? `${current.settings.bpm} BPM` : tool === 'drone' ? `${current.settings.drone} drone` : 'Pitch graph'}</span>)}</div>}
              {take ? <div className="rm-take-result"><CircleCheck /><span>Take ready to review<small>Current Take · just now</small></span><button onClick={() => setNotice('Playback is simulated in this design preview')} aria-label="Preview take"><Play /></button></div> : <p className="rm-record-hint">{recording ? 'Recording preview…' : 'Play from your score. Record when you’re ready.'}</p>}
            </>}
            {stage === 'practice' && complete && <div className="rm-complete"><CircleCheck /><span className="rm-overline">ROUTINE FINISHED</span><h2>Practice, complete.</h2><p>{scores.length} items · {name || 'My practice'}</p><div className="rm-completed-scores">{scores.map(score => <div key={score.id}><Check />{score.title}</div>)}</div><button className="rm-primary" onClick={start}>Practice again <RotateCcw /></button><button className="rm-text-button" onClick={() => setStage('setup')}>Edit routine</button></div>}
          </div>
          {stage === 'music' && concept === 'shelf' && <footer className="rm-footer"><button disabled={!scores.length} className="rm-primary" onClick={() => setStage('setup')}>Use {scores.length || 'selected'} {scores.length === 1 ? 'score' : 'scores'} <ArrowRight /></button></footer>}
          {stage === 'music' && concept !== 'shelf' && scores.length > 0 && <footer className="rm-footer"><button className="rm-primary" onClick={() => setStage('setup')}>Continue with {scores.length} {scores.length === 1 ? 'item' : 'items'} <ArrowRight /></button></footer>}
          {stage === 'setup' && <footer className="rm-footer"><span className="rm-footer-hint">{concept === 'guided' ? 'Your scores and tools will open together.' : 'Saved automatically when you start.'}</span><button className="rm-primary" disabled={!scores.length} onClick={start}>Start routine <ArrowRight /></button></footer>}
          {stage === 'practice' && !complete && <footer className="rm-practice-footer"><button aria-label="Previous item" disabled={active === 0 || recording} onClick={() => { setActive(value => value - 1); setTake(false) }}><ChevronLeft /><span>Previous</span></button><button className="rm-record-control" aria-label={recording ? 'Stop recording preview' : 'Record preview'} onClick={() => { setRecording(value => !value); if (recording) setTake(true); else setTake(false) }}><span className={recording ? 'is-recording' : ''}>{recording ? <Pause /> : <Mic />}</span></button><button disabled={recording} onClick={() => { if (active + 1 === scores.length) setComplete(true); else { setActive(value => value + 1); setTake(false) } }}><Check /><span>{active + 1 === scores.length ? 'Finish' : 'Done · next'}</span></button></footer>}
          {notice && <div className="rm-toast" role="status">{notice}</div>}
          <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={event => { chooseFiles(event.target.files); event.target.value = '' }} />
        </section>
        {editor && <div className="rm-editor-overlay" role="dialog" aria-modal="true" aria-label={`Metronome for ${editor.title}`}>
          <div className="rm-editor-context"><span>{editor.title}</span><small>Save returns to {editor.scoreId === null ? 'your rehearsal' : 'this exercise'}</small></div>
          <iframe ref={editorFrame} title={`Full metronome · ${editor.title}`} onLoad={() => editorFrame.current?.focus()} src={`./routine-metronome-frame.html?${new URLSearchParams({ prefs: JSON.stringify(editor.prefs), request: editor.requestId, dark: editor.dark ? '1' : '0' })}`} />
        </div>}
        <div className="rm-home-indicator"><i /></div>
      </div><p className="rm-phone-caption"><span /> Click through the {device === 'ipad' ? 'iPad' : 'phone'} · preview only</p></div>
      <aside className="rm-moment-notes"><span className="rm-eyebrow">{stage === 'music' ? 'THE ENTRY' : stage === 'setup' ? 'THE SETUP' : 'THE PAYOFF'}</span><h3>{stage === 'music' ? 'Music gets the first tap.' : stage === 'setup' ? 'A ready-to-play list.' : 'The routine runs the workspace.'}</h3><p>{stage === 'music' ? 'No instrument questionnaire or exercise naming before import. The filename supplies an editable title.' : stage === 'setup' ? concept === 'guided' ? 'Three optional tools. Settings appear only when a tool is selected. Start stays within reach.' : 'Each PDF is already an item. Titles, order and tools can be adjusted without leaving the list.' : 'The score appears with its chosen tools. Done advances to the next score and its setup.'}</p><div className="rm-note-line" /><span className="rm-small-label">TRY THIS</span><p>{stage === 'music' ? concept === 'shelf' ? 'Select two covers, then use the button at the bottom.' : 'Import your PDFs or photos to see each exercise’s setup.' : stage === 'setup' ? concept === 'guided' ? 'Choose shared tools for a quick rehearsal.' : 'Change one exercise’s tempo, then start. The next exercise keeps its own settings.' : 'Tap Record, stop, then Done · next to move through the music.'}</p><div className="rm-no-analysis"><FileMusic /><p>Import supplies the document and its name. Tempo and tools are chosen by the user.</p></div></aside>
    </div>
  </main>
}
