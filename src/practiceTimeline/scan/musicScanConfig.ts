/**
 * Music Scan environment and mode resolution.
 *
 * SECURITY:
 * - VITE_OPENAI_API_KEY and VITE_MUSIC_SCAN_MODEL are for LOCAL DEVELOPMENT ONLY (.env.local).
 * - Never set VITE_OPENAI_API_KEY in production build environments.
 * - Production must use VITE_MUSIC_SCAN_API_URL so the backend holds the OpenAI key.
 * - Optional settings toggle `musicScanDevMode` allows the bundled key on device test builds only.
 */

import { getMusicScanDevApiKey, isMusicScanDevModeEnabled } from '../../utils/appSettings'

export type MusicScanMode = 'backend' | 'local-dev' | 'demo'

const LOG_LABEL = 'Music Scan:'

let startupLogged = false

function allowEnvOpenAiKey(): boolean {
  if (!import.meta.env.PROD) return true
  return isMusicScanDevModeEnabled()
}

export function getMusicScanBackendUrl(): string | undefined {
  const url = import.meta.env.VITE_MUSIC_SCAN_API_URL
  return typeof url === 'string' && url.trim().length > 0 ? url.trim() : undefined
}

/**
 * OpenAI key from Settings paste, then VITE_OPENAI_API_KEY (.env.local / build).
 * In production, requires Music Scan Dev Mode unless using the dev server.
 */
export function getLocalOpenAiApiKey(): string | undefined {
  const pasted = getMusicScanDevApiKey()
  if (pasted) {
    if (import.meta.env.PROD && !isMusicScanDevModeEnabled()) return undefined
    return pasted
  }

  if (!allowEnvOpenAiKey()) return undefined

  const key = import.meta.env.VITE_OPENAI_API_KEY
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : undefined
}

/** LOCAL DEVELOPMENT ONLY — model for direct OpenAI calls on the dev machine. */
export function getLocalMusicScanModel(): string {
  const model = import.meta.env.VITE_MUSIC_SCAN_MODEL
  return typeof model === 'string' && model.trim().length > 0 ? model.trim() : 'gpt-4o'
}

export function resolveMusicScanMode(): MusicScanMode {
  if (getMusicScanBackendUrl()) return 'backend'
  if (getLocalOpenAiApiKey()) return 'local-dev'
  return 'demo'
}

export function isMusicScanConfigured(): boolean {
  return resolveMusicScanMode() !== 'demo'
}

export function musicScanModeLabel(mode: MusicScanMode): string {
  switch (mode) {
    case 'backend':
      return `${LOG_LABEL} Backend Mode`
    case 'local-dev':
      if (import.meta.env.PROD && isMusicScanDevModeEnabled()) {
        return `${LOG_LABEL} Local Development Mode (Settings Dev Mode)`
      }
      return `${LOG_LABEL} Local Development Mode`
    case 'demo':
      return `${LOG_LABEL} Demo Mode`
  }
}

/** Warn once at startup if a production bundle includes a frontend API key. */
export function warnOnProductionFrontendApiKey(): void {
  if (!import.meta.env.PROD) return

  const hasFrontendKey =
    typeof import.meta.env.VITE_OPENAI_API_KEY === 'string' &&
    import.meta.env.VITE_OPENAI_API_KEY.trim().length > 0

  if (!hasFrontendKey) return

  if (isMusicScanDevModeEnabled()) {
    console.warn(
      `${LOG_LABEL} Dev Mode is ON — using bundled VITE_OPENAI_API_KEY on this device. ` +
        'Disable before App Store release.',
    )
    return
  }

  console.warn(
    `${LOG_LABEL} Frontend API keys are not allowed in production. ` +
      'This build includes VITE_OPENAI_API_KEY — real scanning is disabled. ' +
      'Enable Music Scan Dev Mode in Settings for on-device testing, or configure VITE_MUSIC_SCAN_API_URL.',
  )
}

/** Log the active scan mode (startup + before each scan). */
export function logMusicScanMode(context: 'startup' | 'scan' = 'scan'): void {
  warnOnProductionFrontendApiKey()

  const mode = resolveMusicScanMode()

  if (context === 'startup') {
    if (startupLogged) return
    startupLogged = true
  }

  console.info(musicScanModeLabel(mode))

  if (mode === 'local-dev' && !import.meta.env.PROD) {
    console.warn(
      `${LOG_LABEL} VITE_OPENAI_API_KEY is for local testing on your machine only. ` +
        'Never ship production builds with this variable set.',
    )
  }

  if (mode === 'demo' && import.meta.env.PROD && !getMusicScanBackendUrl()) {
    const hasKey =
      typeof import.meta.env.VITE_OPENAI_API_KEY === 'string' &&
      import.meta.env.VITE_OPENAI_API_KEY.trim().length > 0
    if (hasKey && !isMusicScanDevModeEnabled()) {
      console.warn(
        `${LOG_LABEL} Enable Music Scan Dev Mode in Settings to use your API key on this device.`,
      )
    } else if (!hasKey) {
      console.warn(
        `${LOG_LABEL} No backend endpoint configured. Set VITE_MUSIC_SCAN_API_URL for production scanning.`,
      )
    }
  }
}

export function musicScanSetupNotice(): string {
  const mode = resolveMusicScanMode()
  if (mode === 'backend') {
    return 'Using your scan backend for analysis.'
  }
  if (mode === 'local-dev') {
    if (getMusicScanDevApiKey()) {
      return 'Dev Mode — using API key from Settings.'
    }
    if (import.meta.env.PROD) {
      return 'Dev Mode — using API key from this build.'
    }
    return 'Local development mode — using VITE_OPENAI_API_KEY from .env.local.'
  }
  if (import.meta.env.PROD) {
    if (isMusicScanDevModeEnabled()) {
      return 'Paste your OpenAI API key in Settings → Music Scan Dev Mode to run real scans.'
    }
    return 'Demo draft only. Configure VITE_MUSIC_SCAN_API_URL for production scanning.'
  }
  return 'Demo draft only. Add VITE_OPENAI_API_KEY to .env.local for local testing, or VITE_MUSIC_SCAN_API_URL for backend mode.'
}

// Run production key check when the scan module loads.
warnOnProductionFrontendApiKey()
logMusicScanMode('startup')
