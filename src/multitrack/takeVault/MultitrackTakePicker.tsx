import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { AudioLines, ChevronLeft, ChevronRight, Film } from 'lucide-react'
import type { Take } from '../../types'
import { getTakeMediaType } from '../../utils/mediaType'
import { formatTime } from '../../hooks/useVideoPlayback'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import Pressable from '../../components/ui/Pressable'

export default function MultitrackTakePicker({ isOpen, takes, onClose, onSelectTake }: { isOpen: boolean; takes: Take[]; onClose: () => void; onSelectTake: (take: Take) => void }) {
  // Audio takes now render as picture tiles in multitrack, so both kinds can
  // be chosen for a box. Keep this list aligned with the actual Take Vault.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div key="mt-picker" className="fixed inset-0 z-[180] multitrack-take-picker flex flex-col bg-stone-50" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={iosSpringSnappy} style={motionGpuLayer}>
          <header className="flex items-center gap-3 border-b border-stone-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Pressable type="button" intensity="soft" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Pressable>
            <h1 className="text-lg font-semibold">Take Vault</h1>
          </header>
          <ul className="flex-1 space-y-2 overflow-y-auto p-4">
            {takes.map((take) => (
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
                    ) : getTakeMediaType(take) === 'audio' ? (
                      <AudioLines className="h-5 w-5" />
                    ) : (
                      <Film className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-stone-900">
                      {take.name || 'Untitled take'}
                    </span>
                    <span className="mt-1 block text-xs text-stone-500">
                      {getTakeMediaType(take) === 'audio' ? 'Audio' : 'Video'}{take.duration ? ` · ${formatTime(take.duration)}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-stone-400" />
                </Pressable>
              </li>
            ))}
            {takes.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center">
                <AudioLines className="mx-auto h-6 w-6 text-stone-400" />
                <p className="mt-2 text-sm font-semibold text-stone-700">No takes yet</p>
                <p className="mt-1 text-xs text-stone-500">Record a part to add it here.</p>
              </li>
            ) : null}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>, document.body)
}
