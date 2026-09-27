import { requirePlus } from '../plus/plusAccess'
import { useCallback, useState } from 'react'
import {
  DEFAULT_APP_SETTINGS,
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
    setSettings({ ...DEFAULT_APP_SETTINGS })
    saveAppSettings(DEFAULT_APP_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings }
}
