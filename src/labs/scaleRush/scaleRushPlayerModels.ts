import { SCALE_RUSH_ASSETS } from './scaleRushAssets'
import type { ScaleRushPlayerModelId } from './scaleRushTypes'

export interface ScaleRushPlayerModel {
  id: ScaleRushPlayerModelId
  name: string
  asset: string
  /** Small per-asset optical-size adjustment. */
  scale: number
}

export const SCALE_RUSH_PLAYER_MODELS: readonly ScaleRushPlayerModel[] = [
  { id: 'trumpeter', name: 'Trumpeter', asset: SCALE_RUSH_ASSETS.trumpetPlayer, scale: 1 },
  { id: 'cat', name: 'Cat', asset: SCALE_RUSH_ASSETS.catPlayer, scale: 0.96 },
  { id: 'robot', name: 'Robot', asset: SCALE_RUSH_ASSETS.robotPlayer, scale: 0.96 },
  { id: 'bird', name: 'Bird', asset: SCALE_RUSH_ASSETS.birdPlayer, scale: 0.96 },
  { id: 'fox', name: 'Fox', asset: SCALE_RUSH_ASSETS.foxPlayer, scale: 0.96 },
  { id: 'astronaut', name: 'Astronaut', asset: SCALE_RUSH_ASSETS.astronautPlayer, scale: 0.96 },
] as const

const PLAYER_STORAGE_KEY = 'besttake.scaleRush.playerModel'

export function getScaleRushPlayerModel(id: ScaleRushPlayerModelId): ScaleRushPlayerModel {
  return SCALE_RUSH_PLAYER_MODELS.find((model) => model.id === id) ?? SCALE_RUSH_PLAYER_MODELS[0]
}

export function loadScaleRushPlayerModel(): ScaleRushPlayerModelId {
  if (typeof window === 'undefined') return 'trumpeter'
  try {
    const value = window.localStorage.getItem(PLAYER_STORAGE_KEY)
    if (SCALE_RUSH_PLAYER_MODELS.some((model) => model.id === value)) {
      return value as ScaleRushPlayerModelId
    }
  } catch {
    // Storage can be unavailable in private/embedded contexts; use the default.
  }
  return 'trumpeter'
}

export function saveScaleRushPlayerModel(id: ScaleRushPlayerModelId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, id)
  } catch {
    // Selection still remains in React state for the current session.
  }
}
