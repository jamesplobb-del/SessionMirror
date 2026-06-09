import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.besttake.app',
  appName: 'BestTake',
  webDir: 'dist',
  ios: {
    // Edge-to-edge on all iPhones; HUD uses env(safe-area-inset-*) for notch / island / home bar.
    contentInset: 'never',
    backgroundColor: '#000000',
    scrollEnabled: false,
  },
}

export default config
