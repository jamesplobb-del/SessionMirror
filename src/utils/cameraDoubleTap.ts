type CameraPointer = { pointerId: number; clientX: number; clientY: number; isPrimary: boolean; button: number }

/** Two short, nearby taps; drags, pinches and cancelled touches never flip lenses. */
export function createCameraDoubleTapGesture(now = () => performance.now()) {
  let down: { id: number; x: number; y: number; at: number } | null = null
  let lastTap: { x: number; y: number; at: number } | null = null
  const cancel = () => { down = null; lastTap = null }
  return {
    cancel,
    leave() { if (down) cancel() },
    down(event: CameraPointer) {
      if (!event.isPrimary || event.button !== 0) { cancel(); return }
      down = { id: event.pointerId, x: event.clientX, y: event.clientY, at: now() }
    },
    move(event: CameraPointer) {
      if (down && event.pointerId === down.id && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 12) cancel()
    },
    up(event: CameraPointer): boolean {
      if (!down || event.pointerId !== down.id) return false
      const tap = down
      down = null
      const at = now()
      if (at - tap.at > 250 || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) { cancel(); return false }
      if (lastTap && at - lastTap.at <= 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= 32) {
        cancel()
        return true
      }
      lastTap = { x: tap.x, y: tap.y, at }
      return false
    },
  }
}
