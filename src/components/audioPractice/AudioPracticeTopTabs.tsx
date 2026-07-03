import { Fragment } from 'react'
import type { AudioPracticeTab } from '../../types/audioPractice'
import Pressable from '../ui/Pressable'

const TABS: { id: AudioPracticeTab; label: string }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'practice', label: 'Practice' },
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
      {TABS.map((tab, index) => {
        const isActive = activeTab === tab.id
        return (
          <Fragment key={tab.id}>
            {index > 0 ? <span className="audio-practice-top-tabs__divider" aria-hidden /> : null}
            <Pressable
              type="button"
              intensity="soft"
              squish={false}
              haptic="light"
              onClick={() => onTabChange(tab.id)}
              className={`audio-practice-top-tabs__btn ${isActive ? 'audio-practice-top-tabs__btn--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </Pressable>
          </Fragment>
        )
      })}
    </nav>
  )
}
