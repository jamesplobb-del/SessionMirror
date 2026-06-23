let playbackContext: AudioContext | null = null
let playbackContextWatchAttached = false

function attachPlaybackContextWatch(ctx: AudioContext): void {
  if (playbackContextWatchAttached) return
  playbackContextWatchAttached = true

  ctx.addEventListener('statechange', () => {
    // #region agent log
    fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'fba730',
      },
      body: JSON.stringify({
        sessionId: 'fba730',
        location: 'playbackAudioContext.ts:statechange',
        message: 'ctx-state-change',
        data: { state: ctx.state },
        timestamp: Date.now(),
        hypothesisId: 'D',
      }),
    }).catch(() => {})
    // #endregion
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
    }
  })

  const resumeOnVisible = () => {
    if (document.visibilityState === 'visible') {
      void ctx.resume().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', resumeOnVisible)
}

function createPlaybackContext(): AudioContext {
  const WebkitAudioContext = (
    window as Window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext
  const Ctor = window.AudioContext ?? WebkitAudioContext
  if (!Ctor) {
    throw new Error('Web Audio API is not available')
  }
  return new Ctor({ latencyHint: 'playback' })
}

/** Shared output context for take playback — one context avoids iOS ducking between graphs. */
export async function getPlaybackAudioContext(): Promise<AudioContext> {
  if (!playbackContext || playbackContext.state === 'closed') {
    playbackContext = createPlaybackContext()
    playbackContextWatchAttached = false
  }

  attachPlaybackContextWatch(playbackContext)

  if (playbackContext.state === 'suspended') {
    await playbackContext.resume().catch(() => {})
  }

  return playbackContext
}

/** Await a running shared playback context — use before audible .play(). */
export async function resumePlaybackAudioContext(): Promise<void> {
  await getPlaybackAudioContext()
}

/** Create or resume the shared playback context — call synchronously inside a user gesture. */
export function primePlaybackAudioContextSync(): AudioContext {
  if (!playbackContext || playbackContext.state === 'closed') {
    playbackContext = createPlaybackContext()
    playbackContextWatchAttached = false
  }

  attachPlaybackContextWatch(playbackContext)

  if (playbackContext.state === 'suspended') {
    void playbackContext.resume().catch((error: unknown) => {
      console.warn('Playback AudioContext resume blocked:', error)
    })
  }

  return playbackContext
}

export function isSharedPlaybackContext(context: AudioContext): boolean {
  return playbackContext === context
}
