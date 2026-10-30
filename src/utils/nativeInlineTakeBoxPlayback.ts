import { completedTakeBoxTone } from './takeGuidance'
import { readyNaturalTakePreview } from './naturalTakePreview'
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

const completionSubscribers = new Set<(tone: 'current' | 'best') => void>()
export function subscribeTakeBoxCompletion(listener: (tone: 'current' | 'best') => void): () => void {
  completionSubscribers.add(listener)
  return () => { completionSubscribers.delete(listener) }
}

let endedListenerInstalled = false
const endedHandlers = new Map<string, () => void>()
let endedListenerHandle: PluginListenerHandle | null = null
let endedListenerInstall: Promise<void> | null = null
let endedListenerRemoval: Promise<void> | null = null
let activeOwnerId: string | null = null
let playbackGeneration = 0
let pendingOwnerId: string | null = null
/** Includes preparation so a delayed foreground repair cannot race a new preview. */
export function isNativeInlineTakeBoxPlaybackPendingOrActive(): boolean {
  return pendingOwnerId !== null || activeOwnerId !== null
}

let nativeOperations: Promise<unknown> = Promise.resolve()
function enqueueNativeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = nativeOperations.catch(() => {}).then(operation)
  nativeOperations = next
  return next
}

/** Per-box ended handler — the native overlay is a singleton, so starting one
 * box preempts another and the preempted box gets its ended event. */
export function setNativeInlineTakeBoxEndedHandler(
  ownerId: string,
  handler: (() => void) | null,
): void {
  if (handler) endedHandlers.set(ownerId, handler)
  else endedHandlers.delete(ownerId)
}

export async function ensureNativeInlineTakeBoxPlaybackListener(): Promise<void> {
  if (endedListenerRemoval) await endedListenerRemoval
  if (endedListenerInstalled) return
  if (endedListenerInstall) return endedListenerInstall
  endedListenerInstall = BestTakeAudioPlugin.addListener(
    'inlineTakeBoxPlaybackEnded',
    (event: { ownerId?: string; completed?: boolean }) => {
      const tone = completedTakeBoxTone(event)
      if (tone) completionSubscribers.forEach(listener => listener(tone))
      const ownerId = event?.ownerId
      if (ownerId && ownerId === activeOwnerId) {
        activeOwnerId = null
      }
      if (ownerId) {
        // A removed sibling's late notification must not stop every other box.
        endedHandlers.get(ownerId)?.()
        return
      }
      for (const handler of endedHandlers.values()) handler()
    },
  ).then(handle => {
    endedListenerHandle = handle
    endedListenerInstalled = true
  }).finally(() => { endedListenerInstall = null })
  await endedListenerInstall
}

export async function startNativeInlineTakeBoxPlayback(options: {
  filePath: string
  layout: InlineTakeBoxWindowRect
  mirror?: boolean
  volume?: number
  ownerId: string
}): Promise<boolean> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return false

  const generation = ++playbackGeneration
  pendingOwnerId = options.ownerId
  try {
    const fileURL = await resolveNativeFileUri(options.filePath)
    if (!fileURL) {
      console.warn('[InlineTakeBoxPlayback] could not resolve file URI', options.filePath)
      return false
    }
    await ensureNativeInlineTakeBoxPlaybackListener()
    const url = await readyNaturalTakePreview(fileURL, /\.(m4a|mp3|wav|caf|aac)$/i.test(fileURL) ? 'audio' : 'video')
    if (generation !== playbackGeneration) return false
    return await enqueueNativeOperation(async () => {
      if (generation !== playbackGeneration) return false
      await BestTakeAudioPlugin.startInlineTakeBoxPlayback({
      url,
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
      return generation === playbackGeneration
    })
  } catch (error) {
    console.warn('[InlineTakeBoxPlayback] failed to start', error)
    return false
  } finally {
    if (generation === playbackGeneration) pendingOwnerId = null
  }
}

/** Stop the native overlay. When ownerId is given, only stops if that box is
 * the one currently playing — box cleanup must not kill a sibling's playback. */
export async function stopNativeInlineTakeBoxPlayback(
  options: { notify?: boolean; ownerId?: string } = {},
): Promise<void> {
  if (!isNativeInlineTakeBoxPlaybackAvailable()) return
  const owner = options.ownerId
  if (!owner || pendingOwnerId === owner) {
    playbackGeneration += 1
    pendingOwnerId = null
  }
  await enqueueNativeOperation(async () => {
    if (!owner || activeOwnerId === owner) activeOwnerId = null
    try {
      // Audio-mode previews also use this native singleton. Its actual owner
      // is authoritative even if a delayed JS ended event has not arrived yet.
      await BestTakeAudioPlugin.stopInlineTakeBoxPlayback({ notify: options.notify !== false, ownerId: owner })
    } catch { /* ignore */ }
  })
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
  await endedListenerInstall?.catch(() => {})
  if (endedHandlers.size > 0) return
  if (endedListenerRemoval) return endedListenerRemoval
  if (endedListenerHandle) {
    const handle = endedListenerHandle
    endedListenerHandle = null
    endedListenerInstalled = false
    const removal = handle.remove().finally(() => {
      if (endedListenerRemoval === removal) endedListenerRemoval = null
    })
    endedListenerRemoval = removal
    await removal
  }
}
