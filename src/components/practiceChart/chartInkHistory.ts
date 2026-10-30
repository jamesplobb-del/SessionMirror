import type { InkStroke } from './chartInk'

/** Compare values so a copied, unchanged list does not discard redo. */
function sameStrokes(left: readonly InkStroke[], right: readonly InkStroke[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((stroke, index) => {
    const other = right[index]
    if (stroke === other) return true
    return stroke.page === other.page && stroke.colour === other.colour && stroke.width === other.width
      && stroke.points.length === other.points.length
      && stroke.points.every((point, pointIndex) => point === other.points[pointIndex])
  })
}

/**
 * Reversible edits for one attached score, held only for the current session.
 *
 * Strokes and their points must remain immutable after being passed in. History
 * owns shallow list snapshots and returns fresh lists, sharing immutable stroke
 * objects so each eraser move does not copy every point in the score.
 *
 * Call edit once for a completed drawing or Clear. Wrap an eraser drag in
 * begin/end; its intermediate edits update the current list but become one
 * undo operation. cancel restores that drag's baseline, for example on pinch.
 * Reset when the loaded score identity or its authoritative revision changes.
 * Persistence remains the caller's responsibility, including Undo and Redo.
 */
export class ChartInkHistory {
  private scoreIdentity: string
  private current: InkStroke[]
  private past: InkStroke[][] = []
  private future: InkStroke[][] = []
  private groupStart: InkStroke[] | null = null
  private readonly limit: number

  constructor(scoreIdentity: string, initialStrokes: readonly InkStroke[] = [], limit = 50) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Ink history limit must be a positive integer.')
    this.scoreIdentity = scoreIdentity
    this.current = [...initialStrokes]
    this.limit = limit
  }

  get identity(): string { return this.scoreIdentity }

  get canUndo(): boolean {
    return this.past.length > 0 || (this.groupStart !== null && !sameStrokes(this.groupStart, this.current))
  }

  get canRedo(): boolean {
    return this.future.length > 0 && (this.groupStart === null || sameStrokes(this.groupStart, this.current))
  }

  snapshot(): InkStroke[] { return [...this.current] }

  /** Also clears an unfinished gesture and any history from the previous score. */
  reset(scoreIdentity: string, strokes: readonly InkStroke[] = []): void {
    this.scoreIdentity = scoreIdentity
    this.current = [...strokes]
    this.past = []
    this.future = []
    this.groupStart = null
  }

  /** Returns the changed list to persist, or null when its values are unchanged. */
  edit(next: readonly InkStroke[]): InkStroke[] | null {
    if (sameStrokes(this.current, next)) return null
    if (this.groupStart === null) {
      this.pushPast(this.current)
      this.future = []
    }
    this.current = [...next]
    return this.snapshot()
  }

  /** Repeated begin calls retain the original baseline of the same gesture. */
  begin(): void {
    if (this.groupStart === null) this.groupStart = this.current
  }

  /** Commit one operation only if the completed gesture actually changed marks. */
  end(): boolean {
    const before = this.groupStart
    this.groupStart = null
    if (before === null || sameStrokes(before, this.current)) return false
    this.pushPast(before)
    this.future = []
    return true
  }

  /** Roll back an interrupted gesture without losing the preceding redo stack. */
  cancel(): InkStroke[] | null {
    const before = this.groupStart
    this.groupStart = null
    if (before === null) return null
    const changed = !sameStrokes(before, this.current)
    this.current = before
    return changed ? this.snapshot() : null
  }

  undo(): InkStroke[] | null {
    this.end()
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(this.current)
    this.current = previous
    return this.snapshot()
  }

  redo(): InkStroke[] | null {
    this.end()
    const next = this.future.pop()
    if (!next) return null
    this.pushPast(this.current)
    this.current = next
    return this.snapshot()
  }

  private pushPast(snapshot: InkStroke[]): void {
    this.past.push(snapshot)
    if (this.past.length > this.limit) this.past.shift()
  }
}
