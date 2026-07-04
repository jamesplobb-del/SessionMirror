import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import type { Take } from '../../types'
import { getTakeMediaType } from '../../utils/mediaType'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import Pressable from '../../components/ui/Pressable'

export default function MultitrackTakePicker({ isOpen, takes, onClose, onSelectTake }: { isOpen: boolean; takes: Take[]; onClose: () => void; onSelectTake: (take: Take) => void }) {
  const eligible = takes.filter((t) => { const m = getTakeMediaType(t); return m === 'video' || m === 'audio' })
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div key="mt-picker" className="fixed inset-0 z-[180] flex flex-col bg-stone-50" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={iosSpringSnappy} style={motionGpuLayer}>
          <header className="flex items-center gap-3 border-b border-stone-200 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Pressable type="button" intensity="soft" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Pressable>
            <h1 className="text-lg font-semibold">Use existing take</h1>
          </header>
          <ul className="flex-1 overflow-y-auto p-4 space-y-2">
            {eligible.map((take) => (
              <li key={take.id}><Pressable type="button" intensity="soft" onClick={() => onSelectTake(take)} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left text-sm font-semibold">{take.name || 'Untitled'}</Pressable></li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>, document.body)
}
