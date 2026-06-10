import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react'
import { Check, ChevronDown, ChevronUp, Download, Pin, StickyNote, Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import type { Take, TakeUpdate } from '../types'
import { pinButtonBubbleProps } from '../utils/eventBubbling'

interface TakeCardProps {
  take: Take
  isBenchmark: boolean
  isChallenger: boolean
  thumbnailVideo?: ReactNode
  onOpenTake?: () => void
  onPinBenchmark: () => void
  onPinChallenger: () => void
  onExport?: () => void
  onUpdate: (updates: TakeUpdate) => void
  onDelete: () => void
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}

function TakeCard({
  take,
  isBenchmark,
  isChallenger,
  thumbnailVideo,
  onOpenTake,
  onPinBenchmark,
  onPinChallenger,
  onExport,
  onUpdate,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: TakeCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(take.name)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [notesDraft, setNotesDraft] = useState(take.notes)
  const notesDebounceRef = useRef<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNotesDraft(take.notes)
  }, [take.notes])

  useEffect(() => {
    return () => {
      if (notesDebounceRef.current !== null) {
        window.clearTimeout(notesDebounceRef.current)
      }
    }
  }, [])

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

  const handleOpenTakeInteraction = (
    event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>,
  ) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.stopPropagation()
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    onOpenTake?.()
  }

  const handleKeyActivate = (
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (selectionMode) {
        onToggleSelect?.()
        return
      }
      onOpenTake?.()
    }
  }

  const cardRingClass = selectionMode
    ? selected
      ? 'border-sky-500 ring-2 ring-sky-400'
      : 'border-stone-200'
    : isBenchmark
      ? 'border-amber-300 ring-1 ring-amber-200'
      : isChallenger
        ? 'border-sky-300 ring-1 ring-sky-200'
        : 'border-stone-200'

  return (
    <div
      className={`group flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${cardRingClass}`}
    >
      <div className="relative aspect-video bg-stone-900">
        {thumbnailVideo ? (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenTakeInteraction}
            onTouchEnd={handleOpenTakeInteraction}
            onKeyDown={handleKeyActivate}
            className="block h-full w-full cursor-pointer overflow-hidden select-none"
            aria-label={
              selectionMode
                ? `${selected ? 'Deselect' : 'Select'} ${take.name}`
                : `Open ${take.name} in full screen`
            }
          >
            {thumbnailVideo}
          </div>
        ) : take.thumbnailUrl ? (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenTakeInteraction}
            onTouchEnd={handleOpenTakeInteraction}
            onKeyDown={handleKeyActivate}
            className="block h-full w-full cursor-pointer select-none"
            aria-label={
              selectionMode
                ? `${selected ? 'Deselect' : 'Select'} ${take.name}`
                : `Open ${take.name} in full screen`
            }
          >
            <img
              src={take.thumbnailUrl}
              alt={take.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenTakeInteraction}
            onTouchEnd={handleOpenTakeInteraction}
            onKeyDown={handleKeyActivate}
            className="block h-full w-full cursor-pointer animate-pulse bg-stone-200 select-none"
            aria-label={
              selectionMode
                ? `${selected ? 'Deselect' : 'Select'} ${take.name}`
                : `Open ${take.name} in full screen`
            }
          />
        )}
        {selectionMode && (
          <div
            className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm ${
              selected
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-white/90 bg-black/35 text-transparent'
            }`}
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </div>
        )}
        {!selectionMode && (isBenchmark || isChallenger) && (
          <div className="absolute left-2 top-2 flex gap-1">
            {isBenchmark && (
              <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Best Take
              </span>
            )}
            {isChallenger && (
              <span className="rounded-md bg-sky-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {take.name}
              </span>
            )}
          </div>
        )}
        {!selectionMode && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Delete "${take.name}"? This cannot be undone.`)) {
                onDelete()
              }
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200/80 bg-white/90 text-stone-400 shadow-sm backdrop-blur-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            aria-label={`Delete ${take.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
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
              value={notesDraft}
              onChange={(e) => {
                const value = e.target.value
                setNotesDraft(value)
                if (notesDebounceRef.current !== null) {
                  window.clearTimeout(notesDebounceRef.current)
                }
                notesDebounceRef.current = window.setTimeout(() => {
                  notesDebounceRef.current = null
                  onUpdate({ notes: value })
                }, 400)
              }}
              placeholder="Equipment, register feel, adjustments..."
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700 outline-none ring-sky-400 placeholder:text-stone-400 focus:ring-2"
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!selectionMode && (
            <>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onPinBenchmark()
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  isBenchmark
                    ? 'border-amber-300 bg-amber-100 text-amber-800'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
                Set BestTake
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onPinChallenger()
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                  isChallenger
                    ? 'border-sky-300 bg-sky-100 text-sky-800'
                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
                Load Take
              </button>
              {onExport && (
                <button
                  type="button"
                  {...pinButtonBubbleProps()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onExport()
                  }}
                  className="flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100"
                  aria-label={`Save ${take.name} to Photos`}
                >
                  <Download className="h-3.5 w-3.5" />
                  Save Video
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(TakeCard, (previous, next) =>
  previous.take.id === next.take.id &&
  previous.take.thumbnailUrl === next.take.thumbnailUrl &&
  previous.take.name === next.take.name &&
  previous.take.notes === next.take.notes &&
  previous.take.rating === next.take.rating &&
  previous.isBenchmark === next.isBenchmark &&
  previous.isChallenger === next.isChallenger &&
  previous.selectionMode === next.selectionMode &&
  previous.selected === next.selected,
)
