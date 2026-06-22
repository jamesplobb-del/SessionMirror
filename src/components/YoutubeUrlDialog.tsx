import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { X, Youtube } from 'lucide-react'
import { parseYoutubeEmbedUrl } from '../utils/youtubeEmbed'
import { isIOSNative } from '../utils/viewportSync'

interface YoutubeUrlDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (embedUrl: string) => void
}

export default function YoutubeUrlDialog({ open, onClose, onSubmit }: YoutubeUrlDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)

  openRef.current = open

  const releaseInputFocus = useCallback(() => {
    inputRef.current?.blur()
    setKeyboardInset(0)
  }, [])

  useEffect(() => {
    if (!open) return
    setValue('')
    setError(null)

    if (!isIOSNative()) {
      const id = window.requestAnimationFrame(() => {
        if (openRef.current) inputRef.current?.focus()
      })
      return () => window.cancelAnimationFrame(id)
    }

    return undefined
  }, [open])

  useEffect(() => {
    if (!open) return

    const updateInset = () => {
      const vv = window.visualViewport
      if (!vv) {
        setKeyboardInset(0)
        return
      }
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardInset(overlap > 48 ? overlap : 0)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        releaseInputFocus()
      }
    }

    updateInset()
    window.visualViewport?.addEventListener('resize', updateInset)
    window.visualViewport?.addEventListener('scroll', updateInset)
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
      window.visualViewport?.removeEventListener('resize', updateInset)
      window.visualViewport?.removeEventListener('scroll', updateInset)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      removeAppListener?.()
      releaseInputFocus()
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
  }, [onClose, onSubmit, releaseInputFocus, value])

  const handleClose = useCallback(() => {
    releaseInputFocus()
    onClose()
  }, [onClose, releaseInputFocus])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : undefined }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl"
        onPointerDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="youtube-url-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Youtube className="h-4 w-4 text-red-500" />
            <h2 id="youtube-url-title" className="text-sm font-semibold text-gray-100">
              YouTube Reference
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-[11px] leading-snug text-gray-500">
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
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') handleClose()
          }}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-amber-500/50 focus:outline-none"
        />

        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full px-3 py-2 text-xs font-medium text-gray-500 transition hover:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 active:scale-[0.98]"
          >
            Load
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
