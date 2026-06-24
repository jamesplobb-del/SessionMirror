import { Capacitor } from '@capacitor/core'
import { youtubeVolumeFromUiSlider } from '../playbackVolume'
import { YOUTUBE_PROXY_ORIGIN } from '../youtubeEmbed'
import AudioSessionPlugin from '../audioSessionRoute'

const YOUTUBE_BOOST_DELAYS_MS = [
  0, 15, 30, 50, 80, 120, 180, 260, 380, 540, 760, 1100, 1600, 2300, 3200, 4500, 6300, 9000,
]

const YOUTUBE_WAKE_RETRY_MS = [0, 200, 450, 900, 1600, 2800, 4500]

let youtubeStereoEngaged = false
let mayUseYoutubeStereoRoute: () => boolean = () => true
let playbackListenerInstalled = false
let activeYoutubeIframe: HTMLIFrameElement | null = null
let loudnessBurstGeneration = 0
let wakeRetryGeneration = 0
let pendingYoutubeWake = false

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

function engageYoutubeStereoForReference(force = false): void {
  if (!Capacitor.isNativePlatform()) return
  if (!mayUseYoutubeStereoRoute()) return
  if (!force && youtubeStereoEngaged) return

  youtubeStereoEngaged = true
  void AudioSessionPlugin.enableStereoPlayback()
  window.setTimeout(() => {
    if (!youtubeStereoEngaged) return
    void AudioSessionPlugin.enableStereoPlayback()
  }, 150)
}

export function releaseYoutubeReferenceRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!youtubeStereoEngaged) return
  youtubeStereoEngaged = false
  void AudioSessionPlugin.enableRecordingRoute()
}

function cancelScheduledLoudnessWork(): void {
  loudnessBurstGeneration += 1
  wakeRetryGeneration += 1
}

/** Reset audio state when swapping or clearing a YouTube reference. */
export function prepareNewYoutubeReference(): void {
  cancelScheduledLoudnessWork()
  releaseYoutubeReferenceRoute()
  pendingYoutubeWake = true
  activeYoutubeIframe = null
}

export function registerYoutubeIframe(iframe: HTMLIFrameElement | null | undefined): void {
  activeYoutubeIframe = iframe ?? null
  if (pendingYoutubeWake && iframe) {
    wakeYoutubeReference(iframe)
  }
}

function boostYoutubeProxyAudio(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  if (!iframe) return
  unmuteYoutubeProxy(iframe)
  setYoutubeProxyVolumeFromUi(iframe, uiVolume)
  for (let i = 0; i < 16; i++) {
    postToYoutubeIframe(iframe, 'unMute')
    postToYoutubeIframe(iframe, 'setVolume', [100])
  }
}

function scheduleYoutubeLoudnessBursts(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  const generation = loudnessBurstGeneration
  for (const delay of YOUTUBE_BOOST_DELAYS_MS) {
    window.setTimeout(() => {
      if (generation !== loudnessBurstGeneration) return
      boostYoutubeProxyAudio(iframe, uiVolume)
    }, delay)
  }
}

function handleProxyPlaybackMessage(data: unknown): void {
  if (typeof data !== 'string') return
  let payload: { event?: string; state?: string }
  try {
    payload = JSON.parse(data)
  } catch {
    return
  }
  if (payload.event !== 'youtube-state') return

  const iframe = activeYoutubeIframe
  if (!iframe) return

  if (payload.state === 'ready') {
    engageYoutubeStereoForReference(true)
    boostYoutubeProxyAudio(iframe, 1)
    return
  }

  if (payload.state === 'playing') {
    engageYoutubeStereoForReference(true)
    boostYoutubeProxyAudio(iframe, 1)
    scheduleYoutubeLoudnessBursts(iframe, 1)
  }
}

/** Listen for ready/playing from the Netlify proxy player. */
export function ensureYoutubePlaybackListener(): void {
  if (playbackListenerInstalled) return
  playbackListenerInstalled = true
  window.addEventListener('message', (event) => {
    handleProxyPlaybackMessage(event.data)
  })
}

/** Wake loud reference audio — works for autoplay, paste, and manual play. */
export function wakeYoutubeReference(
  iframe: HTMLIFrameElement | null | undefined,
  options: { attemptPlay?: boolean; uiVolume?: number } = {},
): void {
  const { attemptPlay = true, uiVolume = 1 } = options
  if (!iframe) return

  ensureYoutubePlaybackListener()
  registerYoutubeIframe(iframe)
  pendingYoutubeWake = false

  engageYoutubeStereoForReference(true)
  boostYoutubeProxyAudio(iframe, uiVolume)

  if (attemptPlay) {
    postToYoutubeIframe(iframe, 'playVideo')
    boostYoutubeProxyAudio(iframe, uiVolume)
  }

  scheduleYoutubeLoudnessBursts(iframe, uiVolume)
}

/** Retry wake until the proxy player has had time to boot after a paste. */
export function scheduleYoutubeReferenceWake(
  iframe: HTMLIFrameElement | null | undefined,
): void {
  const generation = wakeRetryGeneration
  for (const delay of YOUTUBE_WAKE_RETRY_MS) {
    window.setTimeout(() => {
      if (generation !== wakeRetryGeneration) return
      wakeYoutubeReference(iframe)
    }, delay)
  }
}

/** @deprecated Use wakeYoutubeReference */
export function primeYoutubeReferenceLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume })
}

export function playYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  wakeYoutubeReference(iframe, { attemptPlay: true })
}

export function pauseYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'pauseVideo')
  releaseYoutubeReferenceRoute()
}

export function unmuteYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'unMute')
}

export function startYoutubeProxyPlayback(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  wakeYoutubeReference(iframe, { attemptPlay: true, uiVolume })
  scheduleYoutubeReferenceWake(iframe)
}

export function maintainYoutubeProxyLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  engageYoutubeStereoForReference(false)
  boostYoutubeProxyAudio(iframe, uiVolume)
}

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
