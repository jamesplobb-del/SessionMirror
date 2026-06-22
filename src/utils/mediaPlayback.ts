import { Capacitor } from '@capacitor/core'
import { applyStrictPlaybackSrc } from './takeStorage'
import { applyBulletproofVideoElement } from './mobileVideo'

export interface PlaybackAttemptOptions {
  /** Called when iOS blocks or rejects playback — use to reset isPlaying UI state. */
  onFailure?: (error: unknown) => void
}

/** Inline playback attributes required by iOS WebKit. */
export function prepareInlineMediaElement(
  media: HTMLMediaElement,
  options: { preload?: 'none' | 'metadata' | 'auto' } = {},
): void {
  media.volume = 1
  media.preload = options.preload ?? 'none'
  media.setAttribute('playsinline', 'true')
  media.setAttribute('webkit-playsinline', 'true')
  if (media instanceof HTMLVideoElement) {
    applyBulletproofVideoElement(media)
  }
  // Muted state is owned by the Web Audio speaker bus — never unmute here or iOS
  // briefly routes through the quiet earpiece receiver.
}

/**
 * Wrap local file URIs with Capacitor.convertFileSrc before assigning to media src.
 * Never pass raw file:/// strings to the DOM on native.
 */
export function resolveMediaPlaybackSrc(url: string): string {
  if (!url) return url
  return applyStrictPlaybackSrc(url)
}

/** Assign a WebView-safe src on a media element (always converts native file paths). */
export function assignMediaPlaybackSrc(media: HTMLMediaElement, url: string): string {
  const safe = resolveMediaPlaybackSrc(url)
  if (safe) {
    media.src = safe
  }
  return safe
}

export function ensureMediaMuted(media: HTMLMediaElement): void {
  media.muted = true
  if ('defaultMuted' in media) {
    media.defaultMuted = true
  }
}

/**
 * Muted programmatic play — allowed by iOS after file writes / in useEffect.
 * Output is routed through Web Audio (element stays muted).
 */
export function safePlayMutedMedia(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  ensureMediaMuted(media)

  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.warn('Playback intercepted:', error)
      options.onFailure?.(error)
      return false
    })
}

/**
 * User-gesture play — call only from onClick / onPointerUp handlers.
 * Element remains muted; Web Audio speaker bus provides audible output.
 */
export function safePlayMedia(
  media: HTMLMediaElement,
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  return media
    .play()
    .then(() => true)
    .catch((error: unknown) => {
      console.warn('Playback intercepted:', error)
      options.onFailure?.(error)
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
  options: PlaybackAttemptOptions = {},
): Promise<boolean> {
  await beforePlay?.()
  return safePlayMedia(media, options)
}

/** True when a URL still needs Capacitor conversion before DOM assignment. */
export function isUnsafeNativeMediaSrc(url: string): boolean {
  if (!url || !Capacitor.isNativePlatform()) return false
  return url.startsWith('file://') || (!url.startsWith('blob:') && !url.startsWith('http') && !url.includes('_capacitor_file_') && !url.startsWith('capacitor://'))
}
