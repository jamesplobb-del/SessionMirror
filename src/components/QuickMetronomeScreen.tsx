import { SplashScreen } from '@capacitor/splash-screen'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { MetronomeProvider } from '../context/MetronomeContext'
import { useMetronome } from '../hooks/useMetronome'
import { loadAppSettings } from '../utils/appSettings'
import { triggerLightHaptic } from '../utils/haptics'
import { applyDarkHudStatusBar } from '../utils/nativeStatusBar'
import type { QuickFunctionLaunchRequest } from '../utils/quickTunerLaunch'
import AudioMetronomeTab from './audioPractice/AudioMetronomeTab'

interface QuickMetronomeScreenProps {
  request: QuickFunctionLaunchRequest
  onExit: () => void
}

function QuickMetronomeContent({
  hapticFeedback,
  onExit,
}: {
  hapticFeedback: boolean
  onExit: () => void
}) {
  const { playing, stop } = useMetronome()

  useEffect(() => () => stop(), [stop])

  const handleExit = useCallback(() => {
    triggerLightHaptic(hapticFeedback)
    stop()
    onExit()
  }, [hapticFeedback, onExit, stop])

  return (
    <main className="quick-metronome-screen app-ui-overlay--audio-mode app-ui-overlay--audio-practice-metronome">
      <header className="quick-tuner-header">
        <button
          type="button"
          className="quick-tuner-icon-button"
          onClick={handleExit}
          aria-label="Return to BestTake"
        >
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <p>BestTake</p>
          <h1>Quick Metronome</h1>
        </div>
        <span className={`quick-metronome-status ${playing ? 'quick-metronome-status--playing' : ''}`}>
          <span aria-hidden />
          {playing ? 'Playing' : 'Ready'}
        </span>
      </header>

      <section className="quick-metronome-stage" aria-label="Quick Metronome">
        <AudioMetronomeTab />
      </section>

      <footer className="quick-metronome-footer">
        <button type="button" className="quick-tuner-return" onClick={handleExit}>
          Return to BestTake
        </button>
      </footer>
    </main>
  )
}

export default function QuickMetronomeScreen({
  request,
  onExit,
}: QuickMetronomeScreenProps) {
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

  useEffect(() => {
    console.info('[QuickAccess] lightweight metronome shell mounted', {
      source: request.source,
      coldLaunch: request.coldLaunch,
    })
    void applyDarkHudStatusBar()
    void SplashScreen.hide().catch(() => {})
    return () => {
      console.info('[QuickAccess] lightweight metronome shell unmounted', {
        source: request.source,
      })
    }
  }, [request.coldLaunch, request.source])

  return (
    <MetronomeProvider muteDuringPlayback={false}>
      <QuickMetronomeContent
        hapticFeedback={settings.hapticFeedback}
        onExit={onExit}
      />
    </MetronomeProvider>
  )
}
