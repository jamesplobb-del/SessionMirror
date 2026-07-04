import type { Take } from '../../types'
import type { MultitrackPanelState, MultitrackSession } from '../types'

export function buildMultitrackExportPlan(session: MultitrackSession, durationSeconds: number) {
  const performanceTakes = session.panels
    .filter((p): p is Extract<MultitrackPanelState, { kind: 'performance' }> => p.kind === 'performance')
    .map((p) => p.take)
    .filter((t): t is Take => t !== null)
  if (performanceTakes.length === 0) return null
  return { performanceTakes, practiceOverlayExcluded: session.practice.practiceOverlayEnabled, durationSeconds }
}

export function getPrimaryExportTake(plan: { performanceTakes: Take[] }): Take {
  return plan.performanceTakes[0]
}
