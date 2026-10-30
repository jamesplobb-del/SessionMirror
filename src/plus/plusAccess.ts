import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { subscribeAppForeground } from '../utils/appForeground'
import { hasPlusAccess, type PlusEntitlement, type PlusFeature } from './plusPolicy'

export interface PlusStatus extends PlusEntitlement {
  ready: boolean
  refreshing: boolean
  active: boolean
  price: string | null
  purchaseAvailable: boolean
  trialAvailable: boolean
  productError: string | null
  error: string | null
  statusRevision?: number
}
type NativeStatus = Omit<PlusStatus, 'ready' | 'active' | 'refreshing' | 'error'>
interface PlusBridge {
  redeem(): Promise<void>
  getStatus(options: { refreshProducts: boolean }): Promise<NativeStatus>
  purchase(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  startTrial(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  restore(): Promise<NativeStatus>
  diagnosePurchases(): Promise<{ report: string }>
  copyPurchaseReport(): Promise<void>
  addListener(event: 'plusChanged', listener: (status: NativeStatus) => void): Promise<PluginListenerHandle>
}
export const plusBridge = registerPlugin<PlusBridge>('OfferCodes')
const bridge = plusBridge
const native = Capacitor.getPlatform() === 'ios'
let state: PlusStatus = { ready: false, refreshing: false, active: false, purchased: false, trialStartedAt: null, trialExpiresAt: null,
  internalPreviewExpiresAt: null, price: null, purchaseAvailable: false, trialAvailable: false, productError: null, error: null }
const listeners = new Set<() => void>()
let initialized = false
let refreshing: Promise<void> | null = null
let refreshingProducts = false
let queuedProductRefresh = false
let actionStatusVersion = 0
let latestNativeRevision = -1
let expiredInternalPreviewDeadline = 0
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let actionBusy = false
let nativeListener: PluginListenerHandle | null = null
let registeringListener: Promise<void> | null = null

export const getPlusSnapshot = () => state
export const subscribePlus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const canUsePlus = () => state.ready && hasPlusAccess(state, Date.now())

function publish(status: Partial<PlusStatus>) {
  const next = { ...state, ...status }
  const now = Date.now()
  const previewDeadline = next.internalPreviewExpiresAt
  if (typeof previewDeadline === 'number' && Number.isFinite(previewDeadline)) {
    if (now >= previewDeadline) expiredInternalPreviewDeadline = Math.max(expiredInternalPreviewDeadline, previewDeadline)
    if (previewDeadline <= expiredInternalPreviewDeadline) next.internalPreviewExpiresAt = null
  }
  next.active = hasPlusAccess(next, now)
  state = next
  clearTimeout(expiryTimer)
  if (next.active && !next.purchased) {
    const deadlines = [next.trialExpiresAt, next.internalPreviewExpiresAt]
      .filter((expiry): expiry is number => typeof expiry === 'number' && Number.isFinite(expiry) && expiry > now)
    if (deadlines.length) expiryTimer = setTimeout(() => publish({}), Math.min(2_147_483_647, Math.max(1, Math.min(...deadlines) - now)))
  }
  listeners.forEach(listener => listener())
}

function hasNativeRevision(status: NativeStatus): status is NativeStatus & { statusRevision: number } {
  return typeof status.statusRevision === 'number' && Number.isSafeInteger(status.statusRevision) && status.statusRevision >= 0
}

function publishNativeStatus(status: NativeStatus) {
  if (hasNativeRevision(status)) {
    if (status.statusRevision < latestNativeRevision) return
    latestNativeRevision = status.statusRevision
  }
  // An absent field from a normal build must clear any previous preview state.
  publish({ ...status, internalPreviewExpiresAt: status.internalPreviewExpiresAt ?? null, ready: true, error: null })
}

async function ensureNativeListener(): Promise<void> {
  if (nativeListener) return
  if (!registeringListener) {
    registeringListener = bridge.addListener('plusChanged', publishNativeStatus)
      .then(handle => { nativeListener = handle })
      .catch(cause => { console.warn('Could not register App Store updates; will retry on refresh.', cause) })
      .finally(() => { registeringListener = null })
  }
  return registeringListener
}

export async function refreshPlusAccess(refreshProducts = false): Promise<void> {
  if (refreshing) {
    // A manual retry must still make a fresh request if an ordinary status
    // check was already running. Repeated retries share that one follow-up.
    if (refreshProducts && !refreshingProducts) queuedProductRefresh = true
    return refreshing
  }
  refreshingProducts = refreshProducts
  queuedProductRefresh = false
  refreshing = (async () => {
    do {
      const forceProducts = refreshingProducts
      queuedProductRefresh = false
      let version = actionStatusVersion
      try {
        if (native) {
          await ensureNativeListener()
          version = actionStatusVersion
          const status = await bridge.getStatus({ refreshProducts: forceProducts })
          // A delayed foreground check must not undo a newer purchase/restore.
          if (hasNativeRevision(status) || version === actionStatusVersion) publishNativeStatus(status)
        }
        else publish({ purchased: false, trialStartedAt: null, trialExpiresAt: null, internalPreviewExpiresAt: null, price: null, purchaseAvailable: false, trialAvailable: false, ready: true, error: 'Purchases are available in the iPhone and iPad app.' })
      } catch {
        // A temporary bridge error never creates an entitlement or discards one already verified this session.
        if (version === actionStatusVersion) publish({ ready: true, error: 'Could not check App Store access. Try again when connected.' })
      }
      refreshingProducts = queuedProductRefresh
    } while (queuedProductRefresh)
  })().finally(() => { refreshing = null; refreshingProducts = false; publish({ refreshing: false }) })
  publish({ refreshing: true, error: null })
  return refreshing
}

export function initializePlusAccess() {
  if (initialized) return
  initialized = true
  subscribeAppForeground(foreground => { if (foreground) void refreshPlusAccess() })
  void refreshPlusAccess()
}

async function withPlusAction<T>(action: () => Promise<T>): Promise<T> {
  if (actionBusy) throw new Error('Please finish the current App Store request.')
  actionBusy = true
  try { return await action() }
  finally { actionBusy = false }
}

async function perform(action: 'purchase' | 'startTrial' | 'restore') {
  return withPlusAction(async () => {
    if (native) {
      if (action === 'restore' && refreshing) await refreshing
      const result = await bridge[action]()
      actionStatusVersion++
      publishNativeStatus(result)
      if ('outcome' in result && result.outcome === 'pending') throw new Error('Your purchase is awaiting approval. Plus will unlock when Apple confirms it.')
    } else {
      throw new Error('Open BestTake on your iPhone or iPad to buy or restore Plus.')
    }
    return canUsePlus()
  })
}
export const purchasePlus = () => perform('purchase')
export const startPlusTrial = () => perform('startTrial')
export const restorePlus = () => perform('restore')

/** Creates a local support report only; it cannot grant access or make a purchase. */
export const diagnosePlusPurchases = () => withPlusAction(async (): Promise<string> => {
  if (!native) throw new Error('Open BestTake on your iPhone or iPad to check purchases.')
  if (refreshing) await refreshing
  const { report } = await bridge.diagnosePurchases()
  if (!report?.trim()) throw new Error('The purchase check returned no report. Please try again.')
  return report
})

/** Native code copies the last local report; no report is uploaded here. */
export const copyPlusPurchaseReport = () => withPlusAction(async (): Promise<void> => {
  if (!native) throw new Error('Open BestTake on your iPhone or iPad to copy the report.')
  await bridge.copyPurchaseReport()
})

export interface PlusRequest { feature: PlusFeature; resume?: () => void }
let request: PlusRequest | null = null
const requestListeners = new Set<() => void>()
export const getPlusRequest = () => request
export const subscribePlusRequest = (listener: () => void) => { requestListeners.add(listener); return () => { requestListeners.delete(listener) } }
export function showPlus(feature: PlusFeature = 'handsfree', resume?: () => void) {
  request = { feature, resume }; requestListeners.forEach(listener => listener())
}
export function closePlus(resume = false) {
  const action = resume && canUsePlus() ? request?.resume : undefined
  request = null; requestListeners.forEach(listener => listener())
  action?.()
}
/** Call before any mutation or media startup. Access must come from the native status. */
export function requirePlus(feature: PlusFeature, resume?: () => void): boolean {
  if (canUsePlus()) return true
  showPlus(feature, resume)
  return false
}
