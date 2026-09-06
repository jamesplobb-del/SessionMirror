import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { X, Youtube } from 'lucide-react'
import { setYoutubeDialogOpen } from '../utils/youtubeDialogState'
import { triggerLightHaptic } from '../utils/haptics'
import { nativeGlideEase, motionGpuLayer } from '../utils/motionPresets'
import { nativeGlideIn, nativeGlideShown, NATIVE_SQUISH } from '../utils/interactiveUx'
import {
  applyViewportCssVarsOnResume,
  requestCameraPreviewLayoutRecovery,
} from '../utils/viewportSync'

import PracticeReferenceBrowser from './PracticeReferenceBrowser'
import { PracticeReferenceContext } from '../context/PracticeReferenceContext'

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
  const { projectId } = useContext(PracticeReferenceContext)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportTop, setViewportTop] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const recoveryTimerRef = useRef<number | null>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      setYoutubeDialogOpen(false)
      previous?.focus({ preventScroll: true })
    }
  }, [open])

  const releaseInputFocus = useCallback(() => {
    inputRef.current?.blur()
  }, [])

  const syncDialogViewport = useCallback(() => {
    const { height, top } = readDialogViewport()
    setViewportHeight(height)
    setViewportTop(top)
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

  }, [syncDialogViewport])

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
      return
    }

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

  const handleClose = useCallback(() => {
    releaseInputFocus()
    setYoutubeDialogOpen(false)
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
            className="relative w-full max-w-lg rounded-2xl border border-[rgba(23,26,34,0.06)] bg-[#f7f8fa] p-4 shadow-[0_-18px_48px_rgba(23,26,34,0.1),0_-4px_14px_rgba(23,26,34,0.05)]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.stopPropagation(); handleClose() }
              if (event.key !== 'Tab') return
              const targets = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary') ?? []).filter(node => node.getClientRects().length > 0)
              const first = targets[0], last = targets.at(-1)
              if (!first || !last) return
              if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
              if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
            }}
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

            <PracticeReferenceBrowser key={projectId ?? 'library'} onSelect={(url) => {
              releaseInputFocus()
              setYoutubeDialogOpen(false)
              onSubmit(url)
              onClose()
              requestCameraPreviewLayoutRecovery('youtube-submit')
            }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
