import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Music2, Star, Trash2 } from 'lucide-react'
import Pressable from './ui/Pressable'
import type { HydratedLibraryItem } from '../utils/libraryBridge'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'

interface LibraryItemCardProps {
  item: HydratedLibraryItem
  isReference: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onSetAsReference: () => void
}

export default function LibraryItemCard({
  item,
  isReference,
  onRename,
  onDelete,
  onSetAsReference,
}: LibraryItemCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNameDraft(item.name)
  }, [item.name])

  useEffect(() => {
    if (!isEditingName) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [isEditingName])

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== item.name) {
      onRename(trimmed)
    } else {
      setNameDraft(item.name)
    }
    setIsEditingName(false)
  }

  const cardRingClass = isReference
    ? 'border-amber-300 ring-1 ring-amber-200'
    : 'border-stone-200'

  return (
    <div
      className={`group flex w-56 shrink-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${cardRingClass}`}
    >
      <div className="relative aspect-video bg-black">
        <img
          src={AUDIO_TAKE_THUMBNAIL}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/90">
          Library
        </span>
        {isReference && (
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
            Reference
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitName()
                }
                if (event.key === 'Escape') {
                  setNameDraft(item.name)
                  setIsEditingName(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-stone-200 px-1.5 py-0.5 text-sm text-stone-900 outline-none ring-sky-400 focus:ring-1"
              aria-label="Library item name"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingName(true)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-stone-900 hover:text-sky-700"
              title="Click to rename"
            >
              {item.name || 'Untitled reference'}
            </button>
          )}
        </div>

        {item.duration > 0 && (
          <p className="text-xs text-stone-400">{item.duration}s</p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5">
          {!isReference && (
            <Pressable
              type="button"
              intensity="soft"
              haptic="light"
              onClick={onSetAsReference}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
            >
              <Star className="h-3 w-3" />
              Set Reference
            </Pressable>
          )}
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            onClick={onDelete}
            className="flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] font-semibold text-red-700 hover:bg-red-100"
            aria-label={`Delete ${item.name}`}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Pressable>
        </div>
      </div>
    </div>
  )
}
