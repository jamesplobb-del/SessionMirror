import { useEffect } from 'react'
import { applyDarkHudStatusBar, applyLightAudioStatusBar } from '../utils/nativeStatusBar'
import { registerKeepAwakeLifecycle, setKeepAwakeDesired } from '../utils/keepScreenAwake'

interface UseAppShellPoliciesOptions {
  keepAwake: boolean
  /** Re-apply status bar after HUD surface changes (sheets / review). */
  hudSurface: 'idle' | 'sheet' | 'review'
  lightStatusBarSurface?: boolean
}

export function useAppShellPolicies({
  keepAwake,
  hudSurface,
  lightStatusBarSurface = false,
}: UseAppShellPoliciesOptions): void {
  useEffect(() => {
    registerKeepAwakeLifecycle()
    void (lightStatusBarSurface ? applyLightAudioStatusBar() : applyDarkHudStatusBar())
  }, [lightStatusBarSurface])

  useEffect(() => {
    void (lightStatusBarSurface ? applyLightAudioStatusBar() : applyDarkHudStatusBar())
  }, [hudSurface, lightStatusBarSurface])

  useEffect(() => {
    setKeepAwakeDesired(keepAwake)
    return () => setKeepAwakeDesired(false)
  }, [keepAwake])
}
