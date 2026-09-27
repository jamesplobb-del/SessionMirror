import { Minus, Plus } from 'lucide-react'
import { describeHandsFreeGate } from '../utils/instrumentProfiles'
import Pressable from './ui/Pressable'

interface HandsFreeSettingsRowsProps {
  /** Seconds of quiet before a take stops (0–6). */
  silenceSeconds: number
  /** Start level 1–100; higher waits for a louder entrance. */
  volumeThreshold: number
  hapticFeedback?: boolean
  onSilenceSecondsChange: (seconds: number) => void
  onVolumeThresholdChange: (threshold: number) => void
}

const SILENCE_MIN = 0
const SILENCE_MAX = 6
const THRESHOLD_MIN = 1
const THRESHOLD_MAX = 100
const THRESHOLD_STEP = 10

/**
 * The two hands-free values a player changes mid-sitting, inside the widget
 * itself — every floating tool keeps its settings in its own panel. Same
 * numbers Settings stores; changing one here changes it there.
 */
export default function HandsFreeSettingsRows({
  silenceSeconds,
  volumeThreshold,
  hapticFeedback = true,
  onSilenceSecondsChange,
  onVolumeThresholdChange,
}: HandsFreeSettingsRowsProps) {
  const silence = Math.round(silenceSeconds * 2) / 2
  const threshold = Math.round(volumeThreshold)

  return (
    <div className="hands-free-settings" data-no-drag>
      <div className="hands-free-settings__row">
        <div className="hands-free-settings__label">
          <strong>Pause before playback</strong>
          <small>Stay quiet this long to hear your take</small>
        </div>
        <div className="hands-free-settings__stepper" role="group" aria-label="Quiet gap">
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

      <div className="hands-free-settings__row">
        <div className="hands-free-settings__label">
          <strong>Starts at</strong>
          <small>{describeHandsFreeGate(threshold)} · louder waits for a real entrance</small>
        </div>
        <div className="hands-free-settings__stepper" role="group" aria-label="Start level">
          <Pressable
            type="button"
            intensity="icon"
            haptic="light"
            hapticFeedback={hapticFeedback}
            disabled={threshold <= THRESHOLD_MIN}
            onClick={() => onVolumeThresholdChange(Math.max(THRESHOLD_MIN, threshold - THRESHOLD_STEP))}
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
            onClick={() => onVolumeThresholdChange(Math.min(THRESHOLD_MAX, threshold + THRESHOLD_STEP))}
            aria-label="Start only on louder playing"
          >
            <Plus aria-hidden />
          </Pressable>
        </div>
      </div>

      <p className="hands-free-settings__hint">Long-press Record to turn hands-free off.</p>
    </div>
  )
}
