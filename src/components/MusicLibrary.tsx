import { usePlus } from '../plus/usePlus'
import { PlusLocked } from '../plus/PlusPaywall'
import { requirePlus, showPlus } from '../plus/plusAccess'
import PremiumDisclosure from './ui/PremiumDisclosure'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, File, Folder, FolderPlus, GripVertical, ListChecks, ListMusic, LockKeyhole, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import type { Project } from '../db'
import { exportPracticeChart, deletePracticeChart, hasPracticeChart, practiceChartName, savePracticeChart, PRACTICE_CHART_CHANGED } from '../utils/practiceChartStorage'
import { createMusicExercise, musicExerciseTitle, prepareRoutineMusicFile } from '../utils/routineMusic'
import { clearMusicScoreSettings, loadMusicOrder, loadMusicOrganization, loadMusicScoreSettings, loadMusicSetup, orderMusic, saveMusicOrder, saveMusicOrganization, saveMusicScoreSettings, saveMusicSetup, type MusicOrganization } from '../utils/musicLibrary'
import { loadExerciseLibrary } from '../utils/routineLibrary'
import { selectPracticeReference } from '../utils/practiceReferences'
import { blankDesk, MAX_ROUTINE_STEPS, type RoutineStep } from '../utils/practiceRoutines'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import { getWrittenPitchLabel } from '../utils/tunerTransposition'
import MusicToolSetup from './MusicToolSetup'
import RoutineProgramSetup from './RoutineProgramSetup'
import ScoreThumbnail from './ScoreThumbnail'
import { clearInkStrokes } from './practiceChart/chartInk'
import MusicSetlistEditor from './MusicSetlistEditor'
import { createMusicSetlist, deleteMusicSetlist, loadMusicSetlists, saveMusicSetlist, type MusicSetlist } from '../utils/musicSetlists'
import '../styles/music-library.css'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  instrumentId: string | null
  revision: number
  disabled: boolean
  onCreateItem: (name: string) => Promise<string>
  onOpen: (projectId: string) => Promise<void>
  onRename: (projectId: string, name: string) => Promise<void>
  onImported: () => void
  onCreateRoutine: (steps: RoutineStep[]) => void
  onReadSetlist: (setlist: MusicSetlist, entryId: string) => Promise<void>
  onOpenTools?: () => void
}
type DragKind = 'score' | 'folder'
type DragGesture = { kind: DragKind; id: string; startX: number; startY: number; active: boolean }
type DragPreview = { kind: DragKind; id: string; x: number; y: number; target: string | null }

function setupLabel(id: string): string {
  const setup = loadMusicSetup(id)
  const scoreSettings = loadMusicScoreSettings(id)
  if (!setup && !scoreSettings) return 'Music only'
  const parts: string[] = []
  if (setup?.showMetronome) parts.push(`${normalizeDeskMetronome(setup.metronome).bpm} BPM`)
  if (setup?.showDrone && setup.drone.pitchClass !== null) parts.push(`${getWrittenPitchLabel(setup.drone.pitchClass, setup.drone.octave, 'concert').label} drone`)
  if (setup?.pitchTrackerEnabled) parts.push('Pitch')
  if (setup?.autoSoundRecording) parts.push('Hands-free')
  if (scoreSettings?.referenceVideoId || scoreSettings?.referenceAudio) parts.push('Reference')
  if (scoreSettings?.programId) parts.push('Program')
  return parts.join(' · ') || 'Music only'
}

/** Folders organize the library; a score's recordings stay in its practice item. */
export default function MusicLibrary({ projects, activeProjectId, instrumentId, revision, disabled, onCreateItem, onOpen, onRename, onImported, onCreateRoutine, onReadSetlist, onOpenTools }: Props) {
  const plus = usePlus()
  const input = useRef<HTMLInputElement>(null)
  const scroll = useRef<HTMLElement>(null)
  const working = useRef(false)
  const gesture = useRef<DragGesture | null>(null)
  const [order, setOrder] = useState(loadMusicOrder)
  const [organization, setOrganization] = useState(loadMusicOrganization)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<'new' | 'rename' | null>(null)
  const [folderName, setFolderName] = useState('')
  const [removeFolder, setRemoveFolder] = useState(false)
  const [query, setQuery] = useState('')
  const [setupId, setSetupId] = useState<string | null>(null)
  const [, refreshSetup] = useState(0)
  const [drag, setDrag] = useState<DragPreview | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [chartRevision, setChartRevision] = useState(0)
  const [setlists, setSetlists] = useState(loadMusicSetlists)
  const [setlistDraft, setSetlistDraft] = useState<MusicSetlist | null>(null)
  useEffect(() => {
    const refresh = () => setChartRevision(current => current + 1)
    window.addEventListener(PRACTICE_CHART_CHANGED, refresh)
    return () => window.removeEventListener(PRACTICE_CHART_CHANGED, refresh)
  }, [])
  const music = useMemo(() => orderMusic(projects.filter(item => hasPracticeChart(item.id)), order), [projects, order, revision, chartRevision])
  const selectedFolder = organization.folders.find(folder => folder.id === folderId) ?? null
  const searching = Boolean(query.trim())
  const visible = music.filter(item => ((selectedFolder ? (organization.placements[item.id] ?? null) === folderId : searching || !organization.placements[item.id]))
    && `${item.name} ${practiceChartName(item.id) ?? ''}`.toLowerCase().includes(query.toLowerCase().trim()))
  // Selection keeps the order the scores were tapped in; that order seeds a routine or setlist.
  const selectedMusic = selectedIds.map(id => music.find(item => item.id === id)).filter((item): item is Project => Boolean(item))
  const selectedCount = selectedMusic.length
  const allSelected = music.length > 0 && selectedCount === music.length

  const scoreStep = (item: Project): RoutineStep => {
    const fromExercise = loadExerciseLibrary().find(entry => entry.step.projectId === item.id)?.step
    const metadata = loadMusicScoreSettings(item.id)
    const base = createMusicExercise(practiceChartName(item.id) ?? item.name, item.id)
    return { ...base, title: item.name, desk: loadMusicSetup(item.id) ?? base.desk,
      referenceQuery: metadata ? metadata.referenceQuery : fromExercise?.referenceQuery ?? '',
      referenceVideoId: metadata ? metadata.referenceVideoId : fromExercise?.referenceVideoId ?? null,
      referenceAudio: metadata ? metadata.referenceAudio ?? null : fromExercise?.referenceAudio ?? null,
      programId: metadata ? metadata.programId : fromExercise?.programId ?? null }
  }
  const updateScoreSetup = (item: Project, patch: Partial<RoutineStep>) => {
    if (!requirePlus('music')) return
    const next = { ...scoreStep(item), ...patch }
    try {
      saveMusicScoreSettings(item.id, { referenceQuery: next.referenceQuery,
        referenceVideoId: next.referenceVideoId, referenceAudio: next.referenceAudio, programId: next.programId })
      if ('referenceAudio' in patch || 'referenceVideoId' in patch) {
        localStorage.removeItem(`besttake.reference-audio.${item.id}`)
        selectPracticeReference(item.id, null)
      }
      saveMusicSetup(item.id, next.desk ?? blankDesk('audio'))
      refreshSetup(value => value + 1)
      setError('')
    } catch { setError('Could not save these score settings. Please try again.') }
  }

  const createSelectedRoutine = () => {
    if (working.current || disabled) return
    const selected = selectedMusic
    if (!selected.length) return
    if (selected.length > MAX_ROUTINE_STEPS) {
      setError(`Select up to ${MAX_ROUTINE_STEPS} scores for one routine.`)
      return
    }
    if (!requirePlus('music', createSelectedRoutine)) return
    try {
      onCreateRoutine(selected.map(scoreStep))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this routine. Your selection is still here; please try again.')
    }
  }

  const createSelectedSetlist = () => {
    if (working.current || disabled) return
    const selected = selectedMusic
    if (!selected.length || !requirePlus('music', createSelectedSetlist)) return
    try { setSetlistDraft(createMusicSetlist(selected)); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this setlist. Your selection is still here.') }
  }
  const saveSetlist = (next: MusicSetlist) => {
    saveMusicSetlist(next)
    setSetlists(loadMusicSetlists())
    // The selection did its job; leave select mode so the saved list shows on return.
    setSelecting(false)
    setSelectedIds([])
  }

  const persist = (next: MusicOrganization, nextOrder = order) => {
    try {
      saveMusicOrganization(next)
      saveMusicOrder(nextOrder)
      setOrganization(next)
      setOrder(nextOrder)
      setError('')
    } catch { setError('Could not save your music layout. Please try again.') }
  }
  const importFiles = async (files: File[]) => {
    if (!requirePlus('music')) return
    if (!files.length || working.current || disabled) return
    working.current = true
    setError('')
    const failures: string[] = []
    const added: string[] = []
    try {
      for (const [index, source] of files.entries()) {
        setBusy(`Importing ${index + 1} of ${files.length}…`)
        try {
          const file = await prepareRoutineMusicFile(source)
          const id = await onCreateItem(musicExerciseTitle(file.name))
          await savePracticeChart(id, file)
          added.push(id)
        } catch (cause) { failures.push(`${source.name}: ${cause instanceof Error ? cause.message : 'Could not import this file.'}`) }
      }
      if (added.length) {
        const placements = { ...organization.placements }
        if (selectedFolder) added.forEach(id => { placements[id] = selectedFolder.id })
        persist({ ...organization, placements }, [...music.map(item => item.id), ...added])
        setQuery('')
        onImported()
      }
      if (failures.length) setError(failures.join('\n'))
    } finally { working.current = false; setBusy('') }
  }
  const open = async (id: string) => {
    if (!requirePlus('music', () => { void open(id) })) return
    if (working.current || disabled) return
    working.current = true; setBusy('Opening music…'); setError('')
    try { await onOpen(id) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this music. Try again.') }
    finally { working.current = false; setBusy('') }
  }
  const confirmDelete = async () => {
    if (!deleteIds || working.current || disabled) return
    const targets = deleteIds.filter(id => music.some(item => item.id === id))
    if (!targets.length) { setDeleteIds(null); return }
    working.current = true
    setError('')
    const deleted: string[] = []
    const failed: string[] = []
    try {
      for (const [index, id] of targets.entries()) {
        setBusy(`Deleting ${index + 1} of ${targets.length}…`)
        try {
          await deletePracticeChart(id)
          deleted.push(id)
          clearInkStrokes(id)
          try { clearMusicScoreSettings(id) }
          catch { /* The file is gone; stale setup can be cleared on the next attempt. */ }
        } catch { failed.push(music.find(item => item.id === id)?.name ?? 'A score') }
      }
      if (deleted.length) {
        const removed = new Set(deleted)
        const placements = { ...organization.placements }
        deleted.forEach(id => { delete placements[id] })
        try {
          saveMusicOrganization({ ...organization, placements })
          saveMusicOrder(order.filter(id => !removed.has(id)))
          setOrganization({ ...organization, placements })
          setOrder(current => current.filter(id => !removed.has(id)))
        } catch { setError('Music was deleted, but its library layout could not be saved.') }
        setSelectedIds(current => current.filter(id => !removed.has(id)))
        if (setupId && removed.has(setupId)) setSetupId(null)
        onImported()
      }
      if (failed.length) setError(`Could not delete ${failed.join(', ')}. Please try again.`)
      else setSelecting(false)
    } finally {
      setDeleteIds(null)
      setBusy('')
      working.current = false
    }
  }
  const saveFolder = (event: FormEvent) => {
    event.preventDefault()
    const name = folderName.trim().slice(0, 60)
    if (!name) return
    if (editingFolder === 'new') {
      const id = crypto.randomUUID()
      persist({ ...organization, folders: [...organization.folders, { id, name }] })
      setFolderId(id)
    } else if (selectedFolder) {
      persist({ ...organization, folders: organization.folders.map(folder => folder.id === selectedFolder.id ? { ...folder, name } : folder) })
    }
    setEditingFolder(null)
    setFolderName('')
  }
  const removeCurrentFolder = () => {
    if (!selectedFolder) return
    const placements = { ...organization.placements }
    for (const [scoreId, assigned] of Object.entries(placements)) if (assigned === selectedFolder.id) delete placements[scoreId]
    persist({ folders: organization.folders.filter(folder => folder.id !== selectedFolder.id), placements })
    setFolderId(null)
    setRemoveFolder(false)
  }
  const dropItem = (kind: DragKind, id: string, target: string | null, clientX: number, clientY: number) => {
    if (!target || disabled || busy) return
    if (kind === 'folder') {
      if (!target.startsWith('folder:')) return
      const targetId = target.slice(7)
      if (id === targetId) return
      const folders = organization.folders.filter(folder => folder.id !== id)
      const before = folders.findIndex(folder => folder.id === targetId)
      const source = organization.folders.find(folder => folder.id === id)
      if (before < 0 || !source) return
      folders.splice(before, 0, source)
      persist({ ...organization, folders })
      return
    }
    if (target === `score:${id}`) return
    const targetScore = target.startsWith('score:') ? target.slice(6) : null
    const destination = target.startsWith('folder:') ? target.slice(7)
      : targetScore ? organization.placements[targetScore] ?? null
      : target === 'root' ? null : undefined
    if (destination === undefined) return
    const placements = { ...organization.placements }
    if (destination) placements[id] = destination
    else delete placements[id]
    const ids = music.map(item => item.id).filter(scoreId => scoreId !== id)
    const before = targetScore ? ids.indexOf(targetScore) : -1
    const siblings = ids.filter(scoreId => (placements[scoreId] ?? null) === destination)
    const lastSibling = siblings.at(-1)
    const targetRow = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-music-drop]')
    const after = targetRow ? clientY > targetRow.getBoundingClientRect().top + targetRow.getBoundingClientRect().height / 2 : false
    const insert = before >= 0 ? before + (after ? 1 : 0) : lastSibling ? ids.indexOf(lastSibling) + 1 : ids.length
    ids.splice(insert, 0, id)
    persist({ ...organization, placements }, ids)
  }
  const targetAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-music-drop]')?.dataset.musicDrop ?? null
  const startDrag = (event: PointerEvent<HTMLButtonElement>, kind: DragKind, id: string) => {
    if (event.button !== 0 || disabled || busy || searching || selecting) return
    event.preventDefault()
    gesture.current = { kind, id, startX: event.clientX, startY: event.clientY, active: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current) return
    if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 7) return
    current.active = true
    event.preventDefault()
    const bounds = scroll.current?.getBoundingClientRect()
    if (bounds && event.clientY < bounds.top + 60) scroll.current?.scrollBy(0, -18)
    else if (bounds && event.clientY > bounds.bottom - 60) scroll.current?.scrollBy(0, 18)
    setDrag({ kind: current.kind, id: current.id, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY) })
  }
  const endDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const current = gesture.current
    if (!current) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancelled && current.active) dropItem(current.kind, current.id, targetAt(event.clientX, event.clientY), event.clientX, event.clientY)
    setDrag(null)
  }
  const dragHandle = (kind: DragKind, id: string, name: string) => <button type="button" className="music-library__drag-handle"
    aria-label={`Move ${name}`} title="Drag to move; arrow keys to reorder" disabled={disabled || Boolean(busy) || searching || selecting}
    onPointerDown={event => startDrag(event, kind, id)} onPointerMove={moveDrag}
    onPointerUp={event => endDrag(event)} onPointerCancel={event => endDrag(event, true)}
    onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      const delta = event.key === 'ArrowUp' ? -1 : 1
      if (kind === 'folder') {
        const index = organization.folders.findIndex(folder => folder.id === id), next = index + delta
        if (next < 0 || next >= organization.folders.length) return
        const folders = [...organization.folders]
        ;[folders[index], folders[next]] = [folders[next], folders[index]]
        persist({ ...organization, folders })
      } else {
        const siblings = visible.map(score => score.id)
        const index = siblings.indexOf(id), next = index + delta
        if (next < 0 || next >= siblings.length) return
        const ids = music.map(score => score.id)
        const first = ids.indexOf(id), second = ids.indexOf(siblings[next])
        ;[ids[first], ids[second]] = [ids[second], ids[first]]
        persist(organization, ids)
      }
    }}><GripVertical aria-hidden /></button>

  if (setlistDraft) return <MusicSetlistEditor key={setlistDraft.id}
    setlist={setlistDraft} scores={music} disabled={disabled || Boolean(busy)}
    onSave={saveSetlist} onCancel={() => setSetlistDraft(null)}
    onDelete={setlists.some(list => list.id === setlistDraft.id) ? id => {
      deleteMusicSetlist(id); setSetlists(loadMusicSetlists()); setSetlistDraft(null)
    } : undefined}
    onRead={async (list, entryId) => {
      if (!requirePlus('music')) throw new Error('Unlock Music to read this setlist. Your draft is still here.')
      await onReadSetlist(list, entryId)
      setSelecting(false)
      setSelectedIds([])
      setSetlistDraft(null)
    }} />

  return <section ref={scroll} className="music-library" aria-label="Music library">
    <header className="music-library__header">
      <div>{selectedFolder && <button type="button" className="music-library__back" data-music-drop="root" onClick={() => { setFolderId(null); setQuery(''); setEditingFolder(null); setRemoveFolder(false) }}><ArrowLeft aria-hidden /> All music</button>}<h1>{selectedFolder?.name ?? 'Music'}</h1><p>{selectedFolder ? 'Scores in this folder' : 'Your scores, ready for practice.'}</p></div>
      <div className="music-library__header-actions">{!selecting && (plus.active
        ? <>{!selectedFolder && <button type="button" className="music-library__new-folder" onClick={() => { setEditingFolder('new'); setFolderName('') }}><FolderPlus aria-hidden /> New folder</button>}<button type="button" className="music-library__import" disabled={disabled || Boolean(busy)} onClick={() => input.current?.click()}><Upload aria-hidden />Import music</button></>
        : <button type="button" className="music-library__import" disabled={!plus.ready} onClick={() => showPlus('music')}><LockKeyhole aria-hidden />{plus.ready ? 'View Plus' : 'Checking access…'}</button>)}
        {onOpenTools && <button type="button" className="music-library__tools" onClick={onOpenTools}><span>Tools</span><ArrowRight aria-hidden /></button>}</div>
    </header>
    {!selectedFolder && !selecting && <section className="music-library__setlists" aria-label="Your setlists">
      <div className="music-library__section-head"><h2>Setlists</h2>{plus.active
        ? <button type="button" disabled={disabled || Boolean(busy)} onClick={() => setSetlistDraft(createMusicSetlist([]))}><Plus aria-hidden />New setlist</button>
        : <span className="music-library__plus-tag">Plus</span>}</div>
      {setlists.length ? <ul>{setlists.map(list => <li key={list.id}><button type="button" disabled={disabled || Boolean(busy)} onClick={() => setSetlistDraft(list)}>
        <span className="music-library__setlist-icon" aria-hidden><ListMusic /></span>
        <span className="music-library__setlist-copy"><strong>{list.name}</strong><small>{list.entries.length} {list.entries.length === 1 ? 'piece' : 'pieces'}{list.entries.length ? ` · ${list.entries.slice(0, 3).map(entry => entry.scoreName).join(', ')}` : ''}</small></span>
        <ChevronRight aria-hidden /></button></li>)}</ul>
        : <p>Put pieces in playing order for a rehearsal or concert.</p>}
    </section>}
    {editingFolder && <form className="music-library__folder-form" onSubmit={saveFolder}><input autoFocus aria-label="Folder name" maxLength={60} placeholder="Folder name" value={folderName} onChange={event => setFolderName(event.target.value)} /><button type="submit" disabled={!folderName.trim()}>{editingFolder === 'new' ? 'Create' : 'Save'}</button><button type="button" aria-label="Cancel" onClick={() => setEditingFolder(null)}><X aria-hidden /></button></form>}
    {selectedFolder && !selecting && <div className="music-library__folder-actions"><button type="button" onClick={() => { setFolderName(selectedFolder.name); setEditingFolder('rename') }}><Pencil aria-hidden /> Rename</button><button type="button" onClick={() => setRemoveFolder(true)}><Trash2 aria-hidden /> Remove folder</button></div>}
    {removeFolder && selectedFolder && <div className="music-library__remove-confirm" role="alert"><span>Move this folder’s scores to All music?</span><button type="button" onClick={() => setRemoveFolder(false)}>Cancel</button><button type="button" onClick={removeCurrentFolder}>Remove folder</button></div>}
    {!selectedFolder && organization.folders.length > 0 && !searching && <div className="music-library__folders" aria-label="Music folders">{organization.folders.map(folder => <div key={folder.id} className={`music-library__folder${drag?.target === `folder:${folder.id}` ? ' music-library__drop-target' : ''}`} data-music-drop={`folder:${folder.id}`}><button type="button" className="music-library__folder-open" onClick={() => { setFolderId(folder.id); setQuery(''); setRemoveFolder(false) }}><Folder aria-hidden /><span><strong>{folder.name}</strong><small>{music.filter(item => organization.placements[item.id] === folder.id).length} scores</small></span><ChevronRight aria-hidden /></button>{!selecting && dragHandle('folder', folder.id, folder.name)}</div>)}</div>}
    {music.length > 0 && <div className="music-library__toolbar"><label className="music-library__search"><Search aria-hidden /><input type="search" aria-label="Find music" placeholder="Find music" value={query} onChange={event => setQuery(event.target.value)} /></label>{!selecting && <button type="button" disabled={Boolean(busy) || disabled} onClick={() => { setSelecting(true); setSelectedIds([]); setDeleteIds(null); setSetupId(null) }}>Select</button>}</div>}
    {selecting && music.length > 0 && <div className="music-library__selection" role="toolbar" aria-label="Selected music">
      <div className="music-library__selection-top"><span>{selectedCount ? `${selectedCount} selected` : 'Tap music to choose'}</span>
        <span className="music-library__selection-tools"><button type="button" disabled={Boolean(busy) || disabled} onClick={() => setSelectedIds(allSelected ? [] : music.map(item => item.id))}>{allSelected ? 'Deselect all' : 'Select all'}</button>
          <button type="button" className="music-library__selection-done" disabled={Boolean(busy) || disabled} onClick={() => { setSelecting(false); setSelectedIds([]); setDeleteIds(null) }}>Done</button></span></div>
      <div className="music-library__selection-actions">
        <button type="button" className="music-library__create-routine" aria-label="Create routine" disabled={!selectedCount || Boolean(busy) || disabled} onClick={createSelectedRoutine}><ListChecks aria-hidden />Routine</button>
        <button type="button" className="music-library__create-setlist" aria-label="Create setlist" disabled={!selectedCount || Boolean(busy) || disabled} onClick={createSelectedSetlist}><ListMusic aria-hidden />Setlist</button>
        <button type="button" className="music-library__delete-selected" aria-label={allSelected ? 'Delete all' : 'Delete selected'} disabled={!selectedCount || Boolean(busy) || disabled} onClick={() => setDeleteIds(selectedMusic.map(item => item.id))}><Trash2 aria-hidden /></button>
      </div>
    </div>}
    {music.length > 0 && !selecting && <div className="music-library__count">{visible.length} {visible.length === 1 ? 'score' : 'scores'}<span>Drag scores to reorder or add them to a folder</span></div>}
    {deleteIds && <div className="music-library__delete-confirm" role="alert" aria-label="Delete music"><strong>{deleteIds.length === 1 ? `Delete “${music.find(item => item.id === deleteIds[0])?.name ?? 'this score'}”?` : `Delete ${deleteIds.length} scores?`}</strong><p>The music files and markings will be removed. Recordings in these practice items will stay. Routines using this music will need a replacement score.</p><div><button type="button" disabled={Boolean(busy)} onClick={() => setDeleteIds(null)}>Cancel</button><button type="button" className="music-library__delete-confirm-action" disabled={Boolean(busy) || disabled} onClick={() => void confirmDelete()}>{deleteIds.length === music.length ? 'Delete all music' : 'Delete music'}</button></div></div>}
    {!plus.active && <PlusLocked feature="music" action={false}><p>Your saved music stays here. Open Tools to export or delete an original file.</p></PlusLocked>}
    {visible.length > 0 && <ol className="music-library__list">{visible.map(item => <li key={item.id} className={`${drag?.target === `score:${item.id}` ? 'music-library__drop-target ' : ''}${setupId === item.id ? 'music-library__score-open' : ''}${selectedIds.includes(item.id) ? ' music-library__score-selected' : ''}`} data-music-drop={`score:${item.id}`}>
      <div className="music-library__row">
        <button type="button" className="music-library__score" disabled={disabled || Boolean(busy)} aria-pressed={selecting ? selectedIds.includes(item.id) : undefined} onClick={() => selecting ? setSelectedIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id]) : void open(item.id)}>{selecting && <span className="music-library__select-mark" aria-hidden>{selectedMusic.findIndex(entry => entry.id === item.id) + 1 || ''}</span>}<ScoreThumbnail projectId={item.id} revision={revision} /><span className="music-library__copy"><strong>{item.name}</strong><small>{setupLabel(item.id)}</small></span>{!selecting && item.id === activeProjectId && <span className="music-library__current">On stand</span>}{!selecting && <ChevronRight aria-hidden />}</button>
        {!selecting && <button type="button" className="music-library__setup-toggle" aria-label={`Edit tools for ${item.name}`}
          aria-expanded={setupId === item.id} aria-controls={`music-score-setup-${item.id}`}
          disabled={disabled || Boolean(busy)} onClick={() => setSetupId(current => current === item.id ? null : item.id)}>
          <SlidersHorizontal aria-hidden /><span>Tools</span><ChevronDown aria-hidden />
        </button>}
        {!selecting && dragHandle('score', item.id, item.name)}
      </div>
      {setupId === item.id && <div className="music-library__setup-panel music-routine-item-settings" id={`music-score-setup-${item.id}`}>
        {renamingId === item.id ? <form className="music-library__score-rename" onSubmit={event => {
          event.preventDefault()
          const name = renameValue.trim()
          if (!name || working.current) return
          working.current = true
          setBusy('Renaming score…')
          void onRename(item.id, name).then(() => { setRenamingId(null); setError('') })
            .catch(() => setError('Could not rename this score. Please try again.'))
            .finally(() => { working.current = false; setBusy('') })
        }}><input autoFocus aria-label="Score name" maxLength={80} value={renameValue} onChange={event => setRenameValue(event.target.value)} /><button type="submit" disabled={!renameValue.trim() || Boolean(busy)}>Save</button><button type="button" onClick={() => setRenamingId(null)}>Cancel</button></form>
          : <button type="button" className="music-library__rename-score" onClick={() => { setRenamingId(item.id); setRenameValue(item.name) }}><Pencil aria-hidden /> Rename score</button>}
        <MusicToolSetup step={scoreStep(item)} instrumentId={instrumentId} onChange={patch => updateScoreSetup(item, patch)} ensureProject={() => Promise.resolve(item.id)} />
        <button type="button" className="music-library__rename-score" disabled={disabled || Boolean(busy)} onClick={() => {
          if (working.current) return
          working.current = true; setBusy('Preparing music file…'); setError('')
          void exportPracticeChart(item.id).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not export this music.')).finally(() => { working.current = false; setBusy('') })
        }}><Upload aria-hidden /> Export original music</button>
        <button type="button" className="music-library__remove-score" disabled={disabled || Boolean(busy)} onClick={() => setDeleteIds([item.id])}><Trash2 aria-hidden /> Delete music</button>
        <PremiumDisclosure className="music-routine-more"><summary>More options</summary>
          <label className="music-routine-check"><input type="checkbox" checked={Boolean(scoreStep(item).desk?.autoSoundRecording)}
            onChange={event => updateScoreSetup(item, { desk: { ...(scoreStep(item).desk ?? blankDesk('audio')), autoSoundRecording: event.target.checked } })} /> Hands-free recording</label>
          <RoutineProgramSetup scope="score" value={scoreStep(item).programId} onChange={programId => updateScoreSetup(item, { programId })} />
        </PremiumDisclosure>
      </div>}
    </li>)}</ol>}
    {!visible.length && (music.length || selectedFolder) && <p className="music-library__no-results">{searching ? `No music matches “${query}”.` : 'No scores here yet. Import music or drag a score into this folder.'}</p>}
    {!music.length && !selectedFolder && <div className="music-library__empty"><File aria-hidden /><h2>Bring your music.</h2><p>Import PDFs or photos. Each score keeps its tempo, tools, and recordings together.</p><span>Select several files to add them at once.</span></div>}
    {busy && <p className="music-library__status" role="status">{busy}</p>}
    {error && <p className="music-library__error" role="alert">{error}</p>}
    {drag && <div className="music-library__drag-preview" style={{ left: drag.x + 12, top: drag.y + 12 }} aria-hidden>{drag.kind === 'score' ? music.find(item => item.id === drag.id)?.name : organization.folders.find(folder => folder.id === drag.id)?.name}</div>}
    <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf" multiple hidden onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void importFiles(files) }} />
  </section>
}
