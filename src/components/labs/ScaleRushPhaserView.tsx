import { useEffect, useRef } from 'react'
import type { ScaleRushConfig, ScaleRushFeedback } from '../../labs/scaleRush/scaleRushTypes'
import {
  scaleRushPhaserBridgeRef,
  type ScaleRushPhaserBridgeState,
} from '../../labs/scaleRush/phaser/scaleRushPhaserBridge'

interface ScaleRushPhaserViewProps {
  config: ScaleRushConfig
  sequenceStep: number
  advanceToken: number
  missToken: number
  feedback: ScaleRushFeedback
  feedbackToken: number
}

export default function ScaleRushPhaserView({
  config,
  sequenceStep,
  advanceToken,
  missToken,
  feedback,
  feedbackToken,
}: ScaleRushPhaserViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<import('phaser').Game | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false

    void import('../../labs/scaleRush/phaser/createScaleRushPhaserGame').then(
      ({ createScaleRushPhaserGame }) => {
        if (cancelled || !hostRef.current) return
        gameRef.current = createScaleRushPhaserGame(hostRef.current)
      },
    )

    const resize = () => {
      const el = hostRef.current
      const game = gameRef.current
      if (!el || !game) return
      game.scale.resize(el.clientWidth, el.clientHeight)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)

    return () => {
      cancelled = true
      observer.disconnect()
      gameRef.current?.destroy(true)
      gameRef.current = null
      scaleRushPhaserBridgeRef.current = null
    }
  }, [])

  useEffect(() => {
    const next: ScaleRushPhaserBridgeState = {
      config,
      sequenceStep,
      advanceToken,
      missToken,
      feedback,
      feedbackToken,
    }
    scaleRushPhaserBridgeRef.current = next
  }, [config, sequenceStep, advanceToken, missToken, feedback, feedbackToken])

  return (
    <div
      ref={hostRef}
      className="sr-phaser-host"
      aria-label="Scale Rush course"
    />
  )
}
