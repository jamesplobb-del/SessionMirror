import { Check, Mic, MicOff, PencilLine, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Pressable from './ui/Pressable'
import { iosFade, iosSpringSnappy } from '../utils/motionPresets'
import { startSpokenFeedback, stopSpokenFeedback } from '../utils/spokenFeedback'

interface FocusedPracticeCueProps {
  open: boolean
  value: string
  hapticFeedback?: boolean
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}

export default function FocusedPracticeCue({
  open,
  value,
  hapticFeedback = true,
  onOpenChange,
  onChange,
}: FocusedPracticeCueProps) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const latestTranscriptRef = useRef(value)

  useEffect(() => {
    latestTranscriptRef.current = value
  }, [value])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    return () => {
      void stopSpokenFeedback()
    }
  }, [])

  const stopListening = async () => {
    const finalTranscript = await stopSpokenFeedback()
    if (finalTranscript.trim()) onChange(finalTranscript.trim())
    setListening(false)
  }

  const toggleListening = async () => {
    if (listening) {
      await stopListening()
      return
    }
    setError(null)
    try {
      setListening(true)
      await startSpokenFeedback({
        onTranscript: (transcript) => {
          latestTranscriptRef.current = transcript
          onChange(transcript)
        },
        onError: (message) => setError(message),
        onEnd: () => setListening(false),
      })
    } catch (startError) {
      setListening(false)
      setError(
        startError instanceof Error
          ? startError.message
          : 'Speech recognition is unavailable right now.',
      )
    }
  }

  const close = () => {
    if (listening) void stopListening()
    onOpenChange(false)
    setError(null)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
            <motion.button
              type="button"
              className="focused-cue-backdrop"
              aria-label="Close next take note"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={iosFade}
              onClick={close}
            />
            <motion.section
              className="focused-cue-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="focused-cue-title"
              initial={{ opacity: 0, scale: 0.96, x: '-50%', y: 'calc(-50% + 12px)' }}
              animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
              exit={{ opacity: 0, scale: 0.97, x: '-50%', y: 'calc(-50% + 8px)' }}
              transition={iosSpringSnappy}
            >
              <header>
                <div>
                  <span>Focused Practice</span>
                  <h2 id="focused-cue-title">What should change next?</h2>
                </div>
                <button type="button" onClick={close} aria-label="Close">
                  <X aria-hidden />
                </button>
              </header>

              <textarea
                ref={inputRef}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="Cleaner entrance, steadier air, lighter articulation…"
                rows={3}
              />

              <p className="focused-cue-help">
                Optional. This note attaches to your next take, then clears automatically.
              </p>
              {error && <p className="focused-cue-error">{error}</p>}

              <div className="focused-cue-actions">
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className={`focused-cue-dictate ${listening ? 'focused-cue-dictate--active' : ''}`}
                  onClick={() => void toggleListening()}
                >
                  {listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
                  {listening ? 'Stop listening' : 'Speak note'}
                </Pressable>
                {value && (
                  <Pressable
                    type="button"
                    intensity="icon"
                    haptic="light"
                    hapticFeedback={hapticFeedback}
                    className="focused-cue-clear"
                    onClick={() => onChange('')}
                    aria-label="Clear note"
                  >
                    <RotateCcw aria-hidden />
                  </Pressable>
                )}
                <Pressable
                  type="button"
                  intensity="soft"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  className="focused-cue-done"
                  onClick={close}
                >
                  {value ? <Check aria-hidden /> : <PencilLine aria-hidden />}
                  {value ? 'Done' : 'Skip'}
                </Pressable>
              </div>
            </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}
