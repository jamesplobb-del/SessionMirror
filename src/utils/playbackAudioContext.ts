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
  if (!playbackContext || playbackContext.state === 'closed') return
  void playbackContext.resume().catch(() => {})
}

export function isSharedPlaybackContext(context: AudioContext): boolean {
  return playbackContext === context
}
