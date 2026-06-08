import type { MouseEvent, PointerEvent, TouchEvent } from 'react'

/** Block iOS touch/click events from reaching parent handlers (e.g. video open). */
export function blockTouchBubble(
  event: MouseEvent | TouchEvent | PointerEvent,
): void {
  event.preventDefault()
  event.stopPropagation()
}

/** Attach bubble-blocking touch handlers without duplicating the click action. */
export function touchBubbleBlockProps() {
  return {
    onTouchStart: blockTouchBubble,
    onTouchEnd: blockTouchBubble,
    onPointerDown: blockTouchBubble,
  }
}
