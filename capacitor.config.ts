import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.besttake.app',
  appName: 'BestTake',
  webDir: 'dist',
  // Keep bundled assets on capacitor://localhost — do NOT set server.url to a
  // LAN IP or port; iOS WKWebView hides navigator.mediaDevices on those origins.
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  ios: {
    // Edge-to-edge on all iPhones; HUD uses env(safe-area-inset-*) for notch / island / home bar.
    contentInset: 'never',
    backgroundColor: '#000000',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
    },
  },
}

export default config
