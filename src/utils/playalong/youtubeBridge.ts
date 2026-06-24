import { Capacitor } from '@capacitor/core'
import { youtubeVolumeFromUiSlider } from '../playbackVolume'
import { YOUTUBE_PROXY_ORIGIN } from '../youtubeEmbed'
import AudioSessionPlugin from '../audioSessionRoute'

const YOUTUBE_BOOST_DELAYS_MS = [
  0, 25, 50, 80, 130, 200, 320, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000,
]

let youtubeStereoEngaged = false
let mayUseYoutubeStereoRoute: () => boolean = () => true

/** Skip stereo while recording or during hands-free auto-playback. */
export function registerYoutubeStereoGuard(guard: () => boolean): void {
  mayUseYoutubeStereoRoute = guard
}

function postToYoutubeIframe(
  iframe: HTMLIFrameElement | null | undefined,
  func: string,
  args: unknown[] = [],
): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args }),
    YOUTUBE_PROXY_ORIGIN,
  )
}

/** One-shot iOS stereo — idempotent, never thrashes the session. */
function engageYoutubeStereoOnce(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!mayUseYoutubeStereoRoute()) return
  if (youtubeStereoEngaged) return
  youtubeStereoEngaged = true
  void AudioSessionPlugin.enableStereoPlayback()
}

export function releaseYoutubeReferenceRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!youtubeStereoEngaged) return
  youtubeStereoEngaged = false
  void AudioSessionPlugin.enableRecordingRoute()
}

function boostYoutubeProxyAudio(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  unmuteYoutubeProxy(iframe)
  setYoutubeProxyVolumeFromUi(iframe, uiVolume)
  for (let i = 0; i < 8; i++) {
    postToYoutubeIframe(iframe, 'unMute')
    postToYoutubeIframe(iframe, 'setVolume', [100])
  }
}

/** Prime loud reference audio as soon as the proxy iframe is ready. */
export function primeYoutubeReferenceLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  engageYoutubeStereoOnce()
  boostYoutubeProxyAudio(iframe, uiVolume)
}

/** Start proxy playback — call synchronously inside a user gesture when possible. */
export function playYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'playVideo')
}

export function pauseYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'pauseVideo')
  releaseYoutubeReferenceRoute()
}

export function unmuteYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'unMute')
}

/** Play reference audio as loud as possible on native + proxy. */
export function startYoutubeProxyPlayback(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  primeYoutubeReferenceLoudness(iframe, uiVolume)
  playYoutubeProxy(iframe)

  for (const delay of YOUTUBE_BOOST_DELAYS_MS) {
    window.setTimeout(() => {
      boostYoutubeProxyAudio(iframe, uiVolume)
    }, delay)
  }
}

/** Re-assert max volume while YouTube reference is visible (no session thrash). */
export function maintainYoutubeProxyLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  engageYoutubeStereoOnce()
  boostYoutubeProxyAudio(iframe, uiVolume)
}

/** Volume from a 0–1 UI slider — always API max when non-zero. */
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
