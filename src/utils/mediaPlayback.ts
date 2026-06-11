/** Inline playback attributes required by iOS WebKit. */
export function prepareInlineMediaElement(media: HTMLMediaElement): void {
  media.muted = false
  media.defaultMuted = false
  media.volume = 1
  media.setAttribute('playsinline', 'true')
  media.setAttribute('webkit-playsinline', 'true')
}

/** Play with promise catch so iOS blocks never stall the main thread. */
export function safePlayMedia(media: HTMLMediaElement): Promise<boolean> {
  prepareInlineMediaElement(media)
  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.warn('iOS Playback blocked:', error)
      return false
    })
}

/** Wait until media has enough data to play (hands-free auto-playback after recording). */
export function waitForMediaReady(
  media: HTMLMediaElement,
  timeoutMs = 2500,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!media.src) {
      resolve(false)
      return
    }

    if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve(true)
      return
    }

    let settled = false
    const done = (ready: boolean) => {
      if (settled) return
      settled = true
      media.removeEventListener('loadeddata', onReady)
      media.removeEventListener('canplay', onReady)
      window.clearTimeout(timeoutId)
      resolve(ready)
    }

    const onReady = () => {
      done(true)
    }

    const timeoutId = window.setTimeout(() => done(false), timeoutMs)
    media.addEventListener('loadeddata', onReady)
    media.addEventListener('canplay', onReady)
  })
}

/**
 * Call synchronously inside onClick / onPointerUp — must not be deferred to useEffect.
 * Returns a promise for callers that want to update UI after play resolves.
 */
export async function playMediaOnUserGesture(
  media: HTMLMediaElement,
  beforePlay?: () => void | Promise<void>,
): Promise<boolean> {
  await beforePlay?.()
  prepareInlineMediaElement(media)
  return safePlayMedia(media)
}
