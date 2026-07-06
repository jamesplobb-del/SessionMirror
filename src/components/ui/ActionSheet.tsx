import { AnimatePresence, motion } from 'framer-motion'
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ActionSheetTone } from '../../context/ActionSheetContext'
import { useSheetDragDismiss, readSheetSlideDistance } from '../../hooks/useSheetDragDismiss'
import { iosFade, iosSheetPremium, motionGpuLayer } from '../../utils/motionPresets'

type SheetRequest =
  | {
      kind: 'alert'
      message: string
      title?: string
      tone: ActionSheetTone
      confirmLabel: string
    }
  | {
      kind: 'confirm'
      message: string
      title?: string
      confirmLabel: string
      destructive: boolean
    }

interface ActionSheetProps {
  request: SheetRequest | null
  onCancel: () => void
  onConfirm: () => void
}

function resolvePortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    return globalThis.document?.body ?? (null as unknown as HTMLElement)
  }
  // Keep confirmations above nested drawers such as Take Vault.
  return document.body
}

export default function ActionSheet({ request, onCancel, onConfirm }: ActionSheetProps) {
  const [slideDistance, setSlideDistance] = useState(readSheetSlideDistance)

  const { sheetDragProps, dragHandleProps, backdropOpacity } = useSheetDragDismiss({
    enabled: Boolean(request),
    slideDistance,
    onDismiss: onCancel,
  })

  useLayoutEffect(() => {
    if (!request) return

    const update = () => setSlideDistance(readSheetSlideDistance())
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [request])

  if (typeof document === 'undefined') return null

  const portalRoot = resolvePortalRoot()

  return createPortal(
    <AnimatePresence>
      {request && (
        <>
          <motion.button
            type="button"
            className="action-sheet-backdrop fixed inset-0 z-[620] cursor-default touch-none bg-black/45"
            aria-label="Dismiss dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: backdropOpacity }}
            exit={{ opacity: 0 }}
            transition={iosFade}
            style={motionGpuLayer}
            onClick={onCancel}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-sheet-message"
            className="action-sheet-host fixed inset-x-0 bottom-0 z-[630] px-3"
            style={{
              ...motionGpuLayer,
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 28 }}
            transition={iosSheetPremium}
            {...sheetDragProps}
          >
            <div
              {...dragHandleProps}
              className={`${dragHandleProps.className} -mx-3 min-h-11 justify-center pb-0.5 pt-2`}
            >
              <div className="h-1 w-10 rounded-full bg-stone-300/70" />
            </div>

            <div className="overflow-hidden rounded-2xl bg-white/95 shadow-2xl backdrop-blur-xl">
              <div className="border-b border-stone-200/80 px-4 py-4 text-center">
                {request.title && (
                  <p className="text-sm font-semibold text-stone-900">{request.title}</p>
                )}
                <p
                  id="action-sheet-message"
                  className={`text-sm leading-relaxed text-stone-600 ${
                    request.title ? 'mt-1' : ''
                  }`}
                >
                  {request.message}
                </p>
              </div>

              {request.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={onConfirm}
                  className={`w-full border-b border-stone-200/80 py-3.5 text-[17px] font-semibold active:bg-stone-100 ${
                    request.destructive ? 'text-red-600' : 'text-sky-600'
                  }`}
                >
                  {request.confirmLabel}
                </button>
              )}

              {request.kind === 'alert' && (
                <button
                  type="button"
                  onClick={onConfirm}
                  className={`w-full py-3.5 text-[17px] font-semibold active:bg-stone-100 ${
                    request.tone === 'error'
                      ? 'text-red-600'
                      : request.tone === 'success'
                        ? 'text-sky-600'
                        : 'text-sky-600'
                  }`}
                >
                  {request.confirmLabel}
                </button>
              )}
            </div>

            {request.kind === 'confirm' && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-2 w-full rounded-2xl bg-white/95 py-3.5 text-[17px] font-semibold text-sky-600 shadow-2xl backdrop-blur-xl active:bg-stone-100"
              >
                Cancel
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    portalRoot,
  )
}
