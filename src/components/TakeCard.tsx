import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, Clapperboard, Download, Pin, StickyNote, Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import type { Take, TakeUpdate } from '../types'
import { pinButtonBubbleProps } from '../utils/eventBubbling'

function TakeCardThumbnailPlaceholder() {
  return (
    <div className="vault-thumb-placeholder h-full w-full">
      <Clapperboard className="h-8 w-8 text-white/30" strokeWidth={1.5} aria-hidden />
    </div>
  )
}

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
  exportBusy?: boolean
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
  exportBusy = false,
}: TakeCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(take.name)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [notesDraft, setNotesDraft] = useState(take.notes)
  const [thumbnailBroken, setThumbnailBroken] = useState(false)
  const notesDebounceRef = useRef<number | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const tapStartRef = useRef<{ x: number; y: number } | null>(null)

  const TAP_SLOP_PX = 14

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
    setThumbnailBroken(false)
  }, [take.id, take.thumbnailUrl])

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

  const handleThumbPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    tapStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handleThumbPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const start = tapStartRef.current
    tapStartRef.current = null
    if (!start) return

    const dx = Math.abs(event.clientX - start.x)
    const dy = Math.abs(event.clientY - start.y)
    if (dx > TAP_SLOP_PX || dy > TAP_SLOP_PX) return

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

  const thumbActivateProps = {
    role: 'button' as const,
    tabIndex: 0,
    onPointerDown: handleThumbPointerDown,
    onPointerUp: handleThumbPointerUp,
    onKeyDown: handleKeyActivate,
    className: 'block h-full w-full cursor-pointer select-none touch-pan-x',
  }

  const thumbAriaLabel =
    selectionMode
      ? `${selected ? 'Deselect' : 'Select'} ${take.name}`
      : `Open ${take.name} in full screen`

  const cardRingClass = selectionMode
    ? selected
      ? 'border-amber-500 ring-2 ring-amber-500/40'
      : 'border-white/10'
    : isBenchmark
      ? 'border-amber-500/50 ring-1 ring-amber-500/30'
      : isChallenger
        ? 'border-white/15 ring-1 ring-white/10'
        : 'border-white/10'

  const showThumbnailImage = Boolean(take.thumbnailUrl) && !thumbnailBroken

  return (
    <div
      className={`group flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-[#121212] transition hover:border-white/15 ${cardRingClass}`}
    >
      <div className="relative aspect-video bg-stone-900">
        {thumbnailVideo ? (
          <div
            {...thumbActivateProps}
            className={`${thumbActivateProps.className} overflow-hidden`}
            aria-label={thumbAriaLabel}
          >
            {thumbnailVideo}
          </div>
        ) : showThumbnailImage ? (
          <div
            {...thumbActivateProps}
            aria-label={thumbAriaLabel}
          >
            <img
              src={take.thumbnailUrl}
              alt={take.name}
              className="h-full w-full object-cover pointer-events-none"
              draggable={false}
              loading="lazy"
              decoding="async"
              onError={() => setThumbnailBroken(true)}
            />
          </div>
        ) : (
          <div
            {...thumbActivateProps}
            className={`${thumbActivateProps.className} overflow-hidden`}
            aria-label={thumbAriaLabel}
          >
            <TakeCardThumbnailPlaceholder />
          </div>
        )}
        {selectionMode && (
          <div
            className={`absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm ${
              selected
                ? 'border-amber-500 bg-amber-500/90 text-gray-100'
                : 'border-white/20 bg-black/40 text-transparent'
            }`}
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </div>
        )}
        {!selectionMode && (isBenchmark || isChallenger) && (
          <div className="absolute left-2 top-2 flex gap-1">
            {isBenchmark && (
              <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-100">
                Best Take
              </span>
            )}
            {isChallenger && (
              <span className="rounded-full border border-white/15 bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-200 backdrop-blur-md">
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
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-gray-500 backdrop-blur-md transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
            aria-label={`Delete ${take.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 p-6">
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
              className="w-full rounded-xl border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm font-medium text-gray-100 outline-none ring-amber-500/40 focus:ring-2"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="w-full truncate text-left text-sm font-semibold text-gray-100 transition hover:text-amber-400"
              title="Click to rename"
            >
              {take.name}
            </button>
          )}
          <p className="mt-0.5 text-[11px] text-gray-500">
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
            className="flex w-full items-center gap-1.5 text-xs font-medium text-gray-500 transition hover:text-gray-300"
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
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-xs leading-relaxed text-gray-300 outline-none ring-amber-500/40 placeholder:text-gray-600 focus:ring-2"
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
                className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-xs font-medium transition ${
                  isBenchmark
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-amber-500/25 bg-amber-500/10 text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/15'
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
                className={`flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-xs font-medium transition ${
                  isChallenger
                    ? 'border-white/20 bg-white/10 text-gray-100'
                    : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:bg-white/10'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
                Load Take
              </button>
              {onExport && (
                <button
                  type="button"
                  disabled={exportBusy}
                  {...pinButtonBubbleProps()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onExport()
                  }}
                  className="flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-2.5 text-xs font-medium text-gray-400 transition hover:border-white/15 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                  aria-label={`Save ${take.name} to Photos`}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy ? 'Saving…' : 'Save Video'}
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
  previous.selected === next.selected &&
  previous.exportBusy === next.exportBusy,
)
