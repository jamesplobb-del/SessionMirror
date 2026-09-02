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
      // BestTake records video and audio of the user. Do not install Sentry's
      // Replay integration: it could capture the live camera preview. The
      // Capacitor SDK does not accept the browser-only replay sampling keys.
      sendDefaultPii: false,

      beforeSend(event) {
        for (const exception of event.exception?.values ?? []) {
          exception.value = scrubPaths(exception.value)
        }
        event.message = scrubPaths(event.message)
        return event
      },

      beforeBreadcrumb(breadcrumb) {
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
 * Force a test crash so you can confirm the pipeline end to end.
 * Call once from a dev build, verify it lands in Sentry, then remove the call.
 */
export function sendTestCrash(): void {
  if (!initialized) {
    console.warn('[crashReporting] not initialized — VITE_SENTRY_DSN missing?')
    return
  }
  Sentry.captureException(new Error('BestTake test crash — pipeline check'))
}
