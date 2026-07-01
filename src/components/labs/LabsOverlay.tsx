import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { RefObject } from 'react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import Pressable from '../ui/Pressable'
import LabsMenu from './LabsMenu'
import ScaleRushScreen from './ScaleRushScreen'

export type LabsRoute = 'menu' | 'scale-rush'

interface LabsOverlayProps {
  isOpen: boolean
  route: LabsRoute
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  onClose: () => void
  onNavigate: (route: LabsRoute) => void
  onRequestMicStream: () => void
}

export default function LabsOverlay({
  isOpen,
  route,
  streamRef,
  streamGeneration,
  tunerInstrument,
  onClose,
  onNavigate,
  onRequestMicStream,
}: LabsOverlayProps) {
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="labs-overlay"
          className="labs-overlay fixed inset-0 z-[135] flex flex-col bg-stone-50"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          role="dialog"
          aria-modal="true"
          aria-label="BestTake Labs"
        >
          {route === 'menu' && (
            <div className="absolute right-4 top-4 z-10 safe-area-top">
              <Pressable
                type="button"
                intensity="soft"
                onClick={onClose}
                aria-label="Close Labs"
                className="rounded-full border border-stone-200 bg-white p-2 text-stone-600"
              >
                <X className="h-5 w-5" />
              </Pressable>
            </div>
          )}

          {route === 'menu' ? (
            <LabsMenu onOpenScaleRush={() => onNavigate('scale-rush')} onBack={onClose} />
          ) : (
            <ScaleRushScreen
              streamRef={streamRef}
              streamGeneration={streamGeneration}
              tunerInstrument={tunerInstrument}
              onRequestMicStream={onRequestMicStream}
              onBack={() => onNavigate('menu')}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
