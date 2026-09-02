import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/drone-keyboard.css'
import './styles/drone-sound-wheel.css'
import './styles/practice-system.css'
import './styles/quick-tuner.css'
import './styles/pitch-insights.css'
import RootRouter from './RootRouter.tsx'
import AppErrorBoundary from './components/ui/AppErrorBoundary.tsx'
import { primeWebStatusBarChrome } from './utils/nativeStatusBar'
import { registerAppForegroundLifecycle } from './utils/appForeground'
import { initializeQuickTunerLaunch } from './utils/quickTunerLaunch'
import { initCrashReporting } from './utils/crashReporting'

async function bootstrap() {
  // First thing, before any other init — anything that throws during boot
  // (filesystem, SQLite, quick-tuner launch) should still get reported.
  initCrashReporting()

  const rootEl = document.getElementById('root')
  if (!rootEl) return

  primeWebStatusBarChrome()
  registerAppForegroundLifecycle()

  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <RootRouter />
      </AppErrorBoundary>
    </StrictMode>,
  )

  // Mount the application before asking the native quick-launch bridge for a
  // pending request. A stalled plugin call must never leave WKWebView showing
  // its black, pre-React canvas after a cold launch or foreground resume.
  void initializeQuickTunerLaunch()
}

void bootstrap()
