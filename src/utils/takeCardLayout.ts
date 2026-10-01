import type { WidgetPosition } from './floatingWidgetLayout'

export interface TakeCardLayoutBounds {
  left: number
  top: number
  width: number
  height: number
}

function hasFiniteTakeCardRect(bounds: TakeCardLayoutBounds): boolean {
  return Number.isFinite(bounds.left) && Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.width) && Number.isFinite(bounds.height) &&
    bounds.width > 0 && bounds.height > 0
}

export function hasUsableTakeCardBounds(bounds: TakeCardLayoutBounds): boolean {
  return hasFiniteTakeCardRect(bounds) &&
    bounds.width >= 240 && bounds.height >= 240
}

/** Wait for the app shell to settle after an overlay or viewport transition. */
export function takeCardBoundsAreStable(
  previous: TakeCardLayoutBounds | null,
  next: TakeCardLayoutBounds,
): boolean {
  return hasUsableTakeCardBounds(next) && Boolean(previous &&
    Math.abs(next.left - previous.left) <= 1 &&
    Math.abs(next.top - previous.top) <= 1 &&
    Math.abs(next.width - previous.width) <= 1 &&
    Math.abs(next.height - previous.height) <= 1)
}

/** Clamp only after valid bounds are available; the returned offset is transient. */
export function clampTakeCardTranslation({
  bounds,
  card,
  width,
  height,
  scale,
  position,
  renderedPosition = position,
  inset = 8,
}: {
  bounds: TakeCardLayoutBounds
  card: TakeCardLayoutBounds
  width: number
  height: number
  scale: number
  /** Offset represented by `card`'s current rendered rectangle. */
  renderedPosition?: WidgetPosition
  /** Preferred offset to restore, then clamp if the settled bounds require it. */
  position: WidgetPosition
  inset?: number
}): WidgetPosition | null {
  if (!hasUsableTakeCardBounds(bounds) || !hasFiniteTakeCardRect(card) ||
    !Number.isFinite(width) || !Number.isFinite(height) ||
    !Number.isFinite(scale) || scale <= 0 ||
    !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
    !Number.isFinite(renderedPosition.x) || !Number.isFinite(renderedPosition.y)) return null

  const centerX = card.left + card.width / 2 - renderedPosition.x
  const centerY = card.top + card.height / 2 - renderedPosition.y
  const halfWidth = width * scale / 2
  const halfHeight = height * scale / 2
  const minX = bounds.left + inset - (centerX - halfWidth)
  const maxX = bounds.left + bounds.width - inset - (centerX + halfWidth)
  const minY = bounds.top + inset - (centerY - halfHeight)
  const maxY = bounds.top + bounds.height - inset - (centerY + halfHeight)
  const clamp = (value: number, min: number, max: number) =>
    min <= max ? Math.min(max, Math.max(min, value)) : (min + max) / 2
  return {
    x: clamp(position.x, minX, maxX),
    y: clamp(position.y, minY, maxY),
  }
}
