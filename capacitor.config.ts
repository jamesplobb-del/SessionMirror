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
    allowNavigation: [
      '*.youtube.com',
      '*.youtu.be',
      'stalwart-salamander-9451ab.netlify.app',
      'singular-manatee-b52df8.netlify.app',
    ],
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
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: true,
    },
  },
}

export default config
