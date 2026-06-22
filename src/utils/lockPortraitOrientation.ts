import { Capacitor } from '@capacitor/core'

export async function lockPortraitOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch {
    /* orientation lock unavailable */
  }
}

export async function unlockAppOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.unlock()
  } catch {
    /* orientation unlock unavailable */
  }
}

/** Portrait HUD by default; expand/split view allows device rotation for landscape takes. */
export async function syncAppOrientationLock(splitViewOpen: boolean): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fba730'},body:JSON.stringify({sessionId:'fba730',location:'lockPortraitOrientation.ts:syncAppOrientationLock',message:'orientation lock sync',data:{splitViewOpen,action:splitViewOpen?'unlock':'lock'},timestamp:Date.now(),hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  if (splitViewOpen) {
    await unlockAppOrientation()
    return
  }
  await lockPortraitOrientation()
}
