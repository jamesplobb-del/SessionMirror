/**
 * iOS WKWebView sometimes exposes legacy `webkitGetUserMedia` without a
 * `navigator.mediaDevices` object. Install the standard shim before any capture.
 */
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

let installed = false

export function installMediaDevicesPolyfill(): void {
  if (installed || typeof navigator === 'undefined') return
  installed = true

  const nav = navigator as LegacyNavigator

  if (!nav.mediaDevices) {
    try {
      Object.defineProperty(nav, 'mediaDevices', {
        value: {} as MediaDevices,
        writable: true,
        configurable: true,
      })
    } catch {
      ;(nav as Navigator & { mediaDevices: MediaDevices }).mediaDevices = {} as MediaDevices
    }
  }

  if (typeof nav.mediaDevices.getUserMedia !== 'function') {
    const legacy = nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia
    if (legacy) {
      nav.mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) =>
        new Promise<MediaStream>((resolve, reject) => {
          legacy.call(nav, constraints, resolve, reject)
        })
    }
  }
}
