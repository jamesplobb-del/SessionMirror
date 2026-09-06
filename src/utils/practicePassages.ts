/** A passage belongs to one practice item and one concrete media source. */
export interface PracticePassage {
  startSeconds: number | null
  endSeconds: number | null
  positionSeconds: number
  loop: boolean
}
const PREFIX = 'besttake:practice-passage:v1:'
export const emptyPassage = (): PracticePassage => ({ startSeconds: null, endSeconds: null, positionSeconds: 0, loop: false })
function seconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 604800 ? value : null
}
export function normalizePassage(value: unknown): PracticePassage {
  if (!value || typeof value !== 'object') return emptyPassage()
  const raw = value as Partial<PracticePassage>
  const start = seconds(raw.startSeconds)
  const end = seconds(raw.endSeconds)
  const validEnd = start !== null && end !== null && end - start >= .5 ? end : null
  return { startSeconds: start, endSeconds: validEnd, positionSeconds: seconds(raw.positionSeconds) ?? 0,
    loop: raw.loop === true && start !== null && validEnd !== null }
}
function key(projectId: string, sourceId: string): string { return PREFIX + encodeURIComponent(projectId) + ':' + encodeURIComponent(sourceId) }
export function loadPracticePassage(projectId: string, sourceId: string): PracticePassage {
  try { return normalizePassage(JSON.parse(localStorage.getItem(key(projectId, sourceId)) ?? 'null')) }
  catch { return emptyPassage() }
}
export function savePracticePassage(projectId: string, sourceId: string, value: PracticePassage): PracticePassage {
  const next = normalizePassage(value)
  localStorage.setItem(key(projectId, sourceId), JSON.stringify(next))
  return next
}
export function parsePassageTime(text: string): number | null {
  const input = text.trim()
  if (!/^(?:\d+:)?\d+(?:\.\d{1,3})?$/.test(input)) return null
  const parts = input.split(':').map(Number)
  if (parts.length === 2 && parts[1] >= 60) return null
  return seconds(parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0])
}
export function formatPassageTime(value: number | null): string {
  if (value === null) return ''
  const total = Math.floor(value)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
