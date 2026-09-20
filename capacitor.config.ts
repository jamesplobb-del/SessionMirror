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
    // Explicitly expose only the opt-in investigation build to Safari.
    ...(process.env.VITE_TUNER_DIAGNOSTICS === '1' ? { webContentsDebuggingEnabled: true } : {}),
    // Edge-to-edge on all iPhones; HUD uses env(safe-area-inset-*) for notch / island / home bar.
    contentInset: 'never',
    backgroundColor: '#f8fbff',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      // Keep the light storyboard visible until AppBootGate explicitly hides it.
      launchShowDuration: 3000,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: true,
    },
  },
}

export default config
