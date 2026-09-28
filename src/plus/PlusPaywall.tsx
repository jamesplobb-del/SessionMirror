import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, LockKeyhole, X } from 'lucide-react'
import AnimatedBottomSheet from '../components/ui/AnimatedBottomSheet'
import { redeemOfferCode } from '../utils/offerCodes'
import { closePlus, getPlusRequest, initializePlusAccess, purchasePlus, redeemAlpha, refreshPlusAccess, restorePlus, showPlus, startPlusTrial, subscribePlusRequest } from './plusAccess'
import { PLUS_FEATURES, type PlusFeature } from './plusPolicy'
import { usePlus } from './usePlus'
import './plus.css'

export function PromoCodePanel() {
  const codeId = useId()
  const plus = usePlus()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const redeem = async (test: boolean) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      if (test) { await redeemAlpha(code); setCode(''); setMessage('BestTake Plus is unlocked on this test build.') }
      else { await redeemOfferCode(); await refreshPlusAccess(); setMessage('Apple will confirm any successful redemption. Your access updates automatically.') }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not redeem this code.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  if (!plus.ready) return <div className="plus-promo"><p role="status">Checking code options…</p></div>
  return <div className="plus-promo">
    {plus.canRedeemAlpha && <form onSubmit={event => { event.preventDefault(); void redeem(true) }}>
      <label htmlFor={codeId}>Test build code</label>
      <div className="plus-promo__input"><input id={codeId} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={code} onChange={event => setCode(event.target.value)} placeholder="Enter alpha" disabled={busy} maxLength={64} /><button type="submit" disabled={busy || !code.trim()}>Unlock</button></div>
      <small>Enter alpha here for development or TestFlight. Apple’s code sheet below only accepts App Store offer codes.</small>
    </form>}
    <button className="plus-link plus-promo__store" type="button" disabled={busy} onClick={() => void redeem(false)}>{busy ? 'Please wait…' : 'Redeem App Store offer code'}</button>
    {plus.alphaUnlocked && <p role="status">Plus is unlocked for testing.</p>}
    {message && <p role="status">{message}</p>}
    {error && <p className="plus-error" role="alert">{error}</p>}
  </div>
}

export function PlusLocked({ feature, children }: { feature: PlusFeature; children?: ReactNode }) {
  const plus = usePlus()
  const copy = PLUS_FEATURES[feature]
  return <section className="plus-locked" aria-label={`${copy.title} with BestTake Plus`}>
    <LockKeyhole aria-hidden /><small>BESTTAKE PLUS</small><h3>{copy.title}</h3><p>{copy.detail}</p>
    <button type="button" disabled={!plus.ready} onClick={() => showPlus(feature)}>{plus.ready ? 'View Plus' : 'Checking access…'}</button>
    {children}
  </section>
}

export function PlusGate({ feature, children }: { feature: PlusFeature; children: ReactNode }) {
  const plus = usePlus()
  return plus.active ? children : <PlusLocked feature={feature} />
}

export default function PlusPaywall() {
  const plus = usePlus()
  const request = useSyncExternalStore(subscribePlusRequest, getPlusRequest, getPlusRequest)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [codesOpen, setCodesOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => { initializePlusAccess() }, [])
  useEffect(() => { setError(''); setMessage(''); setCodesOpen(false) }, [request])
  useEffect(() => { if (plus.active && request?.resume) closePlus(true) }, [plus.active, request])
  useEffect(() => {
    if (!request) return
    const previous = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => panel.current?.querySelector<HTMLButtonElement>('button')?.focus(), 100)
    return () => { clearTimeout(timer); if (previous?.isConnected) previous.focus() }
  }, [request])
  const perform = async (action: () => Promise<boolean>, restoring = false) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const unlocked = await action()
      if (unlocked) { setMessage('Plus is ready.'); if (request?.resume) closePlus(true) }
      else if (restoring) setMessage('No active Plus purchase or trial was found for this Apple Account.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const copy = PLUS_FEATURES[request?.feature ?? 'handsfree']
  const permanent = plus.purchased || plus.alphaUnlocked
  return <AnimatedBottomSheet isOpen={request !== null} onClose={() => { if (!busy) closePlus() }} ariaLabel="BestTake Plus" elevated elevatedLight zClass={{ backdrop: 'z-[99998]', sheet: 'z-[99999]' }}>
    <div className="plus-sheet" ref={panel} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') ?? []).filter(node => node.getClientRects().length)
      const first = focusable[0]; const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }}>
      <div className="plus-sheet__top"><span>BESTTAKE PLUS</span><button aria-label="Close Plus" disabled={busy} onClick={() => closePlus()}><X /></button></div>
      <h2>{permanent ? 'BestTake Plus is unlocked' : copy.title}</h2>
      <p>{permanent ? (plus.alphaUnlocked ? 'Full access is on for this test build.' : 'Your one-time purchase is active.') : copy.detail}</p>
      <ul className="plus-sheet__features">{['Hands-free recording and playback', 'Scores, backing tracks, and YouTube references', 'Pitch Insights', 'Unlimited routines and more multitrack boxes', 'Medium and Hard Staff Jumper levels'].map(item => <li key={item}><Check aria-hidden />{item}</li>)}</ul>
      {plus.active && !permanent && plus.trialExpiresAt && <p className="plus-sheet__trial" role="status">Your preview ends {new Date(plus.trialExpiresAt).toLocaleDateString()}. No automatic charge.</p>}
      {!plus.active && plus.trialStartedAt !== null && <p className="plus-sheet__trial">Your seven-day preview has ended. Your recordings and files are still saved.</p>}
      {!permanent && <div className="plus-sheet__actions">
        {!plus.active && plus.trialStartedAt === null && <button className="plus-primary" disabled={busy || !plus.ready || !plus.trialAvailable} onClick={() => void perform(startPlusTrial)}>Try Plus free for 7 days</button>}
        <button className={plus.trialStartedAt === null ? 'plus-secondary' : 'plus-primary'} disabled={busy || !plus.purchaseAvailable} onClick={() => void perform(purchasePlus)}>{plus.price ? `Unlock forever · ${plus.price}` : 'App Store purchase unavailable'}</button>
        <p className="plus-sheet__terms">One payment. No subscription. After the preview, you choose whether to buy. Learn, Balance, and your basic practice tools stay free.</p>
        {!plus.purchaseAvailable && <button className="plus-link" disabled={busy} onClick={() => void refreshPlusAccess()}>Check App Store availability</button>}
      </div>}
      {permanent && <button className="plus-primary" onClick={() => closePlus(true)}>Continue practicing</button>}
      <div className="plus-sheet__links"><button disabled={busy} onClick={() => void perform(restorePlus, true)}>Restore purchases</button><button disabled={busy} onClick={() => setCodesOpen(value => !value)}>Promo codes</button></div>
      {codesOpen && <PromoCodePanel />}
      {!permanent && <p className="plus-sheet__terms">When the preview ends, music tools, hands-free, Insights, and expanded limits require Plus. Your existing work stays saved.</p>}
      {busy && <p role="status">Waiting for the App Store…</p>}
      {(error || plus.error) && <p className="plus-error" role="alert">{error || plus.error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </AnimatedBottomSheet>
}
