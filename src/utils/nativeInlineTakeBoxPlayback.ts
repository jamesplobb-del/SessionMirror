import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { resolveNativeFileUri } from './takeStorage'

export interface InlineTakeBoxWindowRect {
  x: number
  y: number
  width: number
  height: number
  /** CSS border-radius of the measured element (points). */
  cornerRadius: number
}

export function isNativeInlineTakeBoxPlaybackAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function readElementCornerRadius(element: HTMLElement): number {
  const style = window.getComputedStyle(element)
  const raw = style.borderTopLeftRadius || '0'
  const px = parseFloat(raw)
  return Number.isFinite(px) && px > 0 ? px : 0
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
    cornerRadius: readElementCornerRadius(element),
  }
}

let endedListenerInstalled = false
const endedHandlers = new Map<string, () => void>()
let endedListenerHandle: PluginListenerHandle | null = null
let activeOwnerId: string | null = null

/** Per-box ended handler — the native overlay is a singleton, so starting one
 * box preempts another and the preempted box gets its ended event. */
export function setNativeInlineTakeBoxEndedHandler(
  ownerId: string,
  handler: (() => void) | null,
): void {
  if (handler) endedHandlers.set(ownerId, handler)
  else endedHandlers.delete(ownerId)
}

async function ensureEndedListener(): Promise<void> {
  if (endedListenerInstalled) return
  endedListenerInstalled = true
  endedListenerHandle = await BestTakeAudioPlugin.addListener(
    'inlineTakeBoxPlaybackEnded',
    (event: { ownerId?: string }) => {
      const ownerId = event?.ownerId
      if (ownerId && ownerId === activeOwnerId) {
        activeOwnerId = null
      }
      if (ownerId && endedHandlers.has(ownerId)) {
        endedHandlers.get(ownerId)?.()
        return
      }
      for (const handler of endedHandlers.values()) handler()
    },
  )
}

export async function startNativeInlineTakeBoxPlayback(options: {
  filePath: string
  layout: InlineTakeBoxWindowRect
  mirror?: boolean
  volume?: number
  ownerId: string
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
      cornerRadius: options.layout.cornerRadius,
      mirror: options.mirror === true,
      volume: options.volume ?? 1,
      ownerId: options.ownerId,
    })
    activeOwnerId = options.ownerId
    return true
  } catch (error) {
    console.warn('[InlineTakeBoxPlayback] failed to start', error)
    return false
  }
}

/** Stop the native overlay. When ownerId is given, only stops if that box is
 * the one currently playing — box cleanup must not kill a sibling's playback. */
export async function stopNativeInlineTakeBoxPlayback(
  options: { notify?: boolean; ownerId?: string } = {},
): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  if (options.ownerId && activeOwnerId !== null && activeOwnerId !== options.ownerId) {
    return
  }
  if (!options.ownerId || activeOwnerId === options.ownerId) {
    activeOwnerId = null
  }
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
      cornerRadius: layout.cornerRadius,
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
  if (endedHandlers.size > 0) return
  if (endedListenerHandle) {
    await endedListenerHandle.remove()
    endedListenerHandle = null
  }
  endedListenerInstalled = false
}
