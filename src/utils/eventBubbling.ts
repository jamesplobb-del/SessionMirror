import type { MouseEvent, PointerEvent, TouchEvent } from 'react'

/** Stop propagation only — safe for buttons that must still receive click synthesis on iOS. */
export function stopEventBubble(
  event: MouseEvent | TouchEvent | PointerEvent,
): void {
  event.stopPropagation()
}

/** Block iOS touch/click events from reaching parent handlers (e.g. video open). */
export function blockTouchBubble(
  event: MouseEvent | TouchEvent | PointerEvent,
): void {
  event.preventDefault()
  event.stopPropagation()
}

/** Pin buttons: stop bubbling on touch without blocking the synthesized click. */
export function pinButtonBubbleProps() {
  return {
    onTouchStart: stopEventBubble,
    onTouchEnd: stopEventBubble,
  }
}

/** Attach bubble-blocking touch handlers without duplicating the click action. */
export function touchBubbleBlockProps() {
  return {
    onTouchStart: blockTouchBubble,
    onTouchEnd: blockTouchBubble,
    onPointerDown: blockTouchBubble,
  }
}
