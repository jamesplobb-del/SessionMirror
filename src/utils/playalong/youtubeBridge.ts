import { Capacitor } from '@capacitor/core'
import { youtubeVolumeFromUiSlider } from '../playbackVolume'
import { resolveYoutubeProxyOrigin } from '../youtubeEmbed'
import AudioSessionPlugin from '../audioSessionRoute'

const YOUTUBE_BOOST_DELAYS_MS = [
  0, 25, 50, 80, 130, 200, 320, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000,
]

let routeListenerInstalled = false
let youtubeStereoEngaged = false
let canEngageYoutubeStereo: () => boolean = () => true

/** Gate stereo routing — e.g. skip while recording or hands-free auto-playback. */
export function registerYoutubeRouteGuards(guard: () => boolean): void {
  canEngageYoutubeStereo = guard
}

function postToYoutubeIframe(
  iframe: HTMLIFrameElement | null | undefined,
  func: string,
  args: unknown[] = [],
): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args }),
    resolveYoutubeProxyOrigin(iframe),
  )
}

function engageYoutubeStereoRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!canEngageYoutubeStereo()) return
  if (youtubeStereoEngaged) return
  youtubeStereoEngaged = true
  void AudioSessionPlugin.enableStereoPlayback()
}

export function releaseYoutubeStereoRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!youtubeStereoEngaged) return
  youtubeStereoEngaged = false
  void AudioSessionPlugin.enableRecordingRoute()
}

function handleProxyStateMessage(data: unknown): void {
  if (typeof data !== 'string') return
  let payload: { event?: string; state?: string }
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }
  if (payload.event !== 'youtube-state') return
  if (payload.state === 'playing') {
    engageYoutubeStereoRoute()
  } else if (payload.state === 'paused') {
    releaseYoutubeStereoRoute()
  }
}

/** Listen for play/pause events from the bundled proxy (native YouTube controls). */
export function ensureYoutubeProxyRouteListener(): void {
  if (routeListenerInstalled) return
  routeListenerInstalled = true
  window.addEventListener('message', (event) => {
    handleProxyStateMessage(event.data)
  })
}

/** Start proxy playback — call synchronously inside a user gesture when possible. */
export function playYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'playVideo')
  engageYoutubeStereoRoute()
}

export function pauseYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'pauseVideo')
  releaseYoutubeStereoRoute()
}

export function unmuteYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'unMute')
}

function boostYoutubeProxyAudio(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  unmuteYoutubeProxy(iframe)
  setYoutubeProxyVolumeFromUi(iframe, uiVolume)
  for (let i = 0; i < 4; i++) {
    postToYoutubeIframe(iframe, 'unMute')
    postToYoutubeIframe(iframe, 'setVolume', [100])
  }
}

/** Play reference audio as loud as the proxy allows — re-applies volume after the embed wakes. */
export function startYoutubeProxyPlayback(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  playYoutubeProxy(iframe)
  boostYoutubeProxyAudio(iframe, uiVolume)

  for (const delay of YOUTUBE_BOOST_DELAYS_MS) {
    window.setTimeout(() => {
      boostYoutubeProxyAudio(iframe, uiVolume)
    }, delay)
  }
}

/** Re-assert max proxy volume while YouTube is playing (API-only — no audio session thrash). */
export function maintainYoutubeProxyLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  boostYoutubeProxyAudio(iframe, uiVolume)
}

/** Volume from a 0–1 UI slider, boosted for audible reference playback. */
export function setYoutubeProxyVolumeFromUi(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  const clamped = youtubeVolumeFromUiSlider(uiVolume)
  postToYoutubeIframe(iframe, 'setVolume', [clamped])
}

/** @deprecated Prefer setYoutubeProxyVolumeFromUi — accepts 0–1 UI slider values. */
export function setYoutubeProxyVolume(
  iframe: HTMLIFrameElement | null | undefined,
  volumePercent: number,
): void {
  setYoutubeProxyVolumeFromUi(iframe, volumePercent / 100)
}

export function seekYoutubeProxy(
  iframe: HTMLIFrameElement | null | undefined,
  seconds: number,
): void {
  postToYoutubeIframe(iframe, 'seekTo', [seconds, true])
}
