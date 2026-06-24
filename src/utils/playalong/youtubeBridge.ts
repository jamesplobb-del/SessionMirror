import { Capacitor } from '@capacitor/core'
import { youtubeVolumeFromUiSlider } from '../playbackVolume'
import { resolveYoutubeProxyOrigin } from '../youtubeEmbed'
import AudioSessionPlugin from '../audioSessionRoute'

const YOUTUBE_BOOST_DELAYS_MS = [
  0, 25, 50, 80, 130, 200, 320, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000,
]

let youtubeStereoEngaged = false
let mayUseYoutubeStereoRoute: () => boolean = () => true

/**
 * Optional guard — e.g. skip stereo while recording or during hands-free auto-playback.
 * Call from App once; defaults to allowing stereo.
 */
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
    resolveYoutubeProxyOrigin(iframe),
  )
}

/** One-shot iOS stereo route — only on explicit play, never in the loudness loop. */
function engageYoutubeStereoOnce(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!mayUseYoutubeStereoRoute()) return
  if (youtubeStereoEngaged) return
  youtubeStereoEngaged = true
  void AudioSessionPlugin.enableStereoPlayback()
}

function releaseYoutubeStereoOnce(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!youtubeStereoEngaged) return
  youtubeStereoEngaged = false
  void AudioSessionPlugin.enableRecordingRoute()
}

/** Start proxy playback — call synchronously inside a user gesture when possible. */
export function playYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'playVideo')
  engageYoutubeStereoOnce()
}

export function pauseYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'pauseVideo')
  releaseYoutubeStereoOnce()
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

/** Re-assert max proxy volume while YouTube is playing — API only, no audio session switch. */
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
