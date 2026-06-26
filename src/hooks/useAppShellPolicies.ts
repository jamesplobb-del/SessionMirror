import { useEffect } from 'react'
import { applyDarkHudStatusBar } from '../utils/nativeStatusBar'
import { registerKeepAwakeLifecycle, setKeepAwakeDesired } from '../utils/keepScreenAwake'

interface UseAppShellPoliciesOptions {
  keepAwake: boolean
  /** Re-apply status bar after HUD surface changes (sheets / review). */
  hudSurface: 'idle' | 'sheet' | 'review'
}

export function useAppShellPolicies({ keepAwake, hudSurface }: UseAppShellPoliciesOptions): void {
  useEffect(() => {
    registerKeepAwakeLifecycle()
    void applyDarkHudStatusBar()
  }, [])

  useEffect(() => {
    void applyDarkHudStatusBar()
  }, [hudSurface])

  useEffect(() => {
    setKeepAwakeDesired(keepAwake)
    return () => setKeepAwakeDesired(false)
  }, [keepAwake])
}
