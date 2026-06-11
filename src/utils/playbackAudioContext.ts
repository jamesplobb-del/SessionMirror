let playbackContext: AudioContext | null = null

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
  }

  if (playbackContext.state === 'suspended') {
    await playbackContext.resume().catch(() => {})
  }

  return playbackContext
}

export function resumePlaybackAudioContext(): void {
  primePlaybackAudioContextSync()
}

/** Create or resume the shared playback context — call synchronously inside a user gesture. */
export function primePlaybackAudioContextSync(): AudioContext {
  if (!playbackContext || playbackContext.state === 'closed') {
    playbackContext = createPlaybackContext()
  }

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
