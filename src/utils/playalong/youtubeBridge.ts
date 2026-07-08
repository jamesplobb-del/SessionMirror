import { Capacitor } from '@capacitor/core'
import { logPlaybackGainAuditYoutubeStart } from '../playbackGainAudit'
import { isHeadphoneOutputActive, subscribeHeadphoneOutput } from '../headphoneOutput'
import { youtubeVolumeFromUiSlider } from '../playbackVolume'
import { YOUTUBE_PROXY_ORIGIN } from '../youtubeEmbed'
import {
  engageStereoPlayback,
  isStereoPlaybackEngaged,
  refreshStereoPlaybackRoute,
  releaseStereoPlayback,
} from '../stereoPlaybackRoute'

const YOUTUBE_BOOST_DELAYS_MS = [
  0, 15, 30, 50, 80, 120, 180, 260, 380, 540, 760, 1100, 1600, 2300, 3200, 4500, 6300, 9000,
]

const YOUTUBE_WAKE_RETRY_MS = [0, 200, 450, 900, 1600, 2800, 4500]

const YOUTUBE_RECORD_MAINTAIN_RETRY_MS = [0, 200, 450, 900, 1600, 2800, 4500, 7000, 10000]

const STEREO_REFRESH_MIN_MS = 3000
const PLAYING_MAINTAIN_COOLDOWN_MS = 5000

let mayUseYoutubeStereoRoute: () => boolean = () => true
let playbackListenerInstalled = false
let activeYoutubeIframe: HTMLIFrameElement | null = null
let loudnessBurstGeneration = 0
let wakeRetryGeneration = 0
let recordMaintainGeneration = 0
let pendingYoutubeWake = false
let lastStereoRefreshAt = 0
let lastPlayingMaintainAt = 0
let headphoneProfileListenerInstalled = false
export let maintainDuringRecording = false

/** Skip stereo while recording or during hands-free auto-playback. */
export function registerYoutubeStereoGuard(guard: () => boolean): void {
  mayUseYoutubeStereoRoute = guard
}

export function setYoutubeReferenceActive(active: boolean): void {
  if (!active) {
    releaseYoutubeReferenceRoute()
  }
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

function postYoutubeVolumeProfile(iframe: HTMLIFrameElement | null | undefined): void {
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    {
      event: 'volume-profile',
      profile: isHeadphoneOutputActive() ? 'headphones' : 'speaker',
    },
    YOUTUBE_PROXY_ORIGIN,
  )
}

function ensureYoutubeHeadphoneProfileListener(): void {
  if (headphoneProfileListenerInstalled) return
  headphoneProfileListenerInstalled = true
  subscribeHeadphoneOutput(() => {
    postYoutubeVolumeProfile(activeYoutubeIframe)
    if (activeYoutubeIframe) {
      boostYoutubeProxyAudio(activeYoutubeIframe, 1)
    }
  })
}

/** Re-apply iOS stereo playback — throttled to avoid AVAudioSession churn that stalls camera preview. */
function refreshYoutubeStereoRoute(force = false): void {
  if (!Capacitor.isNativePlatform()) return
  if (!mayUseYoutubeStereoRoute()) return

  const now = Date.now()
  if (isStereoPlaybackEngaged() && now - lastStereoRefreshAt < STEREO_REFRESH_MIN_MS) return
  if (!force && now - lastStereoRefreshAt < STEREO_REFRESH_MIN_MS) return
  lastStereoRefreshAt = now

  if (isStereoPlaybackEngaged()) {
    refreshStereoPlaybackRoute()
  } else {
    engageStereoPlayback()
  }
}

export function releaseYoutubeReferenceRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (!isStereoPlaybackEngaged()) return
  lastStereoRefreshAt = 0
  releaseStereoPlayback()
}

function cancelScheduledLoudnessWork(): void {
  loudnessBurstGeneration += 1
  wakeRetryGeneration += 1
  recordMaintainGeneration += 1
}

/** Reset audio state when swapping or clearing a YouTube reference. */
export function prepareNewYoutubeReference(): void {
  cancelScheduledLoudnessWork()
  releaseYoutubeReferenceRoute()
  pendingYoutubeWake = true
  activeYoutubeIframe = null
  lastPlayingMaintainAt = 0
}

export function registerYoutubeIframe(iframe: HTMLIFrameElement | null | undefined): void {
  ensureYoutubeHeadphoneProfileListener()
  activeYoutubeIframe = iframe ?? null
  postYoutubeVolumeProfile(iframe)
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
    refreshYoutubeStereoRoute(true)
    boostYoutubeProxyAudio(iframe, 1)
    return
  }

  if (payload.state === 'playing') {
    logPlaybackGainAuditYoutubeStart()
    const now = Date.now()
    if (now - lastPlayingMaintainAt < PLAYING_MAINTAIN_COOLDOWN_MS) return
    lastPlayingMaintainAt = now
    boostYoutubeProxyAudio(iframe, 1)
    return
  }

  if (payload.state === 'paused' && maintainDuringRecording && mayUseYoutubeStereoRoute()) {
    const now = Date.now()
    if (now - lastPlayingMaintainAt < PLAYING_MAINTAIN_COOLDOWN_MS) return
    lastPlayingMaintainAt = now
    console.info('[YoutubeRecordMaintain] auto-resume after paused')
    boostYoutubeProxyAudio(iframe, 1)
    postToYoutubeIframe(iframe, 'playVideo')
  }
}

export function setYoutubeRecordingMaintain(active: boolean): void {
  maintainDuringRecording = active
}

export function maintainYoutubeReferenceDuringRecording(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1
): void {
  if (!iframe) return
  console.info('[YoutubeRecordMaintain] maintain fired')
  ensureYoutubePlaybackListener()
  registerYoutubeIframe(iframe)
  postYoutubeVolumeProfile(iframe)
  refreshYoutubeStereoRoute(false)
  boostYoutubeProxyAudio(iframe, uiVolume)
  postToYoutubeIframe(iframe, 'playVideo')
}

/** Retry maintain while recording — native record start can interrupt WKWebView audio once. */
export function scheduleYoutubeRecordingMaintain(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  const generation = recordMaintainGeneration
  for (const delay of YOUTUBE_RECORD_MAINTAIN_RETRY_MS) {
    window.setTimeout(() => {
      if (generation !== recordMaintainGeneration) return
      if (!maintainDuringRecording) return
      maintainYoutubeReferenceDuringRecording(iframe, uiVolume)
    }, delay)
  }
}

export function cancelYoutubeRecordingMaintain(): void {
  recordMaintainGeneration += 1
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

  postYoutubeVolumeProfile(iframe)
  refreshYoutubeStereoRoute(true)
  boostYoutubeProxyAudio(iframe, uiVolume)

  if (attemptPlay) {
    postToYoutubeIframe(iframe, 'playVideo')
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

/** Light touch during playback — avoid iframe/audio spam that freezes YouTube and camera preview. */
export function maintainYoutubeProxyLoudness(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume = 1,
): void {
  setYoutubeProxyVolumeFromUi(iframe, uiVolume)
}

export function setYoutubeProxyVolumeFromUi(
  iframe: HTMLIFrameElement | null | undefined,
  uiVolume: number,
): void {
  const clamped = youtubeVolumeFromUiSlider(uiVolume)
  postToYoutubeIframe(iframe, 'setVolume', [clamped])
  void import('../playbackGainAudit').then((m) =>
    m.maybeLogYoutubePlaybackGain(uiVolume, 'setVolume'),
  )
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
