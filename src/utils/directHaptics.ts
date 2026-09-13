/** The iOS host handles these on its UI thread, outside Capacitor's serial
 * audio/file queue. Older installed hosts still use the plugin fallback. */
type HapticMessage =
  | { kind: 'prepare' }
  | { kind: 'impact'; style: string; intensity?: number }
  | { kind: 'notification'; type: string }

export function postDirectHaptic(message: HapticMessage): boolean {
  if (typeof window === 'undefined') return false
  const host = window as Window & {
    webkit?: { messageHandlers?: { bestTakeHaptics?: { postMessage: (body: unknown) => void } } }
  }
  const handler = host.webkit?.messageHandlers?.bestTakeHaptics
  if (!handler) return false
  try {
    handler.postMessage({ ...message, sentAt: Date.now() })
    return true
  } catch {
    return false
  }
}
