import { useOptimistic, useTransition, type CSSProperties } from 'react'
import type { AudioPracticeTab } from '../../types/audioPractice'
import Pressable from '../ui/Pressable'

/**
 * Practice deliberately has no tab. It is reached from the Program button in
 * the metronome transport — five tabs across the top of a phone was too many,
 * and Practice is where you go *from* a tempo, not a peer of it.
 */
const TABS: { id: AudioPracticeTab; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'tuner', label: 'Tuner' },
  { id: 'metronome', label: 'Metronome' },
  { id: 'games', label: 'Games' },
]

interface AudioPracticeTopTabsProps {
  /** Historical navigation for the isolated appearance comparison. */
  includeRecording?: boolean
  includeGames?: boolean
  onBackToRecording?: () => void
  activeTab: AudioPracticeTab
  onTabChange: (tab: AudioPracticeTab) => void
}

export default function AudioPracticeTopTabs({
  includeRecording = false,
  includeGames = true,
  onBackToRecording,
  activeTab,
  onTabChange,
}: AudioPracticeTopTabsProps) {
  const [pending, startTabTransition] = useTransition()
  const [selectedTab, setSelectedTab] = useOptimistic(activeTab)
  const toolTabs = includeGames ? TABS : TABS.filter(tab => tab.id !== 'games')
  const tabs = includeRecording ? [{ id: 'audio' as const, label: 'Record' }, ...toolTabs] : toolTabs
  return (
    <>
    {onBackToRecording && <button className="tools-record-return" onClick={onBackToRecording}>‹ Recording</button>}
    <nav
      className="audio-practice-top-tabs pointer-events-auto"
      aria-label="Audio practice tools"
      aria-busy={pending}
      style={{ '--tool-tab-count': tabs.length, '--electric-tab-index': Math.max(0,tabs.findIndex(tab => tab.id === selectedTab)) } as CSSProperties}
    >
      {tabs.map((tab) => {
        const isActive = selectedTab === tab.id
        return (
          <Pressable
            key={tab.id}
            type="button"
            intensity="soft"
            squish={false}
            haptic="light"
            onClick={() => {
              if (isActive) return
              // Tuner (and other media tabs) must change in this tap so native
              // mic startup still counts as a user gesture on iPhone. Only the
              // optimistic highlight is interruptible.
              onTabChange(tab.id)
              startTabTransition(() => {
                setSelectedTab(tab.id)
              })
            }}
            data-tutorial={`audio-tab-${tab.id}`}
            className={`audio-practice-top-tabs__btn ${isActive ? 'audio-practice-top-tabs__btn--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            aria-label={tab.id === 'games' ? 'Games, beta' : undefined}
          >
            {tab.label}
            {tab.id === 'games' ? (
              <span className="audio-practice-top-tabs__beta"> Beta</span>
            ) : null}
          </Pressable>
        )
      })}
    </nav>
    </>
  )
}
