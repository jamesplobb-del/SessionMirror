import { Capacitor } from '@capacitor/core'
import { agentDebugLog } from './agentDebugLog'

export async function lockPortraitOrientation(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation')
    await ScreenOrientation.lock({ orientation: 'portrait' })
    // #region agent log
    agentDebugLog(
      'lockPortraitOrientation.ts',
      'portrait orientation locked',
      { platform: Capacitor.getPlatform() },
      'H-O5',
    )
    // #endregion
  } catch (err) {
    // #region agent log
    agentDebugLog(
      'lockPortraitOrientation.ts',
      'portrait lock failed',
      { error: err instanceof Error ? err.message : String(err) },
      'H-O5',
    )
    // #endregion
  }
}
