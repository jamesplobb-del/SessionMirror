/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * LOCAL DEVELOPMENT ONLY — OpenAI key for direct browser vision calls.
   * Set in `.env.local` on your machine. Never enable in production CI/build.
   */
  readonly VITE_OPENAI_API_KEY?: string
  /**
   * LOCAL DEVELOPMENT ONLY — model for direct OpenAI calls (default: gpt-4o).
   */
  readonly VITE_MUSIC_SCAN_MODEL?: string
  /**
   * Production scan endpoint. Backend owns the API key, model, rate limits, and validation.
   * Takes precedence over VITE_OPENAI_API_KEY in all environments.
   */
  readonly VITE_MUSIC_SCAN_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
