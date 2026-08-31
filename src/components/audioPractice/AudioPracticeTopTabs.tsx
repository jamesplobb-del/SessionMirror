import type { AudioPracticeTab } from '../../types/audioPractice'
import Pressable from '../ui/Pressable'
import { requestInteractiveMediaRecovery } from '../../utils/appForeground'

/**
 * Practice deliberately has no tab. It is reached from the Program button in
 * the metronome transport — five tabs across the top of a phone was too many,
 * and Practice is where you go *from* a tempo, not a peer of it.
 */
const TABS: { id: AudioPracticeTab; label: string }[] = [
  { id: 'audio', label: 'Record' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'games', label: 'Games' },
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
            squish={false}
            haptic="light"
            onClick={() => {
              requestInteractiveMediaRecovery(`audio-top-tab:${tab.id}`)
              onTabChange(tab.id)
            }}
            data-tutorial={`audio-tab-${tab.id}`}
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
