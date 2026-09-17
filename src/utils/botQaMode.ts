/**
 * Dev-only Grok Bot QA mode.
 *
 * On only while Vite is in `npm run dev`, and only when the page is opened
 * with `?qa=1` (or sessionStorage already holds the flag from this tab).
 * Production and `ios:refresh` builds inline `import.meta.env.DEV` as
 * false, so every branch behind `BOT_QA_MODE` is dead code with no runtime
 * toggle left in the bundle.
 *
 * This does not replace a horn or a camera. It seeds fake video takes and
 * turns on the games' existing synthetic-pitch input so a bot can walk
 * Multitrack and Practice Games without a mic.
 */
export const BOT_QA_STORAGE_KEY = 'sessionmirror:bot-qa'
export const BOT_QA_TAKE_ID_PREFIX = 'bot-qa-take-'

function readBotQaFlag(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('qa') === '1') return true
    return window.sessionStorage.getItem(BOT_QA_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const BOT_QA_MODE = import.meta.env.DEV && readBotQaFlag()

export type BotQaSurface = 'games' | 'multitrack' | null

export function readBotQaSurface(): BotQaSurface {
  if (!BOT_QA_MODE || typeof window === 'undefined') return null
  try {
    const surface = new URLSearchParams(window.location.search).get('surface')
    if (surface === 'games' || surface === 'multitrack') return surface
  } catch {
    /* ignore */
  }
  return null
}

/** Remember `?qa=1` across in-app navigation that drops the query string. */
export function persistBotQaFlag(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return
  try {
    if (new URLSearchParams(window.location.search).get('qa') === '1') {
      window.sessionStorage.setItem(BOT_QA_STORAGE_KEY, '1')
    }
  } catch {
    /* private mode / quota */
  }
}

export function isBotQaTakeId(id: string): boolean {
  return id.startsWith(BOT_QA_TAKE_ID_PREFIX)
}
