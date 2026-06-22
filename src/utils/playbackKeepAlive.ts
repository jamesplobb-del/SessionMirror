import { Capacitor } from '@capacitor/core'
import { routeNativeOutputToSpeaker } from '../plugins/audioSession'
import { resumePlaybackAudioContext } from './playbackAudioContext'
import { routeTakePlaybackToSpeaker } from './takePlaybackSpeaker'

const activeElements = new Set<HTMLMediaElement>()
const wiredElements = new WeakSet<HTMLMediaElement>()

const KEEPALIVE_INTERVAL_MS = 200

let keepAliveTimer: number | null = null

function onPlaybackStop(event: Event): void {
  const element = event.currentTarget as HTMLMediaElement
  unregisterPlaybackKeepAlive(element)
}

function wireElementEvents(element: HTMLMediaElement): void {
  if (wiredElements.has(element)) return
  wiredElements.add(element)
  element.addEventListener('pause', onPlaybackStop)
  element.addEventListener('ended', onPlaybackStop)
}

function stopKeepAliveTimer(): void {
  if (keepAliveTimer === null) return
  window.clearInterval(keepAliveTimer)
  keepAliveTimer = null
}

function tickPlaybackKeepAlive(): void {
  void resumePlaybackAudioContext()
  if (Capacitor.isNativePlatform()) {
    void routeNativeOutputToSpeaker()
  }

  for (const element of [...activeElements]) {
    if (element.paused || element.ended) {
      activeElements.delete(element)
      continue
    }
    routeTakePlaybackToSpeaker(element, element.volume, false)
  }

  if (activeElements.size === 0) {
    stopKeepAliveTimer()
  }
}

/** Keep Web Audio + native routing alive for the full duration of playback. */
export function registerPlaybackKeepAlive(element: HTMLMediaElement): void {
  wireElementEvents(element)
  activeElements.add(element)

  if (keepAliveTimer === null) {
    tickPlaybackKeepAlive()
    keepAliveTimer = window.setInterval(tickPlaybackKeepAlive, KEEPALIVE_INTERVAL_MS)
  }
}

export function unregisterPlaybackKeepAlive(element?: HTMLMediaElement): void {
  if (element) {
    activeElements.delete(element)
  } else {
    activeElements.clear()
  }

  if (activeElements.size === 0) {
    stopKeepAliveTimer()
  }
}
