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

/** Portrait-locked shell everywhere — same as main camera (tilt for landscape takes, UI stays upright). */
export async function syncAppOrientationLock(_splitViewOpen?: boolean): Promise<void> {
  // #region agent log
  fetch('http://127.0.0.1:7760/ingest/cf1144c0-2f47-446c-a070-41f2b49db454',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'fba730'},body:JSON.stringify({sessionId:'fba730',location:'lockPortraitOrientation.ts:syncAppOrientationLock',message:'orientation lock sync',data:{action:'lock',splitViewOpen:_splitViewOpen??false},timestamp:Date.now(),runId:'post-fix',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  await lockPortraitOrientation()
}
