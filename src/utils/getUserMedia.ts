import { Capacitor } from '@capacitor/core'
import { installMediaDevicesPolyfill } from './installMediaDevicesPolyfill'

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  onSuccess: (stream: MediaStream) => void,
  onError: (error: unknown) => void,
) => void

interface LegacyNavigator extends Navigator {
  getUserMedia?: LegacyGetUserMedia
  webkitGetUserMedia?: LegacyGetUserMedia
  mozGetUserMedia?: LegacyGetUserMedia
}

export class MediaDevicesUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaDevicesUnavailableError'
  }
}

function getPageOrigin(): string {
  if (typeof window === 'undefined') return 'unknown'
  return window.location.origin
}

function isBundledCapacitorOrigin(origin: string): boolean {
  return (
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost'
  )
}

/** True when the current context can actually request camera/microphone access. */
export function isGetUserMediaSupported(): boolean {
  installMediaDevicesPolyfill()
  if (typeof navigator === 'undefined') return false
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    return true
  }
  const legacy = navigator as LegacyNavigator
  return Boolean(legacy.getUserMedia || legacy.webkitGetUserMedia || legacy.mozGetUserMedia)
}

async function waitForGetUserMediaSupport(timeoutMs: number): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (isGetUserMediaSupported()) return true
    await new Promise<void>((resolve) => window.setTimeout(resolve, 120))
  }
  return isGetUserMediaSupported()
}

function describeUnavailableReason(): string {
  if (typeof navigator === 'undefined') {
    return 'Media capture is unavailable in this environment.'
  }

  const origin = getPageOrigin()
  const insecure =
    typeof window !== 'undefined' &&
    'isSecureContext' in window &&
    window.isSecureContext === false

  if (insecure) {
    return 'Camera and microphone access requires a secure context. Run the installed app build (not an http dev server).'
  }

  if (Capacitor.isNativePlatform() && !isBundledCapacitorOrigin(origin)) {
    return `Camera and microphone are unavailable on ${origin}. In Xcode, remove any live-reload server URL, then run: npm run build && npx cap sync ios`
  }

  if (Capacitor.isNativePlatform()) {
    return 'Camera and microphone are unavailable. Delete the app, rebuild in Xcode (npm run build && npx cap sync ios), and allow Camera + Microphone in iOS Settings.'
  }

  return 'Camera and microphone access is not available in this browser.'
}

export async function getUserMediaCompat(
  constraints: MediaStreamConstraints,
): Promise<MediaStream> {
  installMediaDevicesPolyfill()

  if (!isGetUserMediaSupported()) {
    await waitForGetUserMediaSupport(2800)
  }

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints)
  }

  const legacy = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | LegacyNavigator
    | undefined
  const legacyGetUserMedia =
    legacy?.getUserMedia || legacy?.webkitGetUserMedia || legacy?.mozGetUserMedia

  if (legacy && legacyGetUserMedia) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacyGetUserMedia.call(legacy, constraints, resolve, reject)
    })
  }

  throw new MediaDevicesUnavailableError(describeUnavailableReason())
}
