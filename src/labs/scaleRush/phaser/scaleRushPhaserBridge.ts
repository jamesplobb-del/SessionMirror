import type { ScaleRushConfig, ScaleRushFeedback } from '../scaleRushTypes'

/** Mutable bridge state — React writes each frame; Phaser scene reads in update(). */
export interface ScaleRushPhaserBridgeState {
  config: ScaleRushConfig
  sequenceStep: number
  advanceToken: number
  missToken: number
  feedback: ScaleRushFeedback
  feedbackToken: number
}

export const scaleRushPhaserBridgeRef: { current: ScaleRushPhaserBridgeState | null } = {
  current: null,
}
