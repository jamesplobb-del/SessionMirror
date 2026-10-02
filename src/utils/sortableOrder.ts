/** Geometry for press-and-drag reordering. Pure, so it can be checked without a DOM. */
export interface SlotRect { top: number; height: number }

/** Returns a new array with one item moved. The same array when nothing changes. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items as T[]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  return next
}

/**
 * Where a dragged row lands: the number of other rows whose middle sits above
 * the dragged row's middle. Rows keep their resting positions for this test,
 * so the answer does not flicker while the rows around it slide out of the way.
 */
export function dropIndex(rects: readonly SlotRect[], from: number, draggedTop: number): number {
  const dragged = rects[from]
  if (!dragged) return from
  const middle = draggedTop + dragged.height / 2
  let index = 0
  rects.forEach((rect, i) => { if (i !== from && rect.top + rect.height / 2 < middle) index++ })
  return index
}

/**
 * How far each row moves for `from` to end up at `to`. Rows may differ in
 * height; the gap between rows is read from the list itself.
 */
export function shiftsFor(rects: readonly SlotRect[], from: number, to: number): number[] {
  if (!rects.length) return []
  let gap = Infinity
  for (let i = 1; i < rects.length; i++) gap = Math.min(gap, rects[i]!.top - (rects[i - 1]!.top + rects[i - 1]!.height))
  if (!Number.isFinite(gap) || gap < 0) gap = 0
  const order = moveItem(rects.map((_, i) => i), from, to)
  const shifts = new Array<number>(rects.length).fill(0)
  let cursor = rects[0]!.top
  for (const index of order) {
    shifts[index] = cursor - rects[index]!.top
    cursor += rects[index]!.height + gap
  }
  return shifts
}

/** Wheel-style auto-scroll speed in px per frame: zero in the middle, faster at the edge. */
export function edgeScrollSpeed(pointerY: number, top: number, bottom: number, zone = 72, max = 16): number {
  if (pointerY < top + zone) return -Math.min(max, ((top + zone - pointerY) / zone) * max)
  if (pointerY > bottom - zone) return Math.min(max, ((pointerY - (bottom - zone)) / zone) * max)
  return 0
}
