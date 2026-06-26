import type { AudioPracticeTab } from '../../types/audioPractice'
import Pressable from '../ui/Pressable'

const TABS: { id: AudioPracticeTab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'tuner', label: 'Tuner' },
]

interface AudioPracticeTopTabsProps {
  activeTab: AudioPracticeTab
  onTabChange: (tab: AudioPracticeTab) => void
}

export default function AudioPracticeTopTabs({
  activeTab,
  onTabChange,
}: AudioPracticeTopTabsProps) {
  return (
    <nav
      className="audio-practice-top-tabs pointer-events-auto"
      aria-label="Audio practice tools"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <Pressable
            key={tab.id}
            type="button"
            intensity="soft"
            onClick={() => onTabChange(tab.id)}
            className={`audio-practice-top-tabs__btn ${isActive ? 'audio-practice-top-tabs__btn--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Pressable>
        )
      })}
    </nav>
  )
}
