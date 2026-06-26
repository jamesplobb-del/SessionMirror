import { useCallback, useState } from 'react'
import type { AudioPracticeTab } from '../types/audioPractice'

function logAudioTab(tab: AudioPracticeTab): void {
  if (!import.meta.env.DEV) return
  console.log(`[AudioTabs] activeTab=${tab}`)
}

export function useAudioPracticeTab() {
  const [activeTab, setActiveTab] = useState<AudioPracticeTab>('audio')

  const setActiveTabSafe = useCallback((tab: AudioPracticeTab) => {
    logAudioTab(tab)
    setActiveTab(tab)
  }, [])

  const resetToAudioTab = useCallback(() => {
    setActiveTab((current) => {
      if (current === 'audio') return current
      logAudioTab('audio')
      return 'audio'
    })
  }, [])

  return {
    activeTab,
    setActiveTab: setActiveTabSafe,
    resetToAudioTab,
  }
}
