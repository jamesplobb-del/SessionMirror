import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.besttake.app',
  appName: 'BestTake',
  webDir: 'dist',
  ios: {
    // Edge-to-edge webview; HUD uses env(safe-area-inset-*) for Dynamic Island / home bar.
    contentInset: 'never',
  },
}

export default config
