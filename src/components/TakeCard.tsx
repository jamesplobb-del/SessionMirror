import { memo, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronUp, Clapperboard, Download, Pin, StickyNote, Trash2 } from 'lucide-react'
import StarRating from './StarRating'
import Pressable from './ui/Pressable'
import { useActionSheet } from '../context/ActionSheetContext'
import { triggerLightHaptic } from '../utils/haptics'
import type { Take, TakeUpdate } from '../types'
import TakeCardThumbnailSkeleton from './ui/TakeCardThumbnailSkeleton'

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
  const { showConfirm } = useActionSheet()
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
      triggerLightHaptic()
      onToggleSelect?.()
      return
    }
    triggerLightHaptic()
    onOpenTake?.()
  }

  const handleKeyActivate = (
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (selectionMode) {
        triggerLightHaptic()
        onToggleSelect?.()
        return
      }
      triggerLightHaptic()
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
      ? 'border-sky-500 ring-2 ring-sky-400'
      : 'border-stone-200'
    : isBenchmark
      ? 'border-amber-300 ring-1 ring-amber-200'
      : isChallenger
        ? 'border-sky-300 ring-1 ring-sky-200'
        : 'border-stone-200'

  const showThumbnailImage = Boolean(take.thumbnailUrl) && !thumbnailBroken
  const showThumbnailSkeleton = !take.thumbnailUrl && !thumbnailBroken

  return (
    <div
      className={`group interactive-native flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${cardRingClass}`}
    >
      <div className="relative aspect-video bg-black">
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
            {showThumbnailSkeleton ? (
              <TakeCardThumbnailSkeleton />
            ) : (
              <TakeCardThumbnailPlaceholder />
            )}
          </div>
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
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              void (async () => {
                const confirmed = await showConfirm({
                  message: `Delete "${take.name}"? This cannot be undone.`,
                  destructive: true,
                  confirmLabel: 'Delete',
                })
                if (confirmed) onDelete()
              })()
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200/80 bg-white/90 text-stone-400 shadow-sm backdrop-blur-sm hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            aria-label={`Delete ${take.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Pressable>
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
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              onClick={() => setIsEditingName(true)}
              className="w-full truncate text-left text-sm font-semibold text-stone-900 hover:text-sky-600"
              title="Click to rename"
            >
              {take.name}
            </Pressable>
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
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            onClick={() => setNotesExpanded((prev) => !prev)}
            className="flex w-full items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Notes
            {notesExpanded ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            )}
          </Pressable>
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
              <Pressable
                type="button"
                intensity="soft"
                haptic="medium"
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onPinBenchmark()
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium ${
                  isBenchmark
                    ? 'border-amber-300 bg-amber-100 text-amber-800'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
                Set BestTake
              </Pressable>
              <Pressable
                type="button"
                intensity="soft"
                haptic="medium"
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onPinChallenger()
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium ${
                  isChallenger
                    ? 'border-sky-300 bg-sky-100 text-sky-800'
                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100'
                }`}
              >
                <Pin className="h-3.5 w-3.5" />
                Load Take
              </Pressable>
              {onExport && (
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="medium"
                  disabled={exportBusy}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onExport()
                  }}
                  className="flex w-full touch-manipulation items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60"
                  aria-label={`Save ${take.name} to Photos`}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy ? 'Saving…' : 'Save Video'}
                </Pressable>
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
