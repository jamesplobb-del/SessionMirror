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
}
type NativeStatus = Omit<PlusStatus, 'ready' | 'active' | 'refreshing' | 'error'>
interface PlusBridge {
  redeem(): Promise<void>
  getStatus(options: { refreshProducts: boolean }): Promise<NativeStatus>
  purchase(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  startTrial(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  restore(): Promise<NativeStatus>
  addListener(event: 'plusChanged', listener: (status: NativeStatus) => void): Promise<PluginListenerHandle>
}
export const plusBridge = registerPlugin<PlusBridge>('OfferCodes')
const bridge = plusBridge
const native = Capacitor.getPlatform() === 'ios'
let state: PlusStatus = { ready: false, refreshing: false, active: false, purchased: false, trialStartedAt: null, trialExpiresAt: null,
  price: null, purchaseAvailable: false, trialAvailable: false, productError: null, error: null }
const listeners = new Set<() => void>()
let initialized = false
let refreshing: Promise<void> | null = null
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let actionBusy = false
let nativeListener: PluginListenerHandle | null = null
let registeringListener: Promise<void> | null = null

export const getPlusSnapshot = () => state
export const subscribePlus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const canUsePlus = () => state.ready && hasPlusAccess(state, Date.now())

function publish(status: Partial<PlusStatus>) {
  const next = { ...state, ...status }
  next.active = hasPlusAccess(next, Date.now())
  state = next
  clearTimeout(expiryTimer)
  if (next.active && !next.purchased && next.trialExpiresAt) {
    expiryTimer = setTimeout(() => publish({}), Math.min(2_147_483_647, Math.max(1, next.trialExpiresAt - Date.now())))
  }
  listeners.forEach(listener => listener())
}

async function ensureNativeListener(): Promise<void> {
  if (nativeListener) return
  if (!registeringListener) {
    registeringListener = bridge.addListener('plusChanged', status => publish({ ...status, ready: true, error: null }))
      .then(handle => { nativeListener = handle })
      .catch(cause => { console.warn('Could not register App Store updates; will retry on refresh.', cause) })
      .finally(() => { registeringListener = null })
  }
  return registeringListener
}

export async function refreshPlusAccess(refreshProducts = false): Promise<void> {
  if (refreshing) return refreshing
  publish({ refreshing: true, error: null })
  refreshing = (async () => {
    try {
      if (native) {
        await ensureNativeListener()
        publish({ ...await bridge.getStatus({ refreshProducts }), ready: true, error: null })
      }
      else publish({ purchased: false, trialStartedAt: null, trialExpiresAt: null, price: null, purchaseAvailable: false, trialAvailable: false, ready: true, error: 'Purchases are available in the iPhone and iPad app.' })
    } catch {
      // A temporary bridge error never creates an entitlement or discards one already verified this session.
      publish({ ready: true, error: 'Could not check App Store access. Try again when connected.' })
    }
  })().finally(() => { refreshing = null; publish({ refreshing: false }) })
  return refreshing
}

export function initializePlusAccess() {
  if (initialized) return
  initialized = true
  subscribeAppForeground(foreground => { if (foreground) void refreshPlusAccess() })
  void refreshPlusAccess()
}

async function perform(action: 'purchase' | 'startTrial' | 'restore') {
  if (actionBusy) throw new Error('Please finish the current App Store request.')
  actionBusy = true
  try {
    if (native) {
      const result = await bridge[action]()
      publish({ ...result, ready: true, error: null })
      if ('outcome' in result && result.outcome === 'pending') throw new Error('Your purchase is awaiting approval. Plus will unlock when Apple confirms it.')
    } else {
      throw new Error('Open BestTake on your iPhone or iPad to buy or restore Plus.')
    }
    return canUsePlus()
  } finally { actionBusy = false }
}
export const purchasePlus = () => perform('purchase')
export const startPlusTrial = () => perform('startTrial')
export const restorePlus = () => perform('restore')

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
/** Call before any mutation or media startup. Nothing starts until access is verified. */
export function requirePlus(feature: PlusFeature, resume?: () => void): boolean {
  if (canUsePlus()) return true
  showPlus(feature, resume)
  return false
}
