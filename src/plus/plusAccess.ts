import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { subscribeAppForeground } from '../utils/appForeground'
import { hasPlusAccess, PLUS_TRIAL_MS, type PlusEntitlement, type PlusFeature } from './plusPolicy'

export interface PlusStatus extends PlusEntitlement {
  ready: boolean
  active: boolean
  price: string | null
  purchaseAvailable: boolean
  trialAvailable: boolean
  error: string | null
}
type NativeStatus = Omit<PlusStatus, 'ready' | 'active' | 'error'>
interface PlusBridge {
  redeem(): Promise<void>
  getStatus(): Promise<NativeStatus>
  purchase(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  startTrial(): Promise<NativeStatus & { outcome?: 'cancelled' | 'pending' }>
  restore(): Promise<NativeStatus>
  redeemAlpha(options: { code: string }): Promise<NativeStatus>
  addListener(event: 'plusChanged', listener: (status: NativeStatus) => void): Promise<PluginListenerHandle>
}
export const plusBridge = registerPlugin<PlusBridge>('OfferCodes')
const bridge = plusBridge
const native = Capacitor.getPlatform() === 'ios'
const development = !native && import.meta.env?.DEV
const DEV_KEY = 'besttake:plus-development:v1'
let state: PlusStatus = { ready: false, active: false, purchased: false, alphaUnlocked: false,
  canRedeemAlpha: false, trialStartedAt: null, trialExpiresAt: null,
  price: null, purchaseAvailable: false, trialAvailable: false, error: null }
const listeners = new Set<() => void>()
let initialized = false
let refreshing: Promise<void> | null = null
let expiryTimer: ReturnType<typeof setTimeout> | undefined
let actionBusy = false

export const getPlusSnapshot = () => state
export const subscribePlus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const canUsePlus = () => state.ready && hasPlusAccess(state, Date.now())

function publish(status: Partial<PlusStatus>) {
  const next = { ...state, ...status }
  next.active = hasPlusAccess(next, Date.now())
  state = next
  clearTimeout(expiryTimer)
  if (next.active && !next.purchased && !next.alphaUnlocked && next.trialExpiresAt) {
    expiryTimer = setTimeout(() => publish({}), Math.min(2_147_483_647, Math.max(1, next.trialExpiresAt - Date.now())))
  }
  listeners.forEach(listener => listener())
}

function developmentStatus(): NativeStatus {
  let value: { trialStartedAt?: unknown; alphaUnlocked?: unknown } = {}
  try { value = JSON.parse(localStorage.getItem(DEV_KEY) ?? '{}') ?? {} } catch { /* Start locked when test data is invalid. */ }
  const start = typeof value.trialStartedAt === 'number' && Number.isFinite(value.trialStartedAt) && value.trialStartedAt > 0 ? value.trialStartedAt : null
  return { purchased: false, alphaUnlocked: value.alphaUnlocked === true, canRedeemAlpha: true,
    trialStartedAt: start, trialExpiresAt: start === null ? null : start + PLUS_TRIAL_MS,
    price: null, purchaseAvailable: false, trialAvailable: start === null }
}

export async function refreshPlusAccess(): Promise<void> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      if (native) publish({ ...await bridge.getStatus(), ready: true, error: null })
      else if (development) publish({ ...developmentStatus(), ready: true, error: null })
      else publish({ ready: true, error: 'Purchases are available in the iPhone and iPad app.' })
    } catch {
      // A temporary bridge error never creates an entitlement or discards one already verified this session.
      publish({ ready: true, error: 'Could not check App Store access. Try again when connected.' })
    }
  })().finally(() => { refreshing = null })
  return refreshing
}

export function initializePlusAccess() {
  if (initialized) return
  initialized = true
  if (native) void bridge.addListener('plusChanged', status => publish({ ...status, ready: true, error: null })).catch(() => {})
  subscribeAppForeground(foreground => { if (foreground) void refreshPlusAccess() })
  window.addEventListener('storage', event => { if (development && event.key === DEV_KEY) void refreshPlusAccess() })
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
    } else if (development && action === 'startTrial') {
      const current = developmentStatus()
      if (current.trialStartedAt !== null) throw new Error('This seven-day preview has already been used.')
      localStorage.setItem(DEV_KEY, JSON.stringify({ alphaUnlocked: current.alphaUnlocked, trialStartedAt: Date.now() }))
      publish({ ...developmentStatus(), ready: true, error: null })
    } else {
      throw new Error('Open BestTake on your iPhone or iPad to buy or restore Plus.')
    }
    return canUsePlus()
  } finally { actionBusy = false }
}
export const purchasePlus = () => perform('purchase')
export const startPlusTrial = () => perform('startTrial')
export const restorePlus = () => perform('restore')

export async function redeemAlpha(code: string): Promise<void> {
  if (actionBusy) throw new Error('Please finish the current request.')
  actionBusy = true
  try {
    if (native) publish({ ...await bridge.redeemAlpha({ code }), ready: true, error: null })
    else if (development && code.trim().toLowerCase() === 'alpha') {
      const current = developmentStatus()
      localStorage.setItem(DEV_KEY, JSON.stringify({ trialStartedAt: current.trialStartedAt, alphaUnlocked: true }))
      publish({ ...developmentStatus(), ready: true, error: null })
    } else throw new Error(development ? 'That test code is not valid.' : 'Test codes are available only in development and TestFlight builds.')
  } finally { actionBusy = false }
}

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
