/** In-memory debug ring only — no network or filesystem I/O (keeps the UI responsive on device). */
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
