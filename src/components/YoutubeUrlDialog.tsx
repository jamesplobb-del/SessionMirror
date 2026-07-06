import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { X, Youtube } from 'lucide-react'
import { parseYoutubeEmbedUrl } from '../utils/youtubeEmbed'
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics'
import { nativeGlideEase, motionGpuLayer } from '../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown, NATIVE_SQUISH } from '../utils/interactiveUx'
import { requestCameraPreviewLayoutRecovery } from '../utils/viewportSync'

interface YoutubeUrlDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (embedUrl: string) => void
}

export default function YoutubeUrlDialog({ open, onClose, onSubmit }: YoutubeUrlDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportTop, setViewportTop] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const releaseInputFocus = useCallback(() => {
    inputRef.current?.blur()
  }, [])

  useEffect(() => {
    if (!open) {
      releaseInputFocus()
      setViewportHeight(null)
      setViewportTop(0)
      return
    }

    setValue('')
    setError(null)
  }, [open, releaseInputFocus])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    let frameId: number | null = null
    const updateKeyboardLayout = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        const visualViewport = window.visualViewport
        setViewportHeight(Math.round(visualViewport?.height ?? window.innerHeight))
        setViewportTop(Math.round(visualViewport?.offsetTop ?? 0))
      })
    }

    updateKeyboardLayout()
    window.addEventListener('resize', updateKeyboardLayout)
    window.addEventListener('orientationchange', updateKeyboardLayout)
    window.visualViewport?.addEventListener('resize', updateKeyboardLayout)
    window.visualViewport?.addEventListener('scroll', updateKeyboardLayout)

    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', updateKeyboardLayout)
      window.removeEventListener('orientationchange', updateKeyboardLayout)
      window.visualViewport?.removeEventListener('resize', updateKeyboardLayout)
      window.visualViewport?.removeEventListener('scroll', updateKeyboardLayout)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseInputFocus()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    let removeAppListener: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) releaseInputFocus()
      }).then((handle) => {
        removeAppListener = () => void handle.remove()
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeAppListener?.()
    }
  }, [open, releaseInputFocus])

  const handleSubmit = useCallback(() => {
    const embedUrl = parseYoutubeEmbedUrl(value)
    if (!embedUrl) {
      setError('Paste a valid YouTube link or video ID.')
      return
    }
    releaseInputFocus()
    onSubmit(embedUrl)
    onClose()
    requestCameraPreviewLayoutRecovery('youtube-submit')
  }, [onClose, onSubmit, releaseInputFocus, value])

  const handleClose = useCallback(() => {
    releaseInputFocus()
    onClose()
    requestCameraPreviewLayoutRecovery('youtube-close')
  }, [onClose, releaseInputFocus])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed left-0 right-0 z-[120] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={nativeGlideEase}
          style={{
            top: `${viewportTop}px`,
            height: viewportHeight ? `${viewportHeight}px` : '100dvh',
            padding: 16,
            boxSizing: 'border-box',
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) handleClose()
          }}
        >
          <motion.div
            className="absolute inset-0 bg-[rgba(23,26,34,0.2)] backdrop-blur-[6px]"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={nativeGlideEase}
          />
          <motion.div
            className="relative w-full max-w-sm rounded-2xl border border-[rgba(23,26,34,0.06)] bg-[#f7f8fa] p-4 shadow-[0_-18px_48px_rgba(23,26,34,0.1),0_-4px_14px_rgba(23,26,34,0.05)]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-labelledby="youtube-url-title"
            initial={nativeGlideIn}
            animate={nativeGlideShown}
            exit={nativeGlideIn}
            transition={nativeGlideEase}
            style={{
              ...motionGpuLayer,
              maxHeight: viewportHeight ? `${Math.max(280, viewportHeight - 32)}px` : undefined,
              overflowY: 'auto',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-500" />
                <h2 id="youtube-url-title" className="text-sm font-semibold text-[#171a22]">
                  YouTube Reference
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerLightHaptic()
                  handleClose()
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(23,26,34,0.08)] bg-white text-[#6c7077] ${NATIVE_SQUISH}`}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-2 text-[11px] leading-snug text-[#6c7077]">
              Paste a link here, or switch to YouTube and copy the URL — tap the field when you return.
            </p>

            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="Paste YouTube URL or video ID"
              value={value}
              onPointerDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onChange={(event) => {
                setValue(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSubmit()
                if (event.key === 'Escape') handleClose()
              }}
              className="w-full touch-manipulation rounded-lg border border-[rgba(23,26,34,0.08)] bg-white px-3 py-3 text-base text-[#171a22] placeholder:text-[#6c7077]/70 focus:border-red-500/60 focus:outline-none"
            />

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerLightHaptic()
                  handleClose()
                }}
                className={`rounded-lg px-3 py-2 text-xs font-medium text-[#6c7077] ${NATIVE_SQUISH}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerMediumHaptic()
                  handleSubmit()
                }}
                className={`rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 ${NATIVE_SQUISH}`}
              >
                Load
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
