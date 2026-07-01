import { useEffect, useMemo, useState } from 'react'
import {
  pitchClassForSequenceStep,
  pitchClassLabel,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import type { ScaleRushKey } from '../../labs/scaleRush/scaleRushMusicLogic'

interface ScaleRushRunnerProps {
  keyRoot: ScaleRushKey
  sequenceStep: number
  targetPitchClass: number
  advanceToken: number
  missToken: number
}

const PLATFORM_SLOTS = [
  { left: '16%', char: true },
  { left: '38%', target: true },
  { left: '58%' },
  { left: '76%' },
  { left: '94%' },
] as const

export default function ScaleRushRunner({
  keyRoot,
  sequenceStep,
  targetPitchClass,
  advanceToken,
  missToken,
}: ScaleRushRunnerProps) {
  const [jumping, setJumping] = useState(false)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    if (advanceToken === 0) return
    setJumping(true)
    const timer = window.setTimeout(() => setJumping(false), 560)
    return () => window.clearTimeout(timer)
  }, [advanceToken])

  useEffect(() => {
    if (missToken === 0) return
    setShaking(true)
    const timer = window.setTimeout(() => setShaking(false), 460)
    return () => window.clearTimeout(timer)
  }, [missToken])

  const platforms = useMemo(() => {
    return PLATFORM_SLOTS.map((slot, index) => {
      const step = sequenceStep + index - 1
      const pitchClass =
        index === 1 ? targetPitchClass : step < 0 ? null : pitchClassForSequenceStep(keyRoot, step)
      const label =
        step < 0 ? '•' : pitchClass == null ? '—' : pitchClassLabel(pitchClass, keyRoot)
      return {
        id: `${sequenceStep}-${index}`,
        left: slot.left,
        label,
        isTarget: index === 1,
        isStart: step < 0,
      }
    })
  }, [keyRoot, sequenceStep, targetPitchClass])

  const trackOffset = -sequenceStep * 28

  return (
    <div
      className={`scale-rush-runner ${shaking ? 'scale-rush-runner--shake' : ''}`}
      aria-label="Scale Rush course"
    >
      <div
        className="scale-rush-runner__track"
        style={{ transform: `translateX(${trackOffset}px)` }}
      >
        <div className="scale-rush-runner__ground" />
        {platforms.map((platform) => (
          <div
            key={platform.id}
            className={`scale-rush-runner__platform ${platform.isTarget ? 'scale-rush-runner__platform--target' : ''}`}
            style={{ left: platform.left }}
          >
            <span className="scale-rush-runner__platform-label">{platform.label}</span>
            <div className="scale-rush-runner__platform-slab" />
          </div>
        ))}
      </div>

      <div
        className={`scale-rush-runner__character-wrap ${jumping ? 'scale-rush-runner__character-wrap--jump' : ''}`}
        style={{ left: '16%' }}
      >
        <div className="scale-rush-runner__character" aria-hidden />
      </div>
    </div>
  )
}
