import { useCallback, useState } from 'react'
import type { AudioPracticeTab } from '../types/audioPractice'

export function useAudioPracticeTab() {
  const [activeTab, setActiveTab] = useState<AudioPracticeTab>('audio')

  const setActiveTabSafe = useCallback((tab: AudioPracticeTab) => {
    setActiveTab(tab)
  }, [])

  const resetToAudioTab = useCallback(() => {
    setActiveTab('audio')
  }, [])

  return {
    activeTab,
    setActiveTab: setActiveTabSafe,
    resetToAudioTab,
  }
}
