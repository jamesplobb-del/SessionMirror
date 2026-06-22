const YOUTUBE_PROXY_ORIGIN = 'https://singular-manatee-b52df8.netlify.app'

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

/** Start proxy playback — call synchronously inside a user gesture when possible. */
export function playYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'playVideo')
}

export function pauseYoutubeProxy(iframe: HTMLIFrameElement | null | undefined): void {
  postToYoutubeIframe(iframe, 'pauseVideo')
}

/** Volume 0–100 for the YouTube IFrame API. */
export function setYoutubeProxyVolume(
  iframe: HTMLIFrameElement | null | undefined,
  volumePercent: number,
): void {
  const clamped = Math.round(Math.min(100, Math.max(0, volumePercent)))
  postToYoutubeIframe(iframe, 'setVolume', [clamped])
}

export function seekYoutubeProxy(
  iframe: HTMLIFrameElement | null | undefined,
  seconds: number,
): void {
  postToYoutubeIframe(iframe, 'seekTo', [seconds, true])
}
