import { Capacitor } from '@capacitor/core'

const STATUS_BAR_BG = '#000000'

/** Light status-bar icons on the dark BestTake HUD (Capacitor Style.Dark). */
export async function applyDarkHudStatusBar(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: STATUS_BAR_BG })
  } catch {
    // Status bar plugin may be unavailable in web dev or before native sync.
  }
}

/** Call as early as possible so launch/boot never flash a light chrome. */
export function primeWebStatusBarChrome(): void {
  if (typeof document === 'undefined') return

  const html = document.documentElement
  const body = document.body
  html.style.backgroundColor = STATUS_BAR_BG
  body.style.backgroundColor = STATUS_BAR_BG
  html.classList.add('native-dark-chrome')
}
