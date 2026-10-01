import { useRef, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, Trash2, X } from 'lucide-react'
import type { Project } from '../db'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import {
  appendSetlistScore, cloneMusicSetlist, createMusicSetlist,
  MAX_SETLIST_ENTRIES, MAX_SETLIST_NAME, moveSetlistEntry,
  removeSetlistEntry, replaceSetlistScore, type MusicSetlist,
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

export default function MusicSetlistEditor({ setlist, scores, onSave, onCancel, onDelete, onRead, disabled = false }: MusicSetlistEditorProps) {
  const [draft, setDraft] = useState(() => setlist ? cloneMusicSetlist(setlist) : createMusicSetlist())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null)
  const working = useRef(false)
  const locked = disabled || Boolean(busy)
  const update = (next: MusicSetlist) => { setDraft(next); setDirty(true); setSaved(false); setError('') }
  const edit = (operation: () => MusicSetlist) => {
    try { update(operation()) } catch (cause) { setError(cause instanceof Error ? cause.message : 'This change could not be made. Please try again.') }
  }
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
  return (
    <AnimatedBottomSheet isOpen onClose={requestClose} ariaLabel="Setlist editor" elevated elevatedLight vaultTheme maxHeightClass="max-h-[min(94vh,100dvh)]">
      <form className="music-setlist-editor" onSubmit={save}>
        <header className="music-setlist-editor__header">
          <div><span>Music library</span><h2>Setlist</h2></div>
          <button type="button" aria-label="Close setlist editor" disabled={locked} onClick={requestClose}><X aria-hidden /></button>
        </header>
        <div className="music-setlist-editor__scroll">
          {saved ? <p className="music-setlist-editor__saved" role="status">Setlist saved.</p> : null}
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
            <label className="music-setlist-editor__name">Setlist name<input autoFocus value={draft.name} maxLength={MAX_SETLIST_NAME} required
              onChange={event => update({ ...draft, name: event.target.value })} placeholder="Rehearsal, concert, recital…" /></label>
            <p className="music-setlist-editor__intro">Put your music in playing order.</p>
            <div className="music-setlist-editor__count"><strong>{draft.entries.length} {draft.entries.length === 1 ? 'piece' : 'pieces'}</strong></div>
            {draft.entries.length >= MAX_SETLIST_ENTRIES ? <p className="music-setlist-editor__limit" role="status">{draft.entries.length > MAX_SETLIST_ENTRIES ? 'This saved list exceeds the entry limit. Remove entries before saving.' : 'Entry limit reached. Remove an entry to add another.'}</p> : null}
            {draft.entries.length === 0 ? <p className="music-setlist-editor__empty">Add music below to build your running order.</p> : null}
            <ol className="music-setlist-editor__entries">
              {draft.entries.map((entry, index) => {
                const available = scores.some(score => score.id === entry.projectId)
                return <li key={entry.id} className={!available ? 'is-missing' : undefined}>
                  <div className="music-setlist-editor__piece">
                    <button type="button" className="music-setlist-editor__read" aria-label={`Read entry ${index + 1}: ${entry.scoreName}`} disabled={!available} onClick={() => read(entry.id)}><span>{index + 1}</span><strong>{entry.scoreName}</strong></button>
                    <div className="music-setlist-editor__order">
                      <button type="button" aria-label={`Move entry ${index + 1} up`} disabled={index === 0} onClick={() => edit(() => moveSetlistEntry(draft, entry.id, -1))}><ArrowUp aria-hidden /></button>
                      <button type="button" aria-label={`Move entry ${index + 1} down`} disabled={index === draft.entries.length - 1} onClick={() => edit(() => moveSetlistEntry(draft, entry.id, 1))}><ArrowDown aria-hidden /></button>
                      <button type="button" className="music-setlist-editor__remove" aria-label={`Remove entry ${index + 1}: ${entry.scoreName}`} onClick={() => edit(() => removeSetlistEntry(draft, entry.id))}><Trash2 aria-hidden /></button>
                    </div>
                  </div>
                  {!available && <>
                    <p className="music-setlist-editor__missing" role="status">Score unavailable. Choose a replacement.</p>
                    <label>Library score<select value="" aria-label={`Replace score for entry ${index + 1}`} onChange={event => {
                      const score = scores.find(item => item.id === event.target.value)
                      if (score) edit(() => replaceSetlistScore(draft, entry.id, score))
                    }}><option value="">Choose a replacement…</option>{scores.map(score => <option key={score.id} value={score.id}>{score.name}</option>)}</select></label>
                  </>}
                </li>
              })}
            </ol>
            <label className="music-setlist-editor__add">Add music<select value="" aria-label="Add a score to setlist" disabled={draft.entries.length >= MAX_SETLIST_ENTRIES || scores.length === 0} onChange={event => {
              const score = scores.find(item => item.id === event.target.value)
              if (score) edit(() => appendSetlistScore(draft, score))
            }}><option value="">{scores.length ? 'Choose from the music library…' : 'Import a score in the music library first'}</option>{scores.map(score => <option key={score.id} value={score.id}>{score.name}</option>)}</select></label>
          </fieldset>
        </div>
        <footer className="music-setlist-editor__footer">
          {onDelete && setlist ? <button type="button" className="music-setlist-editor__danger" disabled={locked} onClick={() => setConfirm('delete')}><Trash2 aria-hidden /><span>Delete list</span></button> : <span />}
          <button type="button" disabled={locked} onClick={requestClose}>Cancel</button>
          <button type="submit" className="music-setlist-editor__save" disabled={locked || !draft.name.trim() || draft.entries.length > MAX_SETLIST_ENTRIES}>{busy || 'Save setlist'}</button>
        </footer>
      </form>
    </AnimatedBottomSheet>
  )
}
