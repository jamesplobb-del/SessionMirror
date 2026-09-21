export type TakeGuidanceStage = 'current' | 'best' | 'done'
export function advanceTakeGuidance(stage: TakeGuidanceStage, completed: 'current' | 'best', hasReference: boolean): TakeGuidanceStage {
  if (stage === 'done' || completed === 'best') return 'done'
  return hasReference ? 'best' : 'done'
}
/** Native stop notifications also include interruptions and source replacements. */
export function completedTakeBoxTone(event: { ownerId?: string; completed?: boolean }): 'current' | 'best' | null {
  if (event.completed !== true) return null
  if (event.ownerId === 'pip-challenger') return 'current'
  if (event.ownerId === 'best-take-box') return 'best'
  return null
}
