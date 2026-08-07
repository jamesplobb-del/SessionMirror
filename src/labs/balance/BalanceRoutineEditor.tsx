import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import { midiToBalanceNoteName } from './balanceMusic'
import type { BalanceCustomRoutine, BalanceInstrument, BalanceRoutineNote } from './balanceTypes'

interface BalanceRoutineEditorProps {
  instrument: BalanceInstrument
  routines: BalanceCustomRoutine[]
  selectedId: string | null
  hapticFeedback: boolean
  onSelect: (id: string) => void
  onSave: (routine: BalanceCustomRoutine) => void
  onDelete: (id: string) => void
}

function createNote(writtenMidi: number): BalanceRoutineNote {
  return { id: crypto.randomUUID(), writtenMidi }
}

export default function BalanceRoutineEditor({
  instrument,
  routines,
  selectedId,
  hapticFeedback,
  onSelect,
  onSave,
  onDelete,
}: BalanceRoutineEditorProps) {
  const selected = routines.find((routine) => routine.id === selectedId) ?? null
  const [name, setName] = useState(selected?.name ?? 'My long tones')
  const [notes, setNotes] = useState<BalanceRoutineNote[]>(
    selected?.notes ?? [createNote(Math.max(instrument.minWrittenMidi, Math.min(72, instrument.maxWrittenMidi)))],
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setNotes(selected.notes)
  }, [selected])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= notes.length || from === to) return
    setNotes((current) => {
      const next = [...current]
      const [item] = next.splice(from, 1)
      if (item) next.splice(to, 0, item)
      return next
    })
  }

  const rangeOptions = Array.from(
    { length: instrument.maxWrittenMidi - instrument.minWrittenMidi + 1 },
    (_, index) => instrument.minWrittenMidi + index,
  )
  const noteOptions = Array.from(new Set([...rangeOptions, ...notes.map((note) => note.writtenMidi)])).sort((a, b) => a - b)

  return (
    <div className="balance-routine-editor">
      {routines.length > 0 && (
        <div className="balance-routine-editor__saved" role="radiogroup" aria-label="Saved routines">
          {routines.map((routine) => (
            <Pressable
              key={routine.id}
              intensity="soft"
              hapticFeedback={hapticFeedback}
              className={routine.id === selectedId ? 'is-selected' : ''}
              onClick={() => onSelect(routine.id)}
              role="radio"
              aria-checked={routine.id === selectedId}
            >
              {routine.name} · {routine.notes.length}
            </Pressable>
          ))}
        </div>
      )}

      <label className="balance-field-label" htmlFor="balance-routine-name">Routine name</label>
      <input
        id="balance-routine-name"
        className="balance-text-input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={48}
      />

      <div className="balance-note-editor" aria-label="Custom note sequence">
        {notes.map((note, index) => (
          <div
            key={note.id}
            className="balance-note-editor__row"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              event.preventDefault()
              if (dragIndex !== null && dragIndex !== index) {
                move(dragIndex, index)
                setDragIndex(index)
              }
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <GripVertical aria-hidden />
            <select
              aria-label={`Note ${index + 1}`}
              value={note.writtenMidi}
              onChange={(event) =>
                setNotes((current) =>
                  current.map((item) =>
                    item.id === note.id ? { ...item, writtenMidi: Number(event.target.value) } : item,
                  ),
                )
              }
            >
              {noteOptions.map((midi) => <option key={midi} value={midi}>{midiToBalanceNoteName(midi)}</option>)}
            </select>
            <Pressable intensity="icon" hapticFeedback={hapticFeedback} onClick={() => move(index, index - 1)} aria-label="Move note up"><ArrowUp /></Pressable>
            <Pressable intensity="icon" hapticFeedback={hapticFeedback} onClick={() => move(index, index + 1)} aria-label="Move note down"><ArrowDown /></Pressable>
            <Pressable
              intensity="icon"
              hapticFeedback={hapticFeedback}
              onClick={() => setNotes((current) => current.filter((item) => item.id !== note.id))}
              aria-label="Remove note"
              disabled={notes.length === 1}
            ><Trash2 /></Pressable>
          </div>
        ))}
      </div>

      <p className="balance-sequence-preview">
        {notes.map((note) => midiToBalanceNoteName(note.writtenMidi)).join(' → ')}
      </p>

      <div className="balance-routine-editor__actions">
        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          onClick={() => setNotes((current) => [...current, createNote(current.at(-1)?.writtenMidi ?? 72)])}
        ><Plus /> Add a note</Pressable>
        <Pressable
          haptic="medium"
          hapticFeedback={hapticFeedback}
          onClick={() => {
            const now = Date.now()
            onSave({
              id: selected?.id ?? crypto.randomUUID(),
              name: name.trim() || 'My long tones',
              notes,
              createdAt: selected?.createdAt ?? now,
              updatedAt: now,
            })
          }}
        >Save routine</Pressable>
        {selected && (
          <Pressable intensity="soft" haptic="warning" hapticFeedback={hapticFeedback} onClick={() => onDelete(selected.id)}>
            Delete
          </Pressable>
        )}
      </div>
    </div>
  )
}
