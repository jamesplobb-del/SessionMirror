/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_MUSIC_SCAN_API_KEY?: string
  readonly VITE_MUSIC_SCAN_API_URL?: string
  readonly VITE_MUSIC_SCAN_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
