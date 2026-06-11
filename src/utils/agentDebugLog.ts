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

function srcKind(src: string): string {
  if (!src) return 'empty'
  if (src.startsWith('blob:')) return 'blob'
  if (src.includes('capacitor://') || src.includes('_capacitor_file_')) return 'capacitor'
  if (src.startsWith('http')) return 'http'
  return 'other'
}

/** Sample playback RMS after `playing` — compares loud vs quiet takes (H-A). */
export function debugSamplePlaybackLevel(
  media: HTMLMediaElement,
  tag: string,
  hypothesisId: string,
): void {
  if (typeof window === 'undefined') return

  const sample = () => {
    const captureMedia = media as HTMLMediaElement & {
      captureStream?: () => MediaStream
    }
    const stream = captureMedia.captureStream?.()
    const audioTracks = stream?.getAudioTracks().length ?? 0

    if (!stream || audioTracks === 0) {
      agentDebugLog(
        'agentDebugLog.ts:debugSamplePlaybackLevel',
        'playback sample (no captureStream)',
        {
          tag,
          srcKind: srcKind(media.src),
          muted: media.muted,
          volume: media.volume,
          paused: media.paused,
        },
        hypothesisId,
      )
      return
    }

    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    source.connect(analyser)
    void ctx.resume().then(() => {
      window.setTimeout(() => {
        const buffer = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(buffer)
        let sum = 0
        for (const sampleValue of buffer) sum += sampleValue * sampleValue
        const rms = Math.sqrt(sum / buffer.length)
        agentDebugLog(
          'agentDebugLog.ts:debugSamplePlaybackLevel',
          'playback RMS sample',
          {
            tag,
            rms: Number(rms.toFixed(5)),
            srcKind: srcKind(media.src),
            muted: media.muted,
            volume: media.volume,
            audioTracks,
          },
          hypothesisId,
        )
        void ctx.close().catch(() => {})
      }, 450)
    })
  }

  if (!media.paused && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    sample()
    return
  }

  media.addEventListener('playing', sample, { once: true })
}
