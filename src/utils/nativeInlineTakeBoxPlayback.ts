import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './takeStorage'

export interface InlineTakeBoxWindowRect {
  x: number
  y: number
  width: number
  height: number
}

export function isNativeInlineTakeBoxPlaybackAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export function measureInlineTakeBoxWindowRect(
  element: HTMLElement | null | undefined,
): InlineTakeBoxWindowRect | null {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

let endedListenerInstalled = false
let endedHandler: (() => void) | null = null
let endedListenerHandle: PluginListenerHandle | null = null

export function setNativeInlineTakeBoxEndedHandler(handler: (() => void) | null): void {
  endedHandler = handler
}

async function ensureEndedListener(): Promise<void> {
  if (endedListenerInstalled) return
  endedListenerInstalled = true
  endedListenerHandle = await BestTakeAudioPlugin.addListener(
    'inlineTakeBoxPlaybackEnded',
    () => {
      endedHandler?.()
    },
  )
}

export async function startNativeInlineTakeBoxPlayback(options: {
  filePath: string
  layout: InlineTakeBoxWindowRect
  mirror?: boolean
  volume?: number
}): Promise<boolean> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return false

  const fileURL = await resolveNativeFileUri(options.filePath)
  if (!fileURL) {
    console.warn('[InlineTakeBoxPlayback] could not resolve file URI', options.filePath)
    return false
  }

  await ensureEndedListener()

  try {
    await BestTakeAudioPlugin.startInlineTakeBoxPlayback({
      url: fileURL,
      x: options.layout.x,
      y: options.layout.y,
      width: options.layout.width,
      height: options.layout.height,
      mirror: options.mirror === true,
      volume: options.volume ?? 1,
    })
    return true
  } catch (error) {
    console.warn('[InlineTakeBoxPlayback] failed to start', error)
    return false
  }
}

export async function stopNativeInlineTakeBoxPlayback(
  options: { notify?: boolean } = {},
): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  try {
    await BestTakeAudioPlugin.stopInlineTakeBoxPlayback({
      notify: options.notify !== false,
    })
  } catch {
    /* ignore */
  }
}

export async function updateNativeInlineTakeBoxLayout(
  layout: InlineTakeBoxWindowRect,
): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  try {
    await BestTakeAudioPlugin.updateInlineTakeBoxPlaybackLayout({
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    })
  } catch {
    /* ignore */
  }
}

export async function setNativeInlineTakeBoxVolume(volume: number): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  try {
    await BestTakeAudioPlugin.setInlineTakeBoxPlaybackVolume({ volume })
  } catch {
    /* ignore */
  }
}

export async function teardownNativeInlineTakeBoxListener(): Promise<void> {
  if (endedListenerHandle) {
    await endedListenerHandle.remove()
    endedListenerHandle = null
  }
  endedListenerInstalled = false
  endedHandler = null
}
