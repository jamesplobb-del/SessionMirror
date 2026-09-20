const PREFIX = 'besttake:take-card-scale:'
export function clampTakeCardScale(value: number, max = 2) {
  return Math.min(Math.max(.5, max), Math.max(.75, Number.isFinite(value) ? value : 1))
}
export function loadTakeCardScale(id: string) {
  try { return clampTakeCardScale(Number(localStorage.getItem(PREFIX + id) ?? 1)) } catch { return 1 }
}
export function saveTakeCardScale(id: string, scale: number) {
  try { localStorage.setItem(PREFIX + id, String(clampTakeCardScale(scale))) } catch { /* Storage unavailable. */ }
}
