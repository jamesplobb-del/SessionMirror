import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { BookOpen, Check, GripVertical, Plus, Trash2, X } from 'lucide-react'
import type { Project } from '../db'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import MusicScorePicker from './MusicScorePicker'
import ScoreThumbnail from './ScoreThumbnail'
import { useSortableList } from '../hooks/useSortableList'
import {
  appendSetlistScores, cloneMusicSetlist, createMusicSetlist,
  MAX_SETLIST_ENTRIES, MAX_SETLIST_NAME, reorderSetlistEntry,
  removeSetlistEntry, replaceSetlistScore, restoreSetlistEntry,
  type MusicSetlist, type MusicSetlistEntry,
} from '../utils/musicSetlists'
import '../styles/music-setlists.css'

export interface MusicSetlistEditorProps {
  setlist: MusicSetlist | null
  /** Scores with readable library attachments; unavailable references stay in the draft. */
  scores: Project[]
  onSave: (next: MusicSetlist) => void | Promise<void>
  onCancel: () => void
  /** Omit for an unsaved draft. Deletion affects only the list. */
  onDelete?: (id: string) => void | Promise<void>
  onRead: (setlist: MusicSetlist, entryId: string) => void | Promise<void>
  disabled?: boolean
}

type Picking = { kind: 'add' } | { kind: 'replace'; entryId: string } | null

export default function MusicSetlistEditor({ setlist, scores, onSave, onCancel, onDelete, onRead, disabled = false }: MusicSetlistEditorProps) {
  const [draft, setDraft] = useState(() => setlist ? cloneMusicSetlist(setlist) : createMusicSetlist())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null)
  const [picking, setPicking] = useState<Picking>(null)
  const [removed, setRemoved] = useState<{ entry: MusicSetlistEntry; index: number } | null>(null)
  const working = useRef(false)
  const scroll = useRef<HTMLDivElement>(null)
  const locked = disabled || Boolean(busy)
  // A draft that has not been saved yet has no delete handler.
  const isNew = !onDelete || !setlist
  const available = useMemo(() => new Set(scores.map(score => score.id)), [scores])
  const counts = useMemo(() => draft.entries.reduce<Record<string, number>>((all, entry) => ({ ...all, [entry.projectId]: (all[entry.projectId] ?? 0) + 1 }), {}), [draft.entries])

  const update = (next: MusicSetlist) => { setDraft(next); setDirty(true); setSaved(false); setError('') }
  const edit = (operation: (current: MusicSetlist) => MusicSetlist) => {
    try { update(operation(draft)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'This change could not be made. Please try again.') }
  }
  const sortable = useSortableList({
    ids: draft.entries.map(entry => entry.id),
    scrollRef: scroll,
    disabled: locked || Boolean(confirm),
    onMove: (from, to) => edit(current => reorderSetlistEntry(current, from, to)),
    describe: id => draft.entries.find(entry => entry.id === id)?.scoreName ?? 'Piece',
  })
  const requestClose = () => {
    if (working.current || disabled) return
    if (dirty) setConfirm('discard')
    else onCancel()
  }
  const perform = async (action: string, callback: () => void | Promise<void>) => {
    if (working.current || disabled) return
    working.current = true; setBusy(action); setSaved(false); setError('')
    try { await callback() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This action could not be completed. Your draft is still here. Please try again.') }
    finally { working.current = false; setBusy('') }
  }
  const save = (event: FormEvent) => {
    event.preventDefault()
    void perform('Saving…', async () => { await onSave(cloneMusicSetlist(draft)); setDirty(false); setSaved(true) })
  }
  const read = (entryId: string) => void perform('Opening…', async () => {
    const next = cloneMusicSetlist(draft)
    await onSave(next)
    setDirty(false)
    await onRead(next, entryId)
  })
  const remove = (entry: MusicSetlistEntry, index: number) => {
    edit(current => removeSetlistEntry(current, entry.id))
    setRemoved({ entry, index })
  }
  const undo = () => {
    if (!removed) return
    const { entry, index } = removed
    setRemoved(null)
    edit(current => restoreSetlistEntry(current, entry, index))
  }
  const scrollBack = useRef<'keep' | 'end' | null>(null)
  const savedScroll = useRef(0)
  const openPicker = (next: NonNullable<Picking>) => { savedScroll.current = scroll.current?.scrollTop ?? 0; setRemoved(null); setPicking(next) }
  const closePicker = (landing: 'keep' | 'end' = 'keep') => { scrollBack.current = landing; setPicking(null) }
  // Coming back from the picker lands where you were, or on the pieces just added.
  useLayoutEffect(() => {
    const landing = scrollBack.current
    if (picking || !landing || !scroll.current) return
    scrollBack.current = null
    scroll.current.scrollTop = landing === 'end' ? scroll.current.scrollHeight : savedScroll.current
  }, [picking])
  const replacing = picking?.kind === 'replace' ? picking.entryId : null
  const firstReadable = draft.entries.find(entry => available.has(entry.projectId))
  const full = draft.entries.length >= MAX_SETLIST_ENTRIES
  const over = draft.entries.length > MAX_SETLIST_ENTRIES

  return (
    <AnimatedBottomSheet isOpen onClose={picking ? () => closePicker() : requestClose} ariaLabel={picking ? 'Choose music' : 'Setlist editor'} elevated elevatedLight vaultTheme maxHeightClass="max-h-[min(94vh,100dvh)]">
      {picking ? <div className="music-sheet">
        <MusicScorePicker title={replacing ? 'Choose replacement' : 'Add music'} backLabel="Setlist" scores={scores}
          mode={replacing ? 'single' : 'multiple'} counts={counts} capacity={Math.max(0, MAX_SETLIST_ENTRIES - draft.entries.length)}
          confirmLabel={count => count ? `Add ${count} ${count === 1 ? 'piece' : 'pieces'}` : 'Choose music'}
          onBack={() => closePicker()}
          onPick={picked => {
            closePicker(replacing ? 'keep' : 'end')
            if (replacing) { const score = picked[0]; if (score) edit(current => replaceSetlistScore(current, replacing, score)) }
            else if (picked.length) edit(current => appendSetlistScores(current, picked))
          }} />
      </div> : <form className="music-sheet music-setlist-editor" onSubmit={save}>
        <header className="music-sheet__header">
          <h2>{isNew ? 'New setlist' : 'Setlist'}</h2>
          <button type="button" className="music-sheet__close" aria-label="Close setlist editor" disabled={locked} onClick={requestClose}><X aria-hidden /></button>
        </header>
        <div className="music-sheet__scroll" ref={scroll}>
          {error ? <p className="music-setlist-editor__error" role="alert">{error}</p> : null}
          {confirm ? <section className="music-setlist-editor__confirm" aria-label={confirm === 'delete' ? 'Delete setlist confirmation' : 'Discard changes confirmation'}>
            <strong>{confirm === 'delete' ? `Delete “${draft.name}”?` : 'Discard unsaved changes?'}</strong>
            <p>{confirm === 'delete' ? 'Only this setlist will be deleted. Your scores and annotations stay in the music library.' : 'Your saved setlist will stay as it was.'}</p>
            <div><button type="button" disabled={locked} onClick={() => setConfirm(null)}>Keep editing</button>
              <button type="button" className="music-setlist-editor__danger" disabled={locked} onClick={() => {
                if (confirm === 'discard') onCancel()
                else if (onDelete) void perform('Deleting…', () => onDelete(draft.id))
              }}>{confirm === 'delete' ? 'Delete setlist' : 'Discard changes'}</button></div>
          </section> : null}
          <fieldset disabled={locked}>
            <input className="music-setlist-editor__name" aria-label="Setlist name" value={draft.name} maxLength={MAX_SETLIST_NAME} required
              placeholder="Name your setlist" onFocus={event => { if (isNew) event.currentTarget.select() }}
              onChange={event => update({ ...draft, name: event.target.value })} />
            <div className="music-setlist-editor__meta">
              <span>{draft.entries.length} {draft.entries.length === 1 ? 'piece' : 'pieces'}</span>
              {firstReadable && <button type="submit" className="music-setlist-editor__save" disabled={!draft.name.trim() || over}><Check aria-hidden />{busy === 'Saving…' ? busy : saved ? 'Saved' : 'Save'}</button>}
            </div>
            {over ? <p className="music-setlist-editor__limit" role="status">This saved list exceeds the {MAX_SETLIST_ENTRIES}-piece limit. Remove pieces before saving.</p>
              : full ? <p className="music-setlist-editor__limit" role="status">Setlists hold up to {MAX_SETLIST_ENTRIES} pieces. Remove one to add another.</p> : null}
            {draft.entries.length > 0 && <ol className="music-setlist-editor__entries" ref={sortable.listRef} data-sorting={sortable.sorting ? '' : undefined}>
              {draft.entries.map((entry, index) => {
                const present = available.has(entry.projectId)
                return <li key={entry.id} {...sortable.itemProps(entry.id)} className={`music-setlist-editor__entry${present ? '' : ' is-missing'}`}>
                  {present
                    ? <button type="button" className="music-setlist-editor__open" aria-label={`Open ${entry.scoreName}, piece ${index + 1}`} onClick={() => read(entry.id)}>
                      <span className="music-setlist-editor__number" aria-hidden>{index + 1}</span>
                      <ScoreThumbnail projectId={entry.projectId} revision={0} />
                      <span className="music-setlist-editor__name-block"><strong>{entry.scoreName}</strong></span>
                    </button>
                    : <div className="music-setlist-editor__open music-setlist-editor__open--missing">
                      <span className="music-setlist-editor__number" aria-hidden>{index + 1}</span>
                      <ScoreThumbnail projectId={null} revision={0} />
                      <span className="music-setlist-editor__name-block"><strong>{entry.scoreName}</strong><small>Not in your library</small></span>
                      <button type="button" className="music-setlist-editor__replace" onClick={() => openPicker({ kind: 'replace', entryId: entry.id })}>Replace</button>
                    </div>}
                  <button type="button" className="music-setlist-editor__remove" aria-label={`Remove ${entry.scoreName} from setlist`} onClick={() => remove(entry, index)}><Trash2 aria-hidden /></button>
                  <span className="music-setlist-editor__grip" {...sortable.handleProps(entry.id, entry.scoreName)}><GripVertical aria-hidden /></span>
                </li>
              })}
            </ol>}
            {removed && <p className="music-setlist-editor__undo" role="status"><span>Removed “{removed.entry.scoreName}”</span><button type="button" onClick={undo}>Undo</button></p>}
            <button type="button" className="music-setlist-editor__add" disabled={full || scores.length === 0}
              onClick={() => openPicker({ kind: 'add' })}>
              <span aria-hidden><Plus /></span>{scores.length === 0 ? 'Import music in the library first' : 'Add music'}
            </button>
            {sortable.liveRegion}
          </fieldset>
        </div>
        <footer className="music-sheet__footer">
          {onDelete && setlist ? <button type="button" className="music-setlist-editor__delete" disabled={locked} onClick={() => setConfirm('delete')}><Trash2 aria-hidden /><span>Delete</span></button> : <span />}
          <div className="music-sheet__footer-end">
            {saved && !firstReadable ? <span className="music-setlist-editor__saved" role="status"><Check aria-hidden />Saved</span> : null}
            {firstReadable
              ? <button type="button" className="music-sheet__primary" disabled={locked || !draft.name.trim() || over} onClick={() => read(firstReadable.id)}>{busy === 'Opening…' ? busy : <><BookOpen aria-hidden />Start</>}</button>
              : <button type="submit" className="music-sheet__primary" disabled={locked || !draft.name.trim() || over}>{busy || 'Save'}</button>}
          </div>
        </footer>
      </form>}
    </AnimatedBottomSheet>
  )
}
