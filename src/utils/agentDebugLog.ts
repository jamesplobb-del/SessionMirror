/** Debug ring + ingest POST for session fba730 (ingest fails silently on device). */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
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
  const ring = ((window as unknown as { __SM_DEBUG_LOGS?: string[] }).__SM_DEBUG_LOGS ??= [])
  ring.push(JSON.stringify(payload))
  if (ring.length > 80) ring.shift()

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

export function readVideoTrackSettings(stream: MediaStream | null) {
  const track = stream?.getVideoTracks()[0]
  if (!track) return null
  const settings = track.getSettings()
  return {
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    frameRate: settings.frameRate ?? 0,
    facingMode: settings.facingMode ?? '',
  }
}

export function readAudioTrackSettings(stream: MediaStream | null) {
  const track = stream?.getAudioTracks()[0]
  if (!track) return null
  const settings = track.getSettings()
  return {
    sampleRate: settings.sampleRate ?? 0,
    echoCancellation: settings.echoCancellation ?? null,
    channelCount: settings.channelCount ?? 0,
  }
}
