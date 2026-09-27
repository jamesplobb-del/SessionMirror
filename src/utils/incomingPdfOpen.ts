import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'

export interface IncomingPdf {
  url: string
  name: string
}

let pending: IncomingPdf | null = null
let initialized = false
const handledUrls = new Set<string>()
const listeners = new Set<() => void>()

export function incomingPdfName(url: string): string | null {
  if (!url.startsWith('file://') && !url.startsWith('/')) return null
  const encoded = url.split(/[?#]/, 1)[0].split('/').pop() ?? ''
  let name: string
  try { name = decodeURIComponent(encoded) } catch { return null }
  return name && /\.pdf$/i.test(name) ? name : null
}

export function getPendingPdfOpen(): IncomingPdf | null { return pending }

export function consumePendingPdfOpen(): IncomingPdf | null {
  const file = pending
  pending = null
  if (file) handledUrls.add(file.url)
  return file
}

export function releaseFailedPdfOpen(url: string): void { handledUrls.delete(url) }

export function subscribePdfOpen(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opening from Files copies the source into Documents/Inbox. Our Music store
 * owns its own copy after import, so the temporary handoff can be removed. */
export async function discardOpenedPdfCopy(url: string): Promise<void> {
  if (!/\/Inbox\//i.test(url)) return
  await Filesystem.deleteFile({ path: url }).catch(() => {})
}

export async function initializePdfFileOpen(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return
  initialized = true
  const receive = (url: string) => {
    const name = incomingPdfName(url)
    if (!name || handledUrls.has(url) || pending?.url === url) return
    pending = { url, name }
    for (const listener of listeners) listener()
  }
  try {
    await App.addListener('appUrlOpen', event => receive(event.url))
  } catch (error) {
    console.warn('[Music] PDF open listener unavailable', error)
  }
  try {
    const launch = await App.getLaunchUrl()
    if (launch?.url) receive(launch.url)
  } catch { /* Normal launch without a file. */ }
}
