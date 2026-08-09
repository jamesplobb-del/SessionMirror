/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json — used as the Sentry release. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Sentry DSN. Unset means crash reporting is disabled (local dev). */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
