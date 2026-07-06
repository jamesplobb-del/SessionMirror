import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Music2, Star, Trash2 } from 'lucide-react'
import Pressable from './ui/Pressable'
import { useActionSheet } from '../context/ActionSheetContext'
import type { HydratedLibraryItem } from '../utils/libraryBridge'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'

interface LibraryItemCardProps {
  item: HydratedLibraryItem
  itemIndex: number
  isReference: boolean
  onRename: (name: string) => void
  onDelete: () => void
  onSetAsReference: () => void
}

export default function LibraryItemCard({
  item,
  itemIndex,
  isReference,
  onRename,
  onDelete,
  onSetAsReference,
}: LibraryItemCardProps) {
  const { showConfirm } = useActionSheet()
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

  const rowClass = [
    'vault-take-row interactive-native group relative',
    isReference ? 'vault-take-row--benchmark' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleDelete = () => {
    void (async () => {
      const confirmed = await showConfirm({
        message: `Delete "${item.name || 'Untitled reference'}"? This cannot be undone.`,
        destructive: true,
        confirmLabel: 'Delete',
      })
      if (confirmed) onDelete()
    })()
  }

  return (
    <article className={rowClass}>
      <div className="vault-take-row__thumb">
        <img
          src={AUDIO_TAKE_THUMBNAIL}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
        <span className="vault-take-row__take-tag">REF {itemIndex + 1}</span>
      </div>

      <div className="vault-take-row__body">
        <div>
          <div className="vault-take-row__title-row">
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
                className="vault-take-row__title-input"
                aria-label="Library item name"
              />
            ) : (
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                onClick={() => setIsEditingName(true)}
                className="vault-take-row__title min-w-0 flex-1 truncate text-left"
                title="Click to rename"
              >
                {item.name || 'Untitled reference'}
              </Pressable>
            )}
          </div>
          {item.duration > 0 && (
            <p className="vault-take-row__date">{item.duration}s</p>
          )}
        </div>

        <div className="vault-take-row__footer">
          <span className="vault-take-row__type">
            <Music2 className="h-3 w-3" aria-hidden />
            audio
          </span>
          <div className="vault-take-row__actions">
            {!isReference && (
              <Pressable
                type="button"
                intensity="soft"
                haptic="light"
                onClick={onSetAsReference}
                className="vault-take-row__icon-btn !w-auto px-2 text-[0.62rem] font-semibold"
              >
                <Star className="h-3 w-3" />
                Set Ref
              </Pressable>
            )}
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              onClick={handleDelete}
              className="vault-take-row__icon-btn text-red-300"
              aria-label={`Delete ${item.name || 'untitled reference'}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Pressable>
          </div>
        </div>
      </div>
    </article>
  )
}
