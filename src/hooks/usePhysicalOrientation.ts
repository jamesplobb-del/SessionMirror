import { useEffect, useState } from 'react'
import {
  classifyDeviceTilt,
  readPhysicalOrientation,
  requestDeviceOrientationAccess,
  syncPhysicalOrientationClass,
  type PhysicalOrientation,
} from '../utils/physicalOrientation'

const STABLE_MS = 180

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

    const commitOrientation = (next: PhysicalOrientation) => {
      if (next === stableOrientation) return
      stableOrientation = next
      syncPhysicalOrientationClass(next)
      setOrientation(next)
    }

    const handleSample = (gamma: number | null, beta: number | null) => {
      const next = classifyDeviceTilt(gamma, beta)
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

    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (!permissionGranted) return
      handleSample(event.gamma, event.beta)
    }

    const startListening = () => {
      window.addEventListener('deviceorientation', onDeviceOrientation, true)
    }

    const stopListening = () => {
      window.removeEventListener('deviceorientation', onDeviceOrientation, true)
    }

    const enable = async () => {
      permissionGranted = await requestDeviceOrientationAccess()
      if (cancelled) return
      if (permissionGranted) {
        startListening()
      }
    }

    void enable()

    const onFirstGesture = () => {
      if (permissionGranted) return
      void enable()
    }

    window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true })

    return () => {
      cancelled = true
      stopListening()
      window.removeEventListener('pointerdown', onFirstGesture)
    }
  }, [])

  return orientation
}
