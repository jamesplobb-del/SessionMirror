import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  Check,
  Clapperboard,
  Download,
  Mic2,
  MoreHorizontal,
  Pin,
  Play,
  Trash2,
  Video,
} from 'lucide-react'
import StarRating from './StarRating'
import Pressable from './ui/Pressable'
import { useActionSheet } from '../context/ActionSheetContext'
import { triggerLightHaptic } from '../utils/haptics'
import { getTakeMediaType } from '../utils/mediaType'
import type { Take, TakeUpdate } from '../types'
import TakeCardThumbnailSkeleton from './ui/TakeCardThumbnailSkeleton'

function TakeCardThumbnailPlaceholder() {
  return (
    <div className="vault-thumb-placeholder h-full w-full">
      <Clapperboard className="h-6 w-6 text-white/30" strokeWidth={1.5} aria-hidden />
    </div>
  )
}

interface TakeCardProps {
  take: Take
  takeIndex: number
  isBenchmark: boolean
  isChallenger: boolean
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
  takeIndex,
  isBenchmark,
  isChallenger,
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [thumbnailBroken, setThumbnailBroken] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNameDraft(take.name)
  }, [take.name])

  useEffect(() => {
    setThumbnailBroken(false)
  }, [take.id, take.thumbnailUrl])

  useEffect(() => {
    if (!isEditingName) return
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [isEditingName])

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== take.name) {
      onUpdate({ name: trimmed })
    } else {
      setNameDraft(take.name)
    }
    setIsEditingName(false)
  }

  const handleActivate = () => {
    if (selectionMode) {
      triggerLightHaptic()
      onToggleSelect?.()
      return
    }
    triggerLightHaptic()
    onOpenTake?.()
  }

  const handleKeyActivate = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleActivate()
  }

  const showThumbnailImage = Boolean(take.thumbnailUrl) && !thumbnailBroken
  const showThumbnailSkeleton = !take.thumbnailUrl && !thumbnailBroken
  const mediaType = getTakeMediaType(take)
  const MediaIcon = mediaType === 'audio' ? Mic2 : Video

  const rowClass = [
    'vault-take-row interactive-native group relative',
    isBenchmark ? 'vault-take-row--benchmark' : '',
    isChallenger ? 'vault-take-row--challenger' : '',
    selectionMode && selected ? 'vault-take-row--selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const formattedDate = new Date(take.timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <article className={rowClass}>
      <div
        className="vault-take-row__thumb cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label={
          selectionMode
            ? `${selected ? 'Deselect' : 'Select'} ${take.name}`
            : `Open ${take.name}`
        }
        onClick={handleActivate}
        onKeyDown={handleKeyActivate}
      >
        {showThumbnailImage ? (
          <img
            src={take.thumbnailUrl}
            alt=""
            className="pointer-events-none h-full w-full object-cover"
            draggable={false}
            loading="lazy"
            decoding="async"
            onError={() => setThumbnailBroken(true)}
          />
        ) : showThumbnailSkeleton ? (
          <TakeCardThumbnailSkeleton />
        ) : (
          <TakeCardThumbnailPlaceholder />
        )}
        <span className="vault-take-row__take-tag">TAKE {takeIndex + 1}</span>
        {selectionMode && (
          <div
            className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              selected
                ? 'border-sky-400 bg-sky-500 text-white'
                : 'border-white/80 bg-black/40 text-transparent'
            }`}
            aria-hidden
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </div>
        )}
      </div>

      <div className="vault-take-row__body">
        <div>
          <div className="vault-take-row__title-row">
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitName()
                  if (event.key === 'Escape') {
                    setNameDraft(take.name)
                    setIsEditingName(false)
                  }
                }}
                className="vault-take-row__title-input"
                aria-label="Rename take"
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
                {take.name}
              </Pressable>
            )}
          </div>
          <p className="vault-take-row__date">{formattedDate}</p>
          <div className="vault-star-rating mt-1">
            <StarRating rating={take.rating} onChange={(rating) => onUpdate({ rating })} />
          </div>
        </div>

        <div className="vault-take-row__footer">
          <span className="vault-take-row__type">
            <MediaIcon className="h-3 w-3" aria-hidden />
            {mediaType}
          </span>
          <div className="vault-take-row__actions">
            {!selectionMode && (
              <div className="relative" ref={menuRef}>
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  className="vault-take-row__icon-btn"
                  aria-label={`More actions for ${take.name}`}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Pressable>
                {menuOpen && (
                  <div className="vault-take-row__menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onPinBenchmark()
                      }}
                    >
                      <Pin className="h-3.5 w-3.5" />
                      {isBenchmark ? 'Best Take' : 'Make Best'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        onPinChallenger()
                      }}
                    >
                      <Pin className="h-3.5 w-3.5" />
                      Load Take
                    </button>
                    {onExport && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={exportBusy}
                        onClick={() => {
                          setMenuOpen(false)
                          onExport()
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {exportBusy ? 'Saving…' : 'Save Video'}
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="vault-take-row__menu-danger"
                      onClick={() => {
                        setMenuOpen(false)
                        void (async () => {
                          const confirmed = await showConfirm({
                            message: `Delete "${take.name}"? This cannot be undone.`,
                            destructive: true,
                            confirmLabel: 'Delete',
                          })
                          if (confirmed) onDelete()
                        })()
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
            {!selectionMode && onOpenTake && (
              <Pressable
                type="button"
                intensity="icon"
                haptic="medium"
                className="vault-take-row__play-btn"
                aria-label={`Play ${take.name}`}
                onClick={handleActivate}
              >
                <Play className="h-4 w-4 fill-current" />
              </Pressable>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default memo(TakeCard, (previous, next) =>
  previous.take.id === next.take.id &&
  previous.takeIndex === next.takeIndex &&
  previous.take.thumbnailUrl === next.take.thumbnailUrl &&
  previous.take.name === next.take.name &&
  previous.take.notes === next.take.notes &&
  previous.take.rating === next.take.rating &&
  previous.take.mediaType === next.take.mediaType &&
  previous.isBenchmark === next.isBenchmark &&
  previous.isChallenger === next.isChallenger &&
  previous.selectionMode === next.selectionMode &&
  previous.selected === next.selected &&
  previous.exportBusy === next.exportBusy,
)
