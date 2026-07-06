export type RecordingOrientation = 'portrait' | 'landscape'
export type PhysicalOrientation = 'portrait' | 'landscape-left' | 'landscape-right'

let currentPhysicalOrientation: PhysicalOrientation = 'portrait'

const HTML_CLASS = {
  portrait: '',
  'landscape-left': 'physical-landscape-left',
  'landscape-right': 'physical-landscape-right',
} as const

const LANDSCAPE_GAMMA_THRESHOLD = 62
const LANDSCAPE_BETA_MAX = 38
const LANDSCAPE_ACCEL_THRESHOLD = 7.2
const LANDSCAPE_ACCEL_PORTRAIT_MAX = 3.8

export function readPhysicalOrientation(): PhysicalOrientation {
  return currentPhysicalOrientation
}

export function readRecordingOrientation(): RecordingOrientation {
  return currentPhysicalOrientation === 'portrait' ? 'portrait' : 'landscape'
}

export function syncPhysicalOrientationClass(orientation: PhysicalOrientation): void {
  if (typeof document === 'undefined') return
  if (orientation === currentPhysicalOrientation) return

  const root = document.documentElement
  for (const className of Object.values(HTML_CLASS)) {
    if (className) root.classList.remove(className)
  }

  const nextClass = HTML_CLASS[orientation]
  if (nextClass) {
    root.classList.add(nextClass)
  }

  currentPhysicalOrientation = orientation
}

export function classifyDeviceTilt(
  gamma: number | null,
  beta: number | null,
): PhysicalOrientation {
  if (gamma == null || beta == null || Number.isNaN(gamma) || Number.isNaN(beta)) {
    return 'portrait'
  }

  if (Math.abs(gamma) >= LANDSCAPE_GAMMA_THRESHOLD && Math.abs(beta) <= LANDSCAPE_BETA_MAX) {
    return gamma > 0 ? 'landscape-right' : 'landscape-left'
  }

  return 'portrait'
}

/** Fallback when DeviceOrientation angles are unavailable (common on iOS WKWebView). */
export function classifyDeviceTiltFromAcceleration(
  x: number | null,
  y: number | null,
): PhysicalOrientation {
  if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) {
    return 'portrait'
  }

  const absX = Math.abs(x)
  const absY = Math.abs(y)

  if (
    absX > LANDSCAPE_ACCEL_THRESHOLD &&
    absY <= LANDSCAPE_ACCEL_PORTRAIT_MAX &&
    absX > absY * 1.85
  ) {
    return x > 0 ? 'landscape-right' : 'landscape-left'
  }

  return 'portrait'
}

type MotionPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

function readMotionPermissionRequesters(): Array<
  () => Promise<MotionPermissionState>
> {
  if (typeof window === 'undefined') return []

  const requesters: Array<() => Promise<MotionPermissionState>> = []

  const orientationRequest = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<MotionPermissionState>
    }
  ).requestPermission
  if (typeof orientationRequest === 'function') {
    requesters.push(() => orientationRequest())
  }

  const motionRequest = (
    DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<MotionPermissionState>
    }
  ).requestPermission
  if (typeof motionRequest === 'function') {
    requesters.push(() => motionRequest())
  }

  return requesters
}

/** Must be invoked synchronously from a user-gesture handler on iOS. */
export function requestMotionSensorAccessFromGesture(): Promise<boolean> {
  const requesters = readMotionPermissionRequesters()
  if (requesters.length === 0) {
    return Promise.resolve(
      typeof DeviceOrientationEvent !== 'undefined' ||
        typeof DeviceMotionEvent !== 'undefined',
    )
  }

  const tryNext = async (index: number): Promise<boolean> => {
    if (index >= requesters.length) return false
    try {
      const state = await requesters[index]!()
      const granted = state === 'granted'
      if (granted) {
        return true
      }
    } catch {
      /* try next sensor permission API */
    }
    return tryNext(index + 1)
  }

  return tryNext(0)
}

export function motionSensorsNeedGesture(): boolean {
  return readMotionPermissionRequesters().length > 0
}
