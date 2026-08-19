export const BALANCE_GOAL_OPTIONS = [5, 8, 10, 15] as const

export type BalanceGoalSeconds = (typeof BALANCE_GOAL_OPTIONS)[number]

export interface BalanceDestinationGeometry {
  ratio: number
  x: number
  y: number
  scale: number
}

export function balanceGoalIndex(goalSeconds: number): number {
  const exact = BALANCE_GOAL_OPTIONS.indexOf(goalSeconds as BalanceGoalSeconds)
  if (exact >= 0) return exact
  return BALANCE_GOAL_OPTIONS.reduce((bestIndex, option, index) =>
    Math.abs(option - goalSeconds) < Math.abs(BALANCE_GOAL_OPTIONS[bestIndex]! - goalSeconds)
      ? index
      : bestIndex, 0)
}

export function balanceDestinationGeometry(goalSeconds: number): BalanceDestinationGeometry {
  const ratio = balanceGoalIndex(goalSeconds) / (BALANCE_GOAL_OPTIONS.length - 1)
  return {
    ratio,
    // The destination recedes up and to the right as the hold gets longer.
    // These are scene percentages shared by the renderer and setup gesture.
    x: 54 + ratio * 12,
    y: 47 - ratio * 20,
    scale: 1.03 - ratio * 0.25,
  }
}
