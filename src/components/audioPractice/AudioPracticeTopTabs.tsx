import { Fragment } from 'react'
import type { AudioPracticeTab } from '../../types/audioPractice'
import Pressable from '../ui/Pressable'
import { requestInteractiveMediaRecovery } from '../../utils/appForeground'

/**
 * Practice deliberately has no tab. It is reached from the Program button in
 * the metronome transport — five tabs across the top of a phone was too many,
 * and Practice is where you go *from* a tempo, not a peer of it.
 */
const TABS: { id: AudioPracticeTab; label: string; beta?: boolean }[] = [
  { id: 'audio', label: 'Audio' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'games', label: 'Games', beta: true },
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
              onClick={() => {
                requestInteractiveMediaRecovery(`audio-top-tab:${tab.id}`)
                onTabChange(tab.id)
              }}
              data-tutorial={`audio-tab-${tab.id}`}
              className={`audio-practice-top-tabs__btn ${isActive ? 'audio-practice-top-tabs__btn--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
              {tab.beta ? (
                <span className="audio-practice-top-tabs__beta"> (Beta)</span>
              ) : null}
            </Pressable>
          </Fragment>
        )
      })}
    </nav>
  )
}
