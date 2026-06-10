import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { iosFade, iosSpringSheet } from '../../utils/motionPresets'

interface AnimatedBottomSheetProps {
  isOpen: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
  maxHeightClass?: string
  sheetRef?: RefObject<HTMLDivElement | null>
}

export default function AnimatedBottomSheet({
  isOpen,
  onClose,
  ariaLabel,
  children,
  maxHeightClass = 'max-h-[min(88vh,100dvh)]',
  sheetRef,
}: AnimatedBottomSheetProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/50 touch-none"
            aria-label={`Close ${ariaLabel}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={iosFade}
            onClick={onClose}
          />

          <motion.div
            ref={sheetRef}
            className={`fixed inset-x-0 bottom-0 z-50 flex ${maxHeightClass} flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl`}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={iosSpringSheet}
          >
            <div
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-stone-300/90"
              aria-hidden
            />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
