import { agentDebugLog } from './agentDebugLog'

export type RecordingOrientation = 'portrait' | 'landscape'
export type PhysicalOrientation = 'portrait' | 'landscape-left' | 'landscape-right'

let currentPhysicalOrientation: PhysicalOrientation = 'portrait'

const HTML_CLASS = {
  portrait: '',
  'landscape-left': 'physical-landscape-left',
  'landscape-right': 'physical-landscape-right',
} as const

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

  // #region agent log
  agentDebugLog(
    'physicalOrientation.ts:syncPhysicalOrientationClass',
    'physical orientation updated',
    { orientation },
    'H-O4',
  )
  // #endregion
}

export function classifyDeviceTilt(
  gamma: number | null,
  beta: number | null,
): PhysicalOrientation {
  if (gamma == null || beta == null || Number.isNaN(gamma) || Number.isNaN(beta)) {
    return 'portrait'
  }

  if (Math.abs(gamma) >= 55) {
    return gamma > 0 ? 'landscape-right' : 'landscape-left'
  }

  return 'portrait'
}

export async function requestDeviceOrientationAccess(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    return false
  }

  const requestPermission = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
    }
  ).requestPermission

  if (typeof requestPermission !== 'function') {
    return true
  }

  try {
    const result = await requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}
