/**
 * The practice games' own audio context.
 *
 * Staff Jumper's click and the web drone used to borrow the app's shared
 * playback context, and coming back to the app is where that went wrong. iOS
 * deactivates the audio session while the app is away — screen locked, home
 * screen, Control Center — and WebKit can hand a context back 'suspended',
 * 'interrupted', or claiming 'running' with a clock that has stopped. resume()
 * mends only the first, so a game counted in and then played on in silence.
 *
 * A context the games own can be replaced outright when it is stuck, which the
 * shared one cannot: take playback and multitrack keep nodes on it. After any
 * trip away from the app, the next use checks that the clock actually moves
 * before trusting it.
 */
import { APP_BACKGROUND_SUSPEND_EVENT, APP_FOREGROUND_RECOVERY_EVENT } from '../utils/appForeground'

/** iOS can leave resume() pending indefinitely on an interrupted context. */
const RESUME_TIMEOUT_MS = 400

/** Several render quanta at any sample rate iOS runs at. */
const CLOCK_PROBE_MS = 90

let context: AudioContext | null = null
/** Set by a trip away from the app; the next use proves the clock runs. */
let suspect = false
let lifecycleAttached = false
let pending: Promise<AudioContext> | null = null

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function attachLifecycle(): void {
  if (lifecycleAttached) return
  lifecycleAttached = true
  const markSuspect = () => {
    suspect = true
  }
  window.addEventListener(APP_BACKGROUND_SUSPEND_EVENT, markSuspect)
  window.addEventListener(APP_FOREGROUND_RECOVERY_EVENT, markSuspect)
}

function createContext(): AudioContext {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('Web Audio API is not available')
  return new Ctor({ latencyHint: 'playback' })
}

async function resumeWithin(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'running') return
  await Promise.race([ctx.resume().catch(() => {}), waitMs(RESUME_TIMEOUT_MS)])
}

async function clockMoves(ctx: AudioContext): Promise<boolean> {
  const before = ctx.currentTime
  await waitMs(CLOCK_PROBE_MS)
  return ctx.currentTime > before
}

async function acquire(): Promise<AudioContext> {
  attachLifecycle()
  const existing = context
  if (existing && existing.state !== 'closed') {
    await resumeWithin(existing)
    // A hidden page's context is paused on purpose; judge it once the app is back.
    if (document.visibilityState !== 'visible') return existing
    if (existing.state === 'running' && (!suspect || (await clockMoves(existing)))) {
      suspect = false
      return existing
    }
    console.info(`[GameAudio] replacing a stuck audio context (state=${existing.state})`)
    void existing.close().catch(() => {})
  }
  const fresh = createContext()
  context = fresh
  suspect = false
  await resumeWithin(fresh)
  return fresh
}

/** The games' context, running — or replaced when it will not run. */
export function getGameAudioContext(): Promise<AudioContext> {
  if (!pending) {
    pending = acquire().finally(() => {
      pending = null
    })
  }
  return pending
}

/** Close it when Games shuts, so an idle context is not left holding the audio hardware. */
export function releaseGameAudioContext(): void {
  const current = context
  context = null
  suspect = false
  if (current && current.state !== 'closed') void current.close().catch(() => {})
}
