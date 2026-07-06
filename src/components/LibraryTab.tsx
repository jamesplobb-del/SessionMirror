import { useRef, type ChangeEvent } from 'react'
import { Upload } from 'lucide-react'
import LibraryItemCard from './LibraryItemCard'
import Pressable from './ui/Pressable'
import type { BenchmarkBinding } from '../types/library'
import type { HydratedLibraryItem } from '../utils/libraryBridge'

interface LibraryTabProps {
  items: HydratedLibraryItem[]
  benchmarkBinding: BenchmarkBinding | null
  onImportAudio: (file: File) => void
  onRenameItem: (itemId: string, name: string) => void
  onDeleteItem: (itemId: string) => void
  onSetAsReference: (itemId: string) => void
}

export default function LibraryTab({
  items,
  benchmarkBinding,
  onImportAudio,
  onRenameItem,
  onDeleteItem,
  onSetAsReference,
}: LibraryTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImportAudio(file)
  }

  return (
    <div>
      <div className="vault-library-intro mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Audio references</p>
          <p className="text-xs text-stone-500">
            Imported audio stays in Library — not mixed into your takes.
          </p>
        </div>
        <Pressable
          type="button"
          intensity="soft"
          haptic="light"
          onClick={() => fileInputRef.current?.click()}
          className="vault-import-btn flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm"
        >
          <Upload className="h-3.5 w-3.5" />
          Import Audio
        </Pressable>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,audio/mpeg,audio/mp4,.mp3,.m4a,.wav"
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>

      {items.length === 0 ? (
        <div className="vault-empty-state flex h-36 items-center justify-center rounded-2xl border border-dashed px-4 text-center">
          <p className="text-sm text-stone-400">
            No library audio yet. Import an MP3 or audio file.
          </p>
        </div>
      ) : (
        <div className="vault-take-list">
          {items.map((item, index) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              itemIndex={index}
              isReference={
                benchmarkBinding?.source === 'library' &&
                benchmarkBinding.refId === item.id
              }
              onRename={(name) => onRenameItem(item.id, name)}
              onDelete={() => onDeleteItem(item.id)}
              onSetAsReference={() => onSetAsReference(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
