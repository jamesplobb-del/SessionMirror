const DEBUG_STORAGE_KEY = 'debug-fba730-logs'

/** Session fba730 debug ring + ingest (device POST fails silently). */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'auto-playback',
): void {
  if (typeof window === 'undefined') return

  const payload = {
    sessionId: 'fba730',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  }

  // #region agent log
  try {
    const prev = JSON.parse(sessionStorage.getItem(DEBUG_STORAGE_KEY) ?? '[]') as unknown[]
    prev.push(payload)
    sessionStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(prev.slice(-200)))
  } catch {
    /* quota / private mode */
  }

  fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'fba730',
    },
    body: JSON.stringify(payload),
  }).catch(() => {})

  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SM-DEBUG]', location, message, data)
  }
  // #endregion
}
