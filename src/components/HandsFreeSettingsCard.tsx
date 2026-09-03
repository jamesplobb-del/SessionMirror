import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Pressable from './ui/Pressable'
import { iosFade, iosSpringSnappy } from '../utils/motionPresets'

interface HandsFreeSettingsCardProps {
  open: boolean
  /** Seconds of quiet before a take stops (0–6). */
  silenceSeconds: number
  /** Start level 1–100; higher waits for a louder entrance. */
  volumeThreshold: number
  hapticFeedback?: boolean
  onSilenceSecondsChange: (seconds: number) => void
  onVolumeThresholdChange: (threshold: number) => void
  onClose: () => void
}

const SILENCE_MIN = 0
const SILENCE_MAX = 6
const THRESHOLD_MIN = 1
const THRESHOLD_MAX = 100
const THRESHOLD_STEP = 10

function describeThreshold(value: number): string {
  if (value >= 70) return 'Loud only'
  if (value >= 40) return 'Medium'
  return 'Sensitive'
}

/**
 * The two hands-free values a player changes mid-sitting, reachable from the
 * Listening words themselves. Same numbers Settings stores; changing one here
 * changes it there.
 */
export default function HandsFreeSettingsCard({
  open,
  silenceSeconds,
  volumeThreshold,
  hapticFeedback = true,
  onSilenceSecondsChange,
  onVolumeThresholdChange,
  onClose,
}: HandsFreeSettingsCardProps) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (typeof document === 'undefined') return null

  const silence = Math.round(silenceSeconds * 2) / 2
  const threshold = Math.round(volumeThreshold)

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="hands-free-card-layer">
          <motion.button
            type="button"
            className="hands-free-card-backdrop"
            aria-label="Close hands-free settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={iosFade}
            onClick={onClose}
          />
          <motion.section
            className="hands-free-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hands-free-card-title"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={iosSpringSnappy}
          >
            <header className="hands-free-card__header">
              <div>
                <span className="hands-free-card__eyebrow">Hands-free</span>
                <h2 id="hands-free-card-title">While listening</h2>
              </div>
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                hapticFeedback={hapticFeedback}
                className="hands-free-card__close"
                onClick={onClose}
                aria-label="Close"
              >
                <X aria-hidden />
              </Pressable>
            </header>

            <div className="hands-free-card__row">
              <div className="hands-free-card__label">
                <strong>Quiet gap before stop</strong>
                <small>A rest longer than this ends the take</small>
              </div>
              <div className="hands-free-card__stepper" role="group" aria-label="Quiet gap">
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  disabled={silence <= SILENCE_MIN}
                  onClick={() => onSilenceSecondsChange(Math.max(SILENCE_MIN, silence - 0.5))}
                  aria-label="Shorter quiet gap"
                >
                  <Minus aria-hidden />
                </Pressable>
                <output className="tabular-nums">{silence === 0 ? 'Now' : `${silence}s`}</output>
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  disabled={silence >= SILENCE_MAX}
                  onClick={() => onSilenceSecondsChange(Math.min(SILENCE_MAX, silence + 0.5))}
                  aria-label="Longer quiet gap"
                >
                  <Plus aria-hidden />
                </Pressable>
              </div>
            </div>

            <div className="hands-free-card__row">
              <div className="hands-free-card__label">
                <strong>Starts at</strong>
                <small>{describeThreshold(threshold)} · louder waits for a real entrance</small>
              </div>
              <div className="hands-free-card__stepper" role="group" aria-label="Start level">
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  disabled={threshold <= THRESHOLD_MIN}
                  onClick={() =>
                    onVolumeThresholdChange(Math.max(THRESHOLD_MIN, threshold - THRESHOLD_STEP))
                  }
                  aria-label="Start on quieter playing"
                >
                  <Minus aria-hidden />
                </Pressable>
                <output className="tabular-nums">{threshold}</output>
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  hapticFeedback={hapticFeedback}
                  disabled={threshold >= THRESHOLD_MAX}
                  onClick={() =>
                    onVolumeThresholdChange(Math.min(THRESHOLD_MAX, threshold + THRESHOLD_STEP))
                  }
                  aria-label="Start only on louder playing"
                >
                  <Plus aria-hidden />
                </Pressable>
              </div>
            </div>

            <p className="hands-free-card__hint">Long-press Record to turn hands-free off.</p>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
