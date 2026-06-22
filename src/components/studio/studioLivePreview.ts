/** Attach a live camera stream and start inline preview (iOS-safe). */

import { applyBulletproofVideoElement } from '../../utils/mobileVideo'

const PREVIEW_PLAY_RETRIES = 4
const PREVIEW_RETRY_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function isLiveMediaStream(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false
  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) return false
  return videoTracks.some((track) => track.readyState === 'live' && track.enabled)
}

export async function attachLiveStreamPreview(
  el: HTMLVideoElement,
  stream: MediaStream,
): Promise<boolean> {
  if (!isLiveMediaStream(stream)) return false

  if (el.srcObject !== stream) {
    el.srcObject = stream
    el.removeAttribute('src')
  }
  el.muted = true
  el.defaultMuted = true
  applyBulletproofVideoElement(el)

  const tryPlay = async (): Promise<boolean> => {
    try {
      await el.play()
      return !el.paused
    } catch (err) {
      console.warn('Playback intercepted:', err)
      return false
    }
  }

  for (let attempt = 0; attempt < PREVIEW_PLAY_RETRIES; attempt += 1) {
    if (await tryPlay()) return true

    if (el.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      const ready = await new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => resolve(false), 1500)
        const onReady = () => {
          window.clearTimeout(timeoutId)
          el.removeEventListener('loadedmetadata', onReady)
          resolve(true)
        }
        el.addEventListener('loadedmetadata', onReady, { once: true })
      })
      if (ready && (await tryPlay())) return true
    }

    if (attempt + 1 < PREVIEW_PLAY_RETRIES) {
      await delay(PREVIEW_RETRY_MS)
    }
  }

  return false
}
