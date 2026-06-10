import { useEffect, useState } from 'react'
import { agentDebugLog } from '../utils/agentDebugLog'
import {
  classifyDeviceTilt,
  classifyDeviceTiltFromAcceleration,
  readPhysicalOrientation,
  requestMotionSensorAccessFromGesture,
  syncPhysicalOrientationClass,
  type PhysicalOrientation,
} from '../utils/physicalOrientation'

const STABLE_MS = 300

function resolvePhysicalTilt(
  gamma: number | null,
  beta: number | null,
  accelX: number | null,
  accelY: number | null,
): PhysicalOrientation {
  const fromAngles = classifyDeviceTilt(gamma, beta)
  if (fromAngles !== 'portrait') {
    return fromAngles
  }

  if (gamma == null && beta == null) {
    return classifyDeviceTiltFromAcceleration(accelX, accelY)
  }

  return 'portrait'
}

export function usePhysicalOrientation(): PhysicalOrientation {
  const [orientation, setOrientation] = useState<PhysicalOrientation>(() =>
    readPhysicalOrientation(),
  )

  useEffect(() => {
    let permissionGranted = false
    let stableOrientation: PhysicalOrientation = 'portrait'
    let pendingOrientation: PhysicalOrientation = 'portrait'
    let stableSince = Date.now()
    let cancelled = false
    let lastGamma: number | null = null
    let lastBeta: number | null = null
    let lastAccelX: number | null = null
    let lastAccelY: number | null = null
    let loggedFirstSample = false

    const commitOrientation = (next: PhysicalOrientation) => {
      if (next === stableOrientation) return
      stableOrientation = next
      syncPhysicalOrientationClass(next)
      setOrientation(next)
      // #region agent log
      agentDebugLog(
        'usePhysicalOrientation.ts:commit',
        'orientation committed',
        {
          orientation: next,
          gamma: lastGamma,
          beta: lastBeta,
          accelX: lastAccelX,
          accelY: lastAccelY,
        },
        'H-O7',
      )
      // #endregion
    }

    const handleSample = (next: PhysicalOrientation) => {
      const now = Date.now()

      if (next === stableOrientation) {
        pendingOrientation = next
        return
      }

      if (next !== pendingOrientation) {
        pendingOrientation = next
        stableSince = now
        return
      }

      if (now - stableSince >= STABLE_MS) {
        commitOrientation(next)
      }
    }

    const publishSample = () => {
      const next = resolvePhysicalTilt(lastGamma, lastBeta, lastAccelX, lastAccelY)
      if (!loggedFirstSample) {
        loggedFirstSample = true
        // #region agent log
        agentDebugLog(
          'usePhysicalOrientation.ts:sample',
          'first motion sample',
          {
            gamma: lastGamma,
            beta: lastBeta,
            accelX: lastAccelX,
            accelY: lastAccelY,
            resolved: next,
          },
          'H-O6',
        )
        // #endregion
      }
      handleSample(next)
    }

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!permissionGranted) return
      lastGamma = event.gamma
      lastBeta = event.beta
      publishSample()
    }

    const onDeviceMotion = (event: DeviceMotionEvent) => {
      if (!permissionGranted) return
      const sample = event.accelerationIncludingGravity ?? event.acceleration
      if (!sample) return
      lastAccelX = sample.x
      lastAccelY = sample.y
      publishSample()
    }

    const startListening = () => {
      window.addEventListener('deviceorientation', onDeviceOrientation, true)
      window.addEventListener('devicemotion', onDeviceMotion, true)
    }

    const stopListening = () => {
      window.removeEventListener('deviceorientation', onDeviceOrientation, true)
      window.removeEventListener('devicemotion', onDeviceMotion, true)
    }

    const onUserGesture = () => {
      if (permissionGranted || cancelled) return

      void requestMotionSensorAccessFromGesture().then((granted) => {
        if (cancelled || !granted) return
        permissionGranted = true
        startListening()
        document.removeEventListener('pointerdown', onUserGesture, true)
        document.removeEventListener('touchend', onUserGesture, true)
        // #region agent log
        agentDebugLog(
          'usePhysicalOrientation.ts:onUserGesture',
          'motion sensors enabled',
          {},
          'H-O6',
        )
        // #endregion
      })
    }

    document.addEventListener('pointerdown', onUserGesture, true)
    document.addEventListener('touchend', onUserGesture, true)

    return () => {
      cancelled = true
      stopListening()
      document.removeEventListener('pointerdown', onUserGesture, true)
      document.removeEventListener('touchend', onUserGesture, true)
    }
  }, [])

  return orientation
}
