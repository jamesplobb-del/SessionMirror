import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

let pending: string | null = null
const listeners = new Set<() => void>()
const handled = new Set<string>()
export const getPendingMultitrackFile = () => pending
export function subscribeMultitrackFile(callback: () => void) {
  listeners.add(callback)
  return () => { listeners.delete(callback) }
}
export function consumeMultitrackFile() { const url = pending; pending = null; return url }
export async function initializeMultitrackFileOpen() {
  if (!Capacitor.isNativePlatform()) return
  const receive = (url: string) => {
    if (!url.startsWith('file://') || handled.has(url)) return
    let name: string
    try { name = decodeURIComponent(url.split(/[?#]/)[0]) } catch { return }
    if (!name.toLowerCase().endsWith('.btmulti')) return
    handled.add(url); pending = url
    listeners.forEach(callback => callback())
  }
  await App.addListener('appUrlOpen', event => receive(event.url))
  const launch = await App.getLaunchUrl()
  if (launch?.url) receive(launch.url)
}
