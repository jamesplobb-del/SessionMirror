import { Capacitor } from '@capacitor/core'

const DEBUG_ENDPOINT = 'http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454'
const DEBUG_SESSION = 'fba730'

export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = 'pre-fix',
): void {
  const payload = {
    sessionId: DEBUG_SESSION,
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  }

  const line = `${JSON.stringify(payload)}\n`

  // #region agent log
  if (typeof window !== 'undefined') {
    const ring = ((window as unknown as { __SM_DEBUG_LOGS?: string[] }).__SM_DEBUG_LOGS ??=
      [])
    ring.push(line.trim())
    if (ring.length > 200) ring.shift()
  }

  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': DEBUG_SESSION,
    },
    body: JSON.stringify(payload),
  }).catch(() => {})

  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.()) {
    // Skip hot-path disk I/O — it blocked the main thread on iOS during debug sessions.
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
