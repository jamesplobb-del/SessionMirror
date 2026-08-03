/**
 * Safe UUID generator that uses crypto.randomUUID when available,
 * falling back to crypto.getRandomValues or Math.random for older/non-secure WebKit contexts.
 */
export function safeRandomUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID()
    } catch {
      /* fall through to manual generation */
    }
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    try {
      const bytes = new Uint8Array(16)
      globalThis.crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // RFC4122 version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC4122 variant
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    } catch {
      /* fall through */
    }
  }

  const now = Date.now().toString(36)
  const rand1 = Math.random().toString(36).substring(2, 10)
  const rand2 = Math.random().toString(36).substring(2, 10)
  return `${now}-${rand1.slice(0, 4)}-4000-8000-${rand2}`
}
