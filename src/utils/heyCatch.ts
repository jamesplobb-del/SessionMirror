import { useEffect, useState, useSyncExternalStore } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { getPlusRequest, subscribePlusRequest } from '../plus/plusAccess'

type Consent = { enabled: boolean }

interface HeyCatchBridge {
  getConsent(): Promise<Consent>
  setConsent(options: Consent): Promise<Consent>
  screen(options: { name: string }): Promise<void>
  trackOnboarding(options: { completed: boolean }): Promise<void>
}

export const hasHeyCatch = Capacitor.getPlatform() === 'ios'
const bridge = registerPlugin<HeyCatchBridge>('HeyCatch')

function reportBridgeError(error: unknown) {
  console.warn('[HeyCatch] Analytics bridge unavailable', error)
}

export function HeyCatchScreen({ name }: { name: string | null }) {
  const paywall = useSyncExternalStore(subscribePlusRequest, getPlusRequest, getPlusRequest)
  const visibleScreen = paywall ? 'Plus Paywall' : name

  useEffect(() => {
    if (hasHeyCatch && visibleScreen) {
      void bridge.screen({ name: visibleScreen }).catch(reportBridgeError)
    }
  }, [visibleScreen])

  return null
}

export function trackHeyCatchOnboarding(completed: boolean) {
  if (hasHeyCatch) void bridge.trackOnboarding({ completed }).catch(reportBridgeError)
}

export function useHeyCatchConsent(active: boolean) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!hasHeyCatch || !active) return
    let cancelled = false
    setEnabled(null)
    setError(false)
    void bridge.getConsent().then(result => {
      if (!cancelled) setEnabled(result.enabled)
    }).catch(cause => {
      reportBridgeError(cause)
      if (!cancelled) setError(true)
    })
    return () => { cancelled = true }
  }, [active])

  async function update(next: boolean) {
    setSaving(true)
    setError(false)
    try {
      setEnabled((await bridge.setConsent({ enabled: next })).enabled)
    } catch (cause) {
      reportBridgeError(cause)
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return { checked: enabled === true, disabled: enabled === null || saving, error, update }
}
