import { requirePlus } from '../plus/plusAccess'
import { useCallback, useState } from 'react'
import {
  createResetAppSettings,
  loadAppSettingsForSessionStart,
  saveAppSettings,
  type AppSettings,
} from '../utils/appSettings'

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettingsForSessionStart())

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    if (patch.autoSoundRecording && !requirePlus('handsfree')) return
    if (patch.showMusic && !requirePlus('music')) return
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveAppSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    setSettings((current) => {
      const next = createResetAppSettings(current)
      saveAppSettings(next)
      return next
    })
  }, [])

  return { settings, updateSettings, resetSettings }
}
