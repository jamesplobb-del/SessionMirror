import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { loadAppSettings } from '../utils/appSettings'
import { HeyCatchScreen } from '../utils/heyCatch'
import type { QuickFunctionLaunchRequest, QuickToolDestination } from '../utils/quickTunerLaunch'
import AudioPracticeTopTabs from './audioPractice/AudioPracticeTopTabs'
import QuickTunerScreen from './QuickTunerScreen'
import QuickMetronomeScreen from './QuickMetronomeScreen'

/** Both shortcut destinations open the same shell, selecting their tool first. */
export default function QuickToolsScreen({ request, onExit }: {
  request: QuickFunctionLaunchRequest & { destination: QuickToolDestination }
  onExit: () => void
}) {
  const [activeTool, setActiveTool] = useState(request.destination)
  const [settings] = useState(loadAppSettings)

  useEffect(() => {
    const root = document.documentElement
    root.classList.add('app-audio-mode')
    root.classList.toggle('app-dark-mode', settings.darkMode)
    root.style.colorScheme = settings.darkMode ? 'dark' : 'light'
    return () => {
      root.classList.remove('app-audio-mode', 'app-dark-mode')
      root.style.removeProperty('color-scheme')
    }
  }, [settings.darkMode])

  return (
    <div className="quick-tools-screen app-ui-overlay--audio-mode">
      <HeyCatchScreen name={activeTool === 'tuner' ? 'Quick Tuner' : 'Quick Metronome'} />
      <header className="quick-tuner-header">
        <button type="button" className="quick-tuner-icon-button" onClick={onExit} aria-label="Return to BestTake">
          <ArrowLeft aria-hidden />
        </button>
        <div><p>BestTake</p><h1>Quick Tools</h1></div>
      </header>
      <AudioPracticeTopTabs activeTab={activeTool} includeMusic={false} includeGames={false}
        onTabChange={tab => {
          if (tab === 'tuner' || tab === 'metronome') setActiveTool(tab)
        }} />
      <div className="quick-tools-content">
        {activeTool === 'tuner'
          ? <QuickTunerScreen request={request} onExit={onExit} embedded />
          : <QuickMetronomeScreen request={request} onExit={onExit} embedded />}
      </div>
    </div>
  )
}
