import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pin, StickyNote, Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import type { Take, TakeUpdate } from '../types'

interface TakeCardProps {
  take: Take
  isBenchmark: boolean
  isChallenger: boolean
  onPinBenchmark: () => void
  onPinChallenger: () => void
  onUpdate: (updates: TakeUpdate) => void
  onDelete: () => void
}

export default function TakeCard({
  take,
  isBenchmark,
  isChallenger,
  onPinBenchmark,
  onPinChallenger,
  onUpdate,
  onDelete,
}: TakeCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(take.name)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNameDraft(take.name)
  }, [take.name])

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [isEditingName])

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== take.name) {
      onUpdate({ name: trimmed })
    } else {
      setNameDraft(take.name)
    }
    setIsEditingName(false)
  }

  return (
    <div
      className={`group flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${
        isBenchmark
          ? 'border-amber-300 ring-1 ring-amber-200'
          : isChallenger
            ? 'border-sky-300 ring-1 ring-sky-200'
            : 'border-stone-200'
      }`}
    >
      <div className="relative aspect-video bg-stone-100">
        {take.thumbnailUrl ? (
          <img
            src={take.thumbnailUrl}
            alt={take.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-stone-200" />
        )}
        {(isBenchmark || isChallenger) && (
          <div className="absolute left-2 top-2 flex gap-1">
            {isBenchmark && (
              <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Benchmark
              </span>
            )}
            {isChallenger && (
              <span className="rounded-md bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Challenger
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200/80 bg-white/90 text-stone-400 opacity-0 shadow-sm backdrop-blur-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
          aria-label={`Delete ${take.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') {
                  setNameDraft(take.name)
                  setIsEditingName(false)
                }
              }}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-sm font-medium text-stone-900 outline-none ring-sky-400 focus:ring-2"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="w-full truncate text-left text-sm font-semibold text-stone-900 transition hover:text-sky-600"
              title="Click to rename"
            >
              {take.name}
            </button>
          )}
          <p className="mt-0.5 text-[11px] text-stone-400">
            {new Date(take.timestamp).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        <StarRating rating={take.rating} onChange={(rating) => onUpdate({ rating })} />

        <div>
          <button
            type="button"
            onClick={() => setNotesExpanded((prev) => !prev)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-stone-500 transition hover:text-stone-700"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notes
            {notesExpanded ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            )}
          </button>
          {notesExpanded && (
            <textarea
              value={take.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="Equipment, register feel, adjustments..."
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700 outline-none ring-sky-400 placeholder:text-stone-400 focus:ring-2"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPinBenchmark}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
              isBenchmark
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
            Pin Benchmark
          </button>
          <button
            type="button"
            onClick={onPinChallenger}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
              isChallenger
                ? 'border-sky-300 bg-sky-100 text-sky-800'
                : 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
            Pin Challenger
          </button>
        </div>
      </div>
    </div>
  )
}
