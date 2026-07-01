import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ChevronLeft, Sparkles } from 'lucide-react'
import type { Take } from '../../types'
import { getTakeMediaType } from '../../utils/mediaType'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import Pressable from '../ui/Pressable'

interface CreatorStudioTakePickerProps {
  isOpen: boolean
  takes: Take[]
  onClose: () => void
  onSelectTake: (take: Take) => void
}

function formatTakeLabel(take: Take): string {
  if (take.name?.trim()) return take.name.trim()
  const date = new Date(take.timestamp)
  if (Number.isNaN(date.getTime())) return 'Untitled take'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CreatorStudioTakePicker({
  isOpen,
  takes,
  onClose,
  onSelectTake,
}: CreatorStudioTakePickerProps) {
  const videoTakes = takes.filter((take) => getTakeMediaType(take) === 'video')

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="creator-studio-picker"
          className="fixed inset-0 z-[135] flex flex-col bg-stone-50"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a take for Creator Studio"
        >
          <header className="flex items-center gap-3 border-b border-stone-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Pressable type="button" intensity="soft" onClick={onClose} aria-label="Close">
              <ChevronLeft className="h-6 w-6 text-stone-600" />
            </Pressable>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-400">
                <Sparkles className="h-3.5 w-3.5" />
                Creator Studio
              </p>
              <h1 className="text-lg font-semibold text-stone-900">Choose a video take</h1>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {videoTakes.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">
                No video takes in this project yet. Record a video take first.
              </p>
            ) : (
              <ul className="space-y-2">
                {videoTakes.map((take) => (
                  <li key={take.id}>
                    <Pressable
                      type="button"
                      intensity="soft"
                      onClick={() => onSelectTake(take)}
                      className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left"
                    >
                      <p className="text-sm font-semibold text-stone-900">{formatTakeLabel(take)}</p>
                      {take.notes?.trim() && (
                        <p className="mt-0.5 text-xs text-stone-500">{take.notes}</p>
                      )}
                    </Pressable>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
