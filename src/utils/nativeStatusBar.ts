import { Capacitor } from '@capacitor/core'

const STATUS_BAR_BG = '#000000'
const LIGHT_STATUS_BAR_BG = '#ffffff'

let appliedLightBackground: boolean | null = null
let requestedLightBackground = false
let overlayConfigured = false
let pendingUpdate: Promise<void> | null = null

/** Serialize theme changes and coalesce duplicate sheet-open/close requests. */
function applyStatusBar(lightBackground: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  requestedLightBackground = lightBackground
  if (pendingUpdate) return pendingUpdate
  if (appliedLightBackground === lightBackground) return Promise.resolve()

  pendingUpdate = (async () => {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      if (!overlayConfigured) {
        await StatusBar.setOverlaysWebView({ overlay: true })
        overlayConfigured = true
      }
      while (appliedLightBackground !== requestedLightBackground) {
        const next = requestedLightBackground
        await StatusBar.setStyle({ style: next ? Style.Light : Style.Dark })
        // iOS draws the page under its overlay; Android owns a background bar.
        if (Capacitor.getPlatform() !== 'ios') {
          await StatusBar.setBackgroundColor({ color: next ? LIGHT_STATUS_BAR_BG : STATUS_BAR_BG })
        }
        appliedLightBackground = next
      }
    } catch {
      // Leave the value unapplied so a later request can retry.
      appliedLightBackground = null
    }
  })().finally(() => { pendingUpdate = null })
  return pendingUpdate
}

/** Light status-bar icons on the dark BestTake HUD (Capacitor Style.Dark). */
export async function applyDarkHudStatusBar(): Promise<void> {
  await applyStatusBar(false)
}

/** Dark status-bar icons over BestTake's light Audio Mode surface. */
export async function applyLightAudioStatusBar(): Promise<void> {
  await applyStatusBar(true)
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
