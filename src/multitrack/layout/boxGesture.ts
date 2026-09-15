import type { LayoutRectPercent } from './layoutRects'

export type BoxGestureMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Canvas-relative movement: never snap to, or reflow, another part. */
export function transformBox(
  start: LayoutRectPercent, mode: BoxGestureMode, dx: number, dy: number,
): LayoutRectPercent {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return start
  if (mode === 'move') return {
    ...start,
    xPercent: clamp(start.xPercent + dx, 0, 100 - start.widthPercent),
    yPercent: clamp(start.yPercent + dy, 0, 100 - start.heightPercent),
  }
  let left = start.xPercent, top = start.yPercent
  let right = left + start.widthPercent, bottom = top + start.heightPercent
  const minWidth = Math.min(5, start.widthPercent), minHeight = Math.min(5, start.heightPercent)
  if (mode.includes('w')) left = clamp(left + dx, 0, right - minWidth)
  if (mode.includes('e')) right = clamp(right + dx, left + minWidth, 100)
  if (mode.includes('n')) top = clamp(top + dy, 0, bottom - minHeight)
  if (mode.includes('s')) bottom = clamp(bottom + dy, top + minHeight, 100)
  return { xPercent: left, yPercent: top, widthPercent: right - left, heightPercent: bottom - top }
}
