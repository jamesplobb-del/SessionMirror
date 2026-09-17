/// <reference types="vite/client" />

/** Injected by vite.config.ts from package.json — used as the Sentry release. */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Sentry DSN. Unset means crash reporting is disabled (local dev). */
  readonly VITE_SENTRY_DSN?: string
  /** Compile-time games test input. Prefer `?qa=1` in `npm run dev`. */
  readonly VITE_GAME_TEST_INPUT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
