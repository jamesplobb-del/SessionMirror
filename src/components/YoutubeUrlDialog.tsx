import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { ClipboardPaste, X, Youtube } from 'lucide-react'
import { parseYoutubeEmbedUrl, readYoutubeUrlFromClipboard } from '../utils/youtubeEmbed'
import { setYoutubeDialogOpen } from '../utils/youtubeDialogState'
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics'
import { nativeGlideEase, motionGpuLayer } from '../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown, NATIVE_SQUISH } from '../utils/interactiveUx'
import {
  applyViewportCssVarsOnResume,
  requestCameraPreviewLayoutRecovery,
} from '../utils/viewportSync'

interface YoutubeUrlDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (embedUrl: string) => void
}

function readDialogViewport(): { height: number; top: number } {
  const visualViewport = window.visualViewport
  return {
    height: Math.round(visualViewport?.height ?? window.innerHeight),
    top: Math.round(visualViewport?.offsetTop ?? 0),
  }
}

export default function YoutubeUrlDialog({ open, onClose, onSubmit }: YoutubeUrlDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [clipboardReady, setClipboardReady] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportTop, setViewportTop] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const recoveryTimerRef = useRef<number | null>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const releaseInputFocus = useCallback(() => {
    inputRef.current?.blur()
  }, [])

  const syncDialogViewport = useCallback(() => {
    const { height, top } = readDialogViewport()
    setViewportHeight(height)
    setViewportTop(top)
  }, [])

  const tryFillFromClipboard = useCallback(async (source: 'return' | 'paste-button') => {
    const text = await readYoutubeUrlFromClipboard()
    if (!text || !openRef.current) return false
    setValue(text)
    setError(null)
    setClipboardReady(true)
    if (source === 'paste-button') {
      inputRef.current?.focus()
    }
    return true
  }, [])

  /** Layout settle after returning from YouTube — skip camera recovery until the sheet closes. */
  const recoverDialogOnReturn = useCallback(() => {
    if (!openRef.current) return

    applyViewportCssVarsOnResume()
    syncDialogViewport()
    requestAnimationFrame(() => {
      applyViewportCssVarsOnResume()
      syncDialogViewport()
    })
    window.setTimeout(() => {
      if (!openRef.current) return
      syncDialogViewport()
    }, 280)

    void tryFillFromClipboard('return')
  }, [syncDialogViewport, tryFillFromClipboard])

  const scheduleDialogRecovery = useCallback(() => {
    if (recoveryTimerRef.current !== null) {
      window.clearTimeout(recoveryTimerRef.current)
    }
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null
      recoverDialogOnReturn()
    }, 140)
  }, [recoverDialogOnReturn])

  useEffect(() => {
    setYoutubeDialogOpen(open)
    if (!open) {
      releaseInputFocus()
      setViewportHeight(null)
      setViewportTop(0)
      setClipboardReady(false)
      return
    }

    setValue('')
    setError(null)
    setClipboardReady(false)
    applyViewportCssVarsOnResume()
    syncDialogViewport()
  }, [open, releaseInputFocus, syncDialogViewport])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return

    let frameId: number | null = null
    const updateKeyboardLayout = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncDialogViewport()
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
  }, [open, syncDialogViewport])

  useEffect(() => {
    if (!open) return

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseInputFocus()
        return
      }
      scheduleDialogRecovery()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    let removeAppListener: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          releaseInputFocus()
          return
        }
        scheduleDialogRecovery()
      }).then((handle) => {
        removeAppListener = () => void handle.remove()
      })
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeAppListener?.()
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current)
        recoveryTimerRef.current = null
      }
    }
  }, [open, releaseInputFocus, scheduleDialogRecovery])

  const handleSubmit = useCallback(() => {
    const embedUrl = parseYoutubeEmbedUrl(value)
    if (!embedUrl) {
      setError('Paste a valid YouTube link or video ID.')
      return
    }
    releaseInputFocus()
    setYoutubeDialogOpen(false)
    onSubmit(embedUrl)
    onClose()
    requestCameraPreviewLayoutRecovery('youtube-submit')
  }, [onClose, onSubmit, releaseInputFocus, value])

  const handleClose = useCallback(() => {
    releaseInputFocus()
    setYoutubeDialogOpen(false)
    onClose()
    requestCameraPreviewLayoutRecovery('youtube-close')
  }, [onClose, releaseInputFocus])

  const handlePasteFromClipboard = useCallback(() => {
    triggerLightHaptic()
    void (async () => {
      const filled = await tryFillFromClipboard('paste-button')
      if (!filled) {
        setError('No YouTube link on the clipboard — copy a URL in YouTube first.')
      }
    })()
  }, [tryFillFromClipboard])

  const handleInputPaste = useCallback((event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text').trim()
    if (!text) return
    setValue(text)
    setError(null)
    setClipboardReady(parseYoutubeEmbedUrl(text) !== null)
  }, [])

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
              Copy a link in YouTube, then return here — we&apos;ll pick it up automatically, or tap
              Paste.
            </p>

            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
                placeholder="YouTube URL or video ID"
                value={value}
                onPointerDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                onChange={(event) => {
                  setValue(event.target.value)
                  setError(null)
                  setClipboardReady(false)
                }}
                onPaste={handleInputPaste}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmit()
                  if (event.key === 'Escape') handleClose()
                }}
                className="min-w-0 flex-1 touch-manipulation rounded-lg border border-[rgba(23,26,34,0.08)] bg-white px-3 py-3 text-base text-[#171a22] placeholder:text-[#6c7077]/70 focus:border-red-500/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className={`flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(23,26,34,0.08)] bg-white px-3 py-2 text-xs font-medium text-[#171a22] ${NATIVE_SQUISH}`}
                aria-label="Paste from clipboard"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste
              </button>
            </div>

            {clipboardReady && !error && (
              <p className="mt-2 text-xs text-emerald-600">Link ready — tap Load.</p>
            )}

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
