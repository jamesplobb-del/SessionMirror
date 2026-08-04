import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Film } from 'lucide-react'
import type { Take } from '../../types'
import { getTakeMediaType } from '../../utils/mediaType'
import { formatTime } from '../../hooks/useVideoPlayback'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import Pressable from '../../components/ui/Pressable'

export default function MultitrackTakePicker({ isOpen, takes, onClose, onSelectTake }: { isOpen: boolean; takes: Take[]; onClose: () => void; onSelectTake: (take: Take) => void }) {
  // Performance boxes are visual tracks. Audio files belong in Backing Track;
  // allowing them here produced blank boxes and exports that skipped the track.
  const eligible = takes.filter((take) => getTakeMediaType(take) === 'video')
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div key="mt-picker" className="fixed inset-0 z-[180] flex flex-col bg-stone-50" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={iosSpringSnappy} style={motionGpuLayer}>
          <header className="flex items-center gap-3 border-b border-stone-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Pressable type="button" intensity="soft" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Pressable>
            <h1 className="text-lg font-semibold">Use existing take</h1>
          </header>
          <ul className="flex-1 space-y-2 overflow-y-auto p-4">
            {eligible.map((take) => (
              <li key={take.id}>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => onSelectTake(take)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 text-left shadow-sm"
                >
                  <span className="flex h-16 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-900 text-white">
                    {take.thumbnailUrl ? (
                      <img src={take.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Film className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-900">
                      {take.name || 'Untitled take'}
                    </span>
                    <span className="mt-1 block text-xs text-stone-500">
                      {take.duration ? formatTime(take.duration) : 'Video take'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" />
                </Pressable>
              </li>
            ))}
            {eligible.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center">
                <Film className="mx-auto h-6 w-6 text-stone-400" />
                <p className="mt-2 text-sm font-semibold text-stone-700">No video takes yet</p>
                <p className="mt-1 text-xs text-stone-500">Record a box first, or add an MP3 as a backing track.</p>
              </li>
            ) : null}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>, document.body)
}
