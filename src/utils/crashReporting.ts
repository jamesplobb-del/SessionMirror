import { Capacitor } from '@capacitor/core'
import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'

/**
 * Crash + error reporting.
 *
 * Captures three classes of failure:
 *   1. Uncaught JS errors and promise rejections (automatic)
 *   2. React render failures (see AppErrorBoundary)
 *   3. Native iOS crashes in the Swift plugins — camera, audio engines,
 *      SQLite — which would otherwise be completely invisible.
 *
 * Reporting is off unless VITE_SENTRY_DSN is set at build time, so local dev
 * and anyone building from a fresh clone sends nothing.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN

/** Absolute sandbox paths can embed user-entered project and take titles. */
const PATH_PATTERN =
  /(file:\/\/)?\/(?:var|private|Users)\/[^\s"')]+/gi

function scrubPaths<T extends string | undefined>(value: T): T {
  if (typeof value !== 'string') return value
  return value.replace(PATH_PATTERN, '<path>') as T
}

/**
 * Log prefixes emitted on a timer during normal operation. These are useful in
 * a live console but worthless as crash context, and they arrive fast enough to
 * push everything else out of the breadcrumb buffer.
 */
const HIGH_FREQUENCY_LOG_PREFIXES = [
  '[YouTubePlaybackProgress]',
  '[YouTubePlayAlongDiag]',
]

function isHighFrequencyDiagnostic(message: string | undefined): boolean {
  if (!message) return false
  return HIGH_FREQUENCY_LOG_PREFIXES.some((prefix) => message.startsWith(prefix))
}

let initialized = false

export function initCrashReporting(): void {
  if (initialized || !DSN) return
  initialized = true

  Sentry.init(
    {
      dsn: DSN,
      environment: import.meta.env.MODE,
      release: `besttake@${__APP_VERSION__}`,

      // Native crash capture only makes sense on device.
      enableNative: Capacitor.isNativePlatform(),

      // --- Quota -----------------------------------------------------------
      // Errors only. Performance tracing would burn the free tier without
      // telling us anything we need before launch.
      tracesSampleRate: 0,

      // --- Privacy ---------------------------------------------------------
      // BestTake records video and audio of the user, so Session Replay would
      // capture the live camera preview. It is off because `replayIntegration`
      // is never added below — do not add it. (Sample-rate options are not
      // accepted here; replay is integration-gated in Sentry v10.)
      sendDefaultPii: false,

      beforeSend(event) {
        for (const exception of event.exception?.values ?? []) {
          exception.value = scrubPaths(exception.value)
        }
        event.message = scrubPaths(event.message)
        return event
      },

      beforeBreadcrumb(breadcrumb) {
        // Play-along diagnostics fire every ~2s for the whole recording. Sentry
        // keeps only the last 100 breadcrumbs, so a few minutes of recording
        // would evict the entire trail leading up to the crash. Drop them from
        // the trail but leave the console calls intact for local debugging.
        if (isHighFrequencyDiagnostic(breadcrumb.message)) return null

        breadcrumb.message = scrubPaths(breadcrumb.message)
        return breadcrumb
      },
    },
    SentryReact.init,
  )

  Sentry.setTag('platform', Capacitor.getPlatform())
}

/** Report a caught error that we handled but still want visibility into. */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

/**
 * Test helper: JS error path.
 * Confirms DSN, network, and release tagging are working.
 */
export function sendTestCrash(): void {
  if (!initialized) {
    console.warn('[crashReporting] not initialized — VITE_SENTRY_DSN missing?')
    return
  }
  Sentry.captureException(new Error('BestTake test crash — JS pipeline check'))
  console.info('[crashReporting] test event sent — check Sentry in ~30s')
}

/**
 * Test helper: native iOS crash path.
 *
 * This is a DIFFERENT pipeline from sendTestCrash() — it verifies the native
 * SDK that catches Swift crashes in the camera/audio/SQLite plugins, which is
 * the main reason Sentry is here at all.
 *
 * Expect the app to die immediately. The report is written to disk and only
 * uploaded on the NEXT launch, so reopen the app before checking Sentry.
 */
export function sendTestNativeCrash(): void {
  if (!initialized) {
    console.warn('[crashReporting] not initialized — VITE_SENTRY_DSN missing?')
    return
  }
  Sentry.nativeCrash()
}

/**
 * Exposed so both paths can be triggered from Safari Web Inspector against a
 * real device build (including TestFlight) without shipping a debug button:
 *
 *   __besttakeSentryTest.js()      -> handled JS error
 *   __besttakeSentryTest.native()  -> hard native crash
 *
 * Safe to delete once you've verified the pipeline.
 */
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__besttakeSentryTest = {
    js: sendTestCrash,
    native: sendTestNativeCrash,
    isInitialized: () => initialized,
  }
}
