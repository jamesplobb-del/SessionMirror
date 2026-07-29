import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type QuickTunerLaunchSource =
  | 'lockScreen'
  | 'controlCenter'
  | 'actionButton'
  | 'siriOrShortcuts'
  | 'homeScreenQuickAction'
  | 'inAppSettings'
  | 'deepLink'
  | 'systemControl'

export interface QuickTunerLaunchRequest {
  id: string
  source: QuickTunerLaunchSource
  requestedAt: number
  coldLaunch: boolean
}

type PermissionStatus = 'notDetermined' | 'granted' | 'denied' | 'unavailable'

interface QuickTunerPluginApi {
  markWebReady(): Promise<{ request?: QuickTunerLaunchRequest }>
  consumePendingLaunch(): Promise<{ request?: QuickTunerLaunchRequest }>
  getMicrophonePermissionStatus(): Promise<{ status: PermissionStatus }>
  requestMicrophonePermission(): Promise<{ status: PermissionStatus }>
  openAppSettings(): Promise<void>
  addListener(
    eventName: 'quickTunerLaunchAvailable',
    listener: () => void,
  ): Promise<PluginListenerHandle>
}

export const QuickTunerPlugin = registerPlugin<QuickTunerPluginApi>('QuickTunerPlugin')

let currentRequest: QuickTunerLaunchRequest | null = null
let initialized = false
let initializationPromise: Promise<void> | null = null
let nativeListener: PluginListenerHandle | null = null
let pullInFlight = false
let pullQueued = false
const subscribers = new Set<() => void>()

function emitRequest(request: QuickTunerLaunchRequest): void {
  if (currentRequest?.id === request.id) return
  currentRequest = request
  console.info('[QuickTuner] route requested', {
    id: request.id,
    source: request.source,
    coldLaunch: request.coldLaunch,
  })
  for (const subscriber of subscribers) subscriber()
}

async function pullPendingLaunch(markReady = false): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (pullInFlight) {
    pullQueued = true
    return
  }
  pullInFlight = true
  try {
    const result = markReady
      ? await QuickTunerPlugin.markWebReady()
      : await QuickTunerPlugin.consumePendingLaunch()
    if (result.request) emitRequest(result.request)
  } catch (error) {
    console.warn('[QuickTuner] native launch handoff unavailable', error)
  } finally {
    pullInFlight = false
    if (pullQueued) {
      pullQueued = false
      void pullPendingLaunch()
    }
  }
}

function scheduleForegroundPulls(): void {
  void pullPendingLaunch()
  window.setTimeout(() => void pullPendingLaunch(), 250)
  window.setTimeout(() => void pullPendingLaunch(), 800)
}

export async function initializeQuickTunerLaunch(): Promise<void> {
  if (initialized) return
  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        nativeListener = await QuickTunerPlugin.addListener(
          'quickTunerLaunchAvailable',
          () => void pullPendingLaunch(),
        )
      } catch (error) {
        console.warn('[QuickTuner] native listener unavailable', error)
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleForegroundPulls()
      })
      window.addEventListener('focus', scheduleForegroundPulls)
      await pullPendingLaunch(true)
    }

    initialized = true
    console.info('[QuickTuner] web launch coordinator ready')
  })()

  return initializationPromise
}

export function requestQuickTunerFromApp(
  source: Extract<QuickTunerLaunchSource, 'inAppSettings'>,
): void {
  emitRequest({
    id: globalThis.crypto?.randomUUID?.() ?? `quick-tuner-${Date.now()}`,
    source,
    requestedAt: Date.now(),
    coldLaunch: false,
  })
}

export function dismissQuickTuner(requestId: string): void {
  if (currentRequest?.id !== requestId) return
  console.info('[QuickTuner] route dismissed', {
    id: currentRequest.id,
    source: currentRequest.source,
  })
  currentRequest = null
  for (const subscriber of subscribers) subscriber()
}

export function subscribeQuickTunerLaunch(subscriber: () => void): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

export function getQuickTunerLaunchSnapshot(): QuickTunerLaunchRequest | null {
  return currentRequest
}

export async function disposeQuickTunerLaunch(): Promise<void> {
  await nativeListener?.remove()
  nativeListener = null
}

export type { PermissionStatus as QuickTunerMicrophonePermissionStatus }
