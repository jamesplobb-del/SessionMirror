import { Capacitor } from '@capacitor/core'
import { applyBulletproofVideoElement } from './mobileVideo'

/** Inline playback attributes required by iOS WebKit. */
export function prepareInlineMediaElement(media: HTMLMediaElement): void {
  media.volume = 1
  media.preload = 'auto'
  media.setAttribute('playsinline', 'true')
  media.setAttribute('webkit-playsinline', 'true')
  if (media instanceof HTMLVideoElement) {
    applyBulletproofVideoElement(media)
  }
  // Muted state is owned by the Web Audio speaker bus — never unmute here or iOS
  // briefly routes through the quiet earpiece receiver.
}

function isWebSafePlaybackUrl(url: string): boolean {
  return (
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('capacitor://') ||
    url.includes('_capacitor_file_')
  )
}

/**
 * Wrap local file URIs with Capacitor.convertFileSrc before assigning to media src.
 * Skips blob:, http(s):, and already-converted capacitor playback URLs.
 */
export function resolveMediaPlaybackSrc(url: string): string {
  if (!url) return url
  if (!Capacitor.isNativePlatform()) return url
  if (isWebSafePlaybackUrl(url)) return url
  const converted = Capacitor.convertFileSrc(url)
  if (converted.startsWith('file://')) {
    return Capacitor.convertFileSrc(converted)
  }
  return converted
}

/** Play with promise catch so iOS blocks never stall the main thread. */
export function safePlayMedia(media: HTMLMediaElement): Promise<boolean> {
  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.warn('Playback intercepted:', error)
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
      media.removeEventListener('canplaythrough', onReady)
      window.clearTimeout(timeoutId)
      resolve(ready)
    }

    const onReady = () => {
      done(true)
    }

    const timeoutId = window.setTimeout(() => done(false), timeoutMs)
    media.addEventListener('loadeddata', onReady)
    media.addEventListener('canplay', onReady)
    media.addEventListener('canplaythrough', onReady)
  })
}

/** Poll until freshly saved native takes are readable by the media element. */
export async function waitForMediaReadyWithRetry(
  media: HTMLMediaElement,
  options: { attempts?: number; intervalMs?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  const { attempts = 10, intervalMs = 220, timeoutMs = 900 } = options

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await waitForMediaReady(media, timeoutMs)) {
      return true
    }

    if (attempt + 1 >= attempts) break

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
    try {
      media.load()
    } catch {
      /* ignore */
    }
  }

  return false
}

export async function playMediaOnUserGesture(
  media: HTMLMediaElement,
  beforePlay?: () => void | Promise<void>,
): Promise<boolean> {
  await beforePlay?.()
  return safePlayMedia(media)
}
